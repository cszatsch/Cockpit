import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { assembleJevPrompt, JEV_PERSONA, JEV_SYSTEM_PROMPT } from '../domain/jev-prompt';

/**
 * Prompt système de Jev, relu à chaque réponse (spécification SKILLS § 6) : une skill activée ou
 * désactivée s'applique dès la réponse suivante.
 */
@Injectable()
export class JevPromptService {
  constructor(private readonly prisma: PrismaService) {}

  async systemPrompt(): Promise<string> {
    const skills = await this.prisma.skill.findMany({ where: { on: true }, orderBy: { position: 'asc' } });
    return assembleJevPrompt(JEV_SYSTEM_PROMPT, JEV_PERSONA, skills);
  }
}
