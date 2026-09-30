import { Injectable } from '@nestjs/common';
import { Persona } from '@prisma/client';
import { PrismaService } from './prisma.service';
import { assembleConsoleGuidancePrompt, assembleJevPrompt, consoleGuidanceParts, JEV_SYSTEM_PROMPT, PersonaText } from '../domain/jev-prompt';

/** Ligne `Persona` → forme de l'écran et du prompt (`{ identity, soul }`). */
export const personaText = (p: Persona): PersonaText => ({
  identity: { name: p.name, creature: p.creature, style: p.style, emoji: p.emoji, avatar: p.avatar, photo: p.photo },
  soul: p.soul,
});

/**
 * Prompt système de Jev, relu à chaque réponse (Persona § 6, Skills § 6) : prompt de base, Identité,
 * Personnalité (Soul), puis skills actives. Un Persona enregistré ou une skill activée / désactivée
 * s'applique dès la réponse suivante.
 */
@Injectable()
export class JevPromptService {
  constructor(private readonly prisma: PrismaService) {}

  async systemPrompt(): Promise<string> {
    const [persona, skills] = await Promise.all([
      this.prisma.persona.findUnique({ where: { id: 'jev' } }),
      this.prisma.skill.findMany({ where: { on: true }, orderBy: { position: 'asc' } }),
    ]);
    return assembleJevPrompt(JEV_SYSTEM_PROMPT, persona ? personaText(persona) : null, skills);
  }

  /** Prompt du Jev de la Console (fonction `guidage`) : une seule skill, celle du guidage, et la page ouverte. */
  /** Prompt de la Console en deux parties : stable (mise en cache) et page ouverte (partie variable). */
  async consolePromptParts(page: string): Promise<{ stable: string; page: string }> {
    const [persona, skills] = await Promise.all([
      this.prisma.persona.findUnique({ where: { id: 'jev' } }),
      this.prisma.skill.findMany({ where: { on: true }, orderBy: { position: 'asc' } }),
    ]);
    return consoleGuidanceParts(JEV_SYSTEM_PROMPT, persona ? personaText(persona) : null, skills, page);
  }

  async consolePrompt(page: string): Promise<string> {
    const [persona, skills] = await Promise.all([
      this.prisma.persona.findUnique({ where: { id: 'jev' } }),
      this.prisma.skill.findMany({ where: { on: true }, orderBy: { position: 'asc' } }),
    ]);
    return assembleConsoleGuidancePrompt(JEV_SYSTEM_PROMPT, persona ? personaText(persona) : null, skills, page);
  }
}
