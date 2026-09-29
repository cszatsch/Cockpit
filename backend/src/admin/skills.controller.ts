import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AdminOnly, Actor, CurrentActor } from '../core/auth/auth';
import { AuditService } from '../core/audit.service';
import { PrismaService } from '../core/prisma.service';
import { businessRule, conflict, notFound } from '../core/errors';
import { parse } from '../core/http';
import { adminCtx } from './profiles.service';
import { matchesSkillQuery, skillLimits, SKILL_PER_PAGE, SKILL_PER_PAGE_MAX, uniqueSkillName } from '../domain/jev-prompt';
import { Prisma, Skill } from '@prisma/client';

type Tx = Prisma.TransactionClient;

const Create = z.object({ n: z.string(), t: z.string().default(''), on: z.boolean().default(false) }).strict();
const Save = z.object({ n: z.string(), t: z.string() }).strict();
const Active = z.object({ on: z.boolean() }).strict();
const ListQuery = z
  .object({
    q: z.string().max(200).optional(),
    filtre: z.enum(['toutes', 'actives', 'desactivees', 'all', 'on', 'off']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    par_page: z.coerce.number().int().min(1).max(SKILL_PER_PAGE_MAX).optional(),
  })
  .strict();

/** Vue d'une skill : champs du composant `Skills.dc.html` (`id, n, t, on`) et suivi. */
const view = (s: Skill) => ({ id: s.id, n: s.n, t: s.t, on: s.on, position: s.position, updated_at: s.updatedAt.toISOString(), updated_by: s.updatedBy });
/** Valeurs tracées au journal (avant / après). */
const trace = (s: Skill) => ({ n: s.n, t: s.t, on: s.on });

/**
 * Skills de Jev (spécification SKILLS § 5, écran en tuiles) : consignes ajoutées au prompt système de Jev.
 * Nom obligatoire, 60 caractères au plus, unique sans tenir compte des majuscules ; texte ≤ 20 000 caractères.
 * Chaque création, modification, activation, désactivation et suppression est tracée (valeurs avant et après).
 */
@ApiTags('console · assistant')
@ApiBearerAuth()
@AdminOnly()
@Controller('api/assistant/skills')
export class SkillsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Sans paramètre : toutes les skills, dans l'ordre. Avec `q`, `filtre`, `page` (à partir de 1) ou `par_page` :
   * une page `{ items, total, toutes, actives, page, par_page }` (recherche insensible aux accents et aux majuscules).
   */
  @Get()
  async list(@Query() query: Record<string, unknown>) {
    const all = await this.prisma.skill.findMany({ orderBy: { position: 'asc' } });
    if (!Object.keys(query).length) return all.map(view);
    const p = parse(ListQuery, query);
    const f = p.filtre === 'actives' || p.filtre === 'on' ? 'on' : p.filtre === 'desactivees' || p.filtre === 'off' ? 'off' : 'all';
    const hits = all.filter((s) => (f === 'all' || (f === 'on' ? s.on : !s.on)) && matchesSkillQuery(s.n, p.q ?? ''));
    const per = p.par_page ?? SKILL_PER_PAGE;
    const pages = Math.max(1, Math.ceil(hits.length / per));
    const page = Math.min(p.page ?? 1, pages);
    return { items: hits.slice((page - 1) * per, page * per).map(view), total: hits.length, toutes: all.length, actives: all.filter((s) => s.on).length, page, par_page: per };
  }

  /** Création (en fin de liste). Un nom déjà pris reçoit un numéro (« Nouvelle skill 2 ») : l'écran crée toujours « Nouvelle skill ». */
  @Post()
  async create(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const input = parse(Create, body);
    this.check({ n: input.n.trim(), t: input.t });
    const s = await this.prisma.$transaction(async (db) => {
      const n = uniqueSkillName(input.n.trim(), (await db.skill.findMany({ select: { n: true } })).map((x) => x.n));
      this.check({ n, t: input.t });
      const last = await db.skill.aggregate({ _max: { position: true } });
      const s = await db.skill.create({ data: { n, t: input.t, on: input.on, position: (last._max.position ?? 0) + 1, updatedBy: actor.fullName } });
      await this.audit.action(db, adminCtx(actor), { action: 'Skill créée', target: `${s.n}${s.on ? ' · active' : ' · désactivée'}`, severity: 'SENSITIVE', entityType: 'Skill', entityId: s.id, details: { skill: s.n, avant: null, apres: trace(s) } });
      return s;
    });
    return view(s);
  }

  /** Enregistrer : nom et texte. 409 si une autre skill porte déjà ce nom (majuscules ignorées). */
  @Put(':id')
  async save(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(Save, body);
    const n = input.n.trim();
    this.check({ n, t: input.t });
    const s = await this.prisma.$transaction(async (db) => {
      const before = await this.find(db, id);
      await this.unique(db, n, id);
      const s = await db.skill.update({ where: { id }, data: { n, t: input.t, updatedBy: actor.fullName } });
      if (n !== before.n || input.t !== before.t) {
        const what = [n !== before.n ? `nom : ${before.n} → ${s.n}` : null, input.t !== before.t ? `texte : ${before.t.length} → ${s.t.length} car.` : null].filter(Boolean).join(' · ');
        await this.audit.action(db, adminCtx(actor), { action: 'Skill modifiée', target: `${s.n} · ${what}`, severity: 'SENSITIVE', entityType: 'Skill', entityId: id, details: { skill: s.n, avant: { n: before.n, t: before.t }, apres: { n: s.n, t: s.t } } });
      }
      return s;
    });
    return view(s);
  }

  /** Interrupteur : effet immédiat sur le prompt de Jev (réponse suivante). */
  @Patch(':id/active')
  async active(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const { on } = parse(Active, body);
    const s = await this.prisma.$transaction(async (db) => {
      const before = await this.find(db, id);
      const s = await db.skill.update({ where: { id }, data: { on, updatedBy: actor.fullName } });
      if (on !== before.on) await this.audit.action(db, adminCtx(actor), { action: on ? 'Skill activée' : 'Skill désactivée', target: s.n, severity: 'SENSITIVE', entityType: 'Skill', entityId: id, details: { skill: s.n, avant: { on: before.on }, apres: { on } } });
      return s;
    });
    return view(s);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentActor() actor: Actor, @Param('id') id: string) {
    await this.prisma.$transaction(async (db) => {
      const before = await this.find(db, id);
      await db.skill.delete({ where: { id } });
      await this.audit.action(db, adminCtx(actor), { action: 'Skill supprimée', target: `${before.n}${before.on ? ' · était active' : ''}`, severity: 'SENSITIVE', entityType: 'Skill', entityId: id, details: { skill: before.n, avant: trace(before), apres: null } });
    });
  }

  private async find(db: Tx, id: string) {
    const s = await db.skill.findUnique({ where: { id } });
    if (!s) throw notFound('Skill introuvable');
    return s;
  }

  private async unique(db: Tx, n: string, id: string) {
    // Comparaison en JavaScript : ILIKE ignore mal la casse des lettres accentuées (« RÉDIGER » ≠ « rédiger »).
    const other = (await db.skill.findMany({ where: { NOT: { id } }, select: { n: true } })).find((x) => x.n.toLocaleLowerCase('fr') === n.toLocaleLowerCase('fr'));
    if (other) throw conflict('SKILL_NOM_PRIS', `Une skill s’appelle déjà « ${other.n} »`);
  }

  /** Nom obligatoire (60 caractères), texte (20 000) : 422 sinon. */
  private check(v: { n: string; t: string }) {
    const e = skillLimits(v);
    if (!v.n) e.n = 'obligatoire';
    if (Object.keys(e).length) throw businessRule('Skill invalide', e);
  }
}
