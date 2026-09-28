import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { AdminOnly, Actor, CurrentActor } from '../core/auth/auth';
import { AuditService } from '../core/audit.service';
import { PrismaService } from '../core/prisma.service';
import { businessRule, notFound } from '../core/errors';
import { parse } from '../core/http';
import { adminCtx } from './profiles.service';
import { skillLimits, SKILL_UNNAMED } from '../domain/jev-prompt';
import { Skill } from '@prisma/client';

const Create = z.object({ n: z.string(), t: z.string().default(''), on: z.boolean().default(false) }).strict();
const Update = z.object({ n: z.string().optional(), t: z.string().optional(), on: z.boolean().optional() }).strict();

/** Vue d'une skill : champs du composant `Skills.dc.html` (`id, n, t, on`) et suivi. */
const view = (s: Skill) => ({ id: s.id, n: s.n, t: s.t, on: s.on, position: s.position, updated_at: s.updatedAt.toISOString(), updated_by: s.updatedBy });

/**
 * Skills de Jev (spécification SKILLS § 5) : consignes ajoutées au prompt système de Jev.
 * Nom ≤ 60 et texte ≤ 20 000 caractères (422 au-delà) ; chaque action est tracée au journal d'audit.
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

  @Get()
  async list() {
    return (await this.prisma.skill.findMany({ orderBy: { position: 'asc' } })).map(view);
  }

  @Post()
  async create(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const input = parse(Create, body);
    const n = input.n.trim() || SKILL_UNNAMED;
    this.limits({ n, t: input.t });
    const s = await this.prisma.$transaction(async (db) => {
      const last = await db.skill.aggregate({ _max: { position: true } });
      const s = await db.skill.create({ data: { n, t: input.t, on: input.on, position: (last._max.position ?? 0) + 1, updatedBy: actor.fullName } });
      await this.audit.action(db, adminCtx(actor), { action: 'Skill créée', target: `${s.n}${s.on ? ' · active' : ' · désactivée'}`, severity: 'SENSITIVE', entityType: 'Skill', entityId: s.id });
      return s;
    });
    return view(s);
  }

  /** Nom et texte (Enregistrer) ou activation (interrupteur, effet immédiat). */
  @Patch(':id')
  async update(@CurrentActor() actor: Actor, @Param('id') id: string, @Body() body: unknown) {
    const input = parse(Update, body);
    const before = await this.prisma.skill.findUnique({ where: { id } });
    if (!before) throw notFound('Skill introuvable');
    const n = input.n === undefined ? undefined : input.n.trim() || SKILL_UNNAMED;
    this.limits({ n, t: input.t });
    const s = await this.prisma.$transaction(async (db) => {
      const s = await db.skill.update({ where: { id }, data: { n, t: input.t, on: input.on, updatedBy: actor.fullName } });
      const ctx = adminCtx(actor);
      if ((n !== undefined && n !== before.n) || (input.t !== undefined && input.t !== before.t)) {
        const what = [n !== undefined && n !== before.n ? `nom : ${before.n} → ${s.n}` : null, input.t !== undefined && input.t !== before.t ? `texte : ${before.t.length} → ${s.t.length} car.` : null].filter(Boolean).join(' · ');
        await this.audit.action(db, ctx, { action: 'Skill modifiée', target: `${s.n} · ${what}`, severity: 'SENSITIVE', entityType: 'Skill', entityId: id });
      }
      if (input.on !== undefined && input.on !== before.on) {
        await this.audit.action(db, ctx, { action: input.on ? 'Skill activée' : 'Skill désactivée', target: s.n, severity: 'SENSITIVE', entityType: 'Skill', entityId: id });
      }
      return s;
    });
    return view(s);
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(@CurrentActor() actor: Actor, @Param('id') id: string) {
    const before = await this.prisma.skill.findUnique({ where: { id } });
    if (!before) throw notFound('Skill introuvable');
    await this.prisma.$transaction(async (db) => {
      await db.skill.delete({ where: { id } });
      await this.audit.action(db, adminCtx(actor), { action: 'Skill supprimée', target: `${before.n}${before.on ? ' · était active' : ''}`, severity: 'SENSITIVE', entityType: 'Skill', entityId: id });
    });
  }

  private limits(v: { n?: string; t?: string }) {
    const e = skillLimits(v);
    if (Object.keys(e).length) throw businessRule('Skill trop longue', e);
  }
}
