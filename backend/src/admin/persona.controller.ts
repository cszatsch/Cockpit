import { Body, Controller, Get, Param, Post, Put, Res, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AdminOnly, Actor, CurrentActor, Public } from '../core/auth/auth';
import { AuditService } from '../core/audit.service';
import { PrismaService } from '../core/prisma.service';
import { StorageService } from '../core/storage.service';
import { badRequest, businessRule, notFound } from '../core/errors';
import { parse } from '../core/http';
import { personaText } from '../core/jev-prompt.service';
import { adminCtx } from './profiles.service';
import { DEMO_PERSONA, personaErrors, PersonaText } from '../domain/jev-prompt';
import type { UploadedBlob } from '../import/import.controller';

/** Image importée pour l'avatar : 1 Mo au plus (spécification PERSONA § 2). */
export const PERSONA_PHOTO_MAX_BYTES = 1024 * 1024;
/** Formats acceptés, reconnus par leur signature (et non par le nom du fichier). */
const IMAGE_TYPES: Array<{ ext: string; mime: string; test: (b: Buffer) => boolean }> = [
  { ext: '.png', mime: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: '.jpg', mime: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: '.webp', mime: 'image/webp', test: (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP' },
];
const AVATAR_URL = '/api/assistant/persona/avatar/';
const MIME: Record<string, string> = Object.fromEntries(IMAGE_TYPES.map((t) => [t.ext, t.mime]));

const Body_ = z
  .object({
    identity: z.object({ name: z.string(), creature: z.string().default(''), style: z.string().default(''), emoji: z.string().default(''), avatar: z.string(), photo: z.string().nullable().default(null) }).strip(),
    soul: z.string().default(''),
  })
  .strip();

const view = (p: Parameters<typeof personaText>[0]) => ({ ...personaText(p), version: p.version, updated_at: p.updatedAt.toISOString(), updated_by: p.updatedBy });

/**
 * Persona de Jev (spécification PERSONA § 5) : un seul pour la plateforme. Chaque enregistrement est
 * tracé (« Persona modifié ») et l'état remplacé est conservé dans `PersonaVersion`.
 */
@ApiTags('console · assistant')
@ApiBearerAuth()
@AdminOnly()
@Controller('api/assistant/persona')
export class PersonaController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly storage: StorageService,
  ) {}

  @Get()
  async get() {
    return view(await this.current());
  }

  /** Identity et Soul enregistrés en une fois ; longueurs, avatar et emoji contrôlés (422). */
  @Put()
  async put(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const input = parse(Body_, body) as PersonaText;
    input.identity.name = input.identity.name.trim();
    const errors = personaErrors(input);
    // Photo : seule une image importée par l'API est acceptée (jamais une donnée brute ni une adresse externe).
    if (input.identity.photo && !/^\/api\/assistant\/persona\/avatar\/[0-9-]+\/[a-f0-9]+\.(png|jpg|webp)$/.test(input.identity.photo)) errors['identity.photo'] = 'image importée attendue';
    if (Object.keys(errors).length) throw businessRule('Persona invalide', errors);
    const before = await this.current();
    const i = input.identity;
    const p = await this.prisma.$transaction(async (db) => {
      await db.personaVersion.create({ data: { version: before.version, data: personaText(before) as unknown as Prisma.InputJsonValue, savedBy: actor.fullName } });
      const p = await db.persona.update({ where: { id: 'jev' }, data: { name: i.name, creature: i.creature, style: i.style, emoji: i.emoji, avatar: i.avatar, photo: i.photo, soul: input.soul, updatedBy: actor.fullName, version: { increment: 1 } } });
      const b = personaText(before);
      const changed = [
        ...(['name', 'creature', 'style', 'emoji', 'avatar', 'photo'] as const).filter((k) => b.identity[k] !== i[k]).map((k) => ({ name: 'nom', creature: 'créature', style: 'style', emoji: 'emoji', avatar: 'avatar', photo: 'image' })[k]),
        ...(b.soul !== input.soul ? [`soul (${b.soul.length} → ${input.soul.length} car.)`] : []),
      ];
      await this.audit.action(db, adminCtx(actor), { action: 'Persona modifié', target: `${p.name} · ${changed.join(', ') || 'aucun changement'} · version ${p.version}`, severity: 'SENSITIVE', entityType: 'Persona', entityId: 'jev' });
      return p;
    });
    return view(p);
  }

  /** Image de l'avatar (PNG, JPEG, WebP, 1 Mo au plus) → `{ url }`, à enregistrer dans `identity.photo`. */
  @Post('avatar')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 4 * PERSONA_PHOTO_MAX_BYTES } }))
  async avatar(@UploadedFile() file: UploadedBlob | undefined) {
    if (!file) throw badRequest('Fichier manquant', { file: 'image attendue (champ « file »)' });
    if (file.size > PERSONA_PHOTO_MAX_BYTES) throw businessRule('Image trop lourde (1 Mo maximum)', { file: '1 Mo maximum' });
    const type = IMAGE_TYPES.find((t) => t.test(file.buffer));
    if (!type) throw businessRule('Format non accepté', { file: 'PNG, JPEG ou WebP' });
    const key = await this.storage.put('persona', file.buffer, type.ext);
    return { url: AVATAR_URL + key.replace(/^persona\//, '') };
  }

  /** Lecture de l'image : publique (clé aléatoire, image non sensible), pour l'afficher sans en-tête d'authentification. */
  @Public()
  @Get('avatar/:day/:file')
  async avatarFile(@Param('day') day: string, @Param('file') file: string, @Res() res: Response) {
    if (!/^[0-9-]+$/.test(day) || !/^[a-f0-9]+\.(png|jpg|webp)$/.test(file)) throw notFound('Image introuvable');
    const buf = await this.storage.get(`persona/${day}/${file}`);
    if (!buf) throw notFound('Image introuvable');
    res.setHeader('Content-Type', MIME[file.slice(file.lastIndexOf('.'))]);
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.send(buf);
  }

  /** Versions précédentes (les plus récentes d'abord). */
  @Get('versions')
  async versions() {
    return (await this.prisma.personaVersion.findMany({ orderBy: { savedAt: 'desc' }, take: 50 })).map((v) => ({ id: v.id, version: v.version, savedAt: v.savedAt.toISOString(), savedBy: v.savedBy, ...(v.data as object) }));
  }

  /** Persona courant ; recréé avec la valeur initiale s'il manque (base vidée hors amorçage). */
  private async current() {
    const p = await this.prisma.persona.findUnique({ where: { id: 'jev' } });
    if (p) return p;
    const i = DEMO_PERSONA.identity;
    return this.prisma.persona.create({ data: { id: 'jev', name: i.name, creature: i.creature, style: i.style, emoji: i.emoji, avatar: i.avatar, photo: null, soul: DEMO_PERSONA.soul, updatedBy: 'Données initiales' } });
  }
}
