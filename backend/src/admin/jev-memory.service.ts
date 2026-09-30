import { Injectable } from '@nestjs/common';
import { JevConversation } from '@prisma/client';
import { PrismaService } from '../core/prisma.service';
import { LlmService } from '../core/llm.service';
import { ChatTurn } from '../core/llm-client';
import { notFound } from '../core/errors';
import { techId } from '../core/ids';
import { TodayService } from '../core/today.service';

/**
 * Mémoire conversationnelle du Jev de la Console (décision du 30/09/2026, `docs/ANALYSE - memoire conversationnelle
 * de Jev (Console).md`) : la conversation est stockée chez nous, par administrateur ; chaque question part avec les
 * derniers échanges (fenêtre glissante) et le résumé des plus anciens. Indépendant du fournisseur : le modèle de
 * secours reçoit le même historique.
 */
/** Échanges (question + réponse) envoyés au modèle avec chaque question. */
export const JEV_HISTORY_TURNS = 10;
/** Taille maximale de l'historique envoyé (caractères, ~4 000 jetons) : les échanges les plus anciens sortent d'abord. */
export const JEV_HISTORY_MAX_CHARS = 16_000;
/** Une réponse longue n'est reprise dans l'historique que tronquée. */
export const JEV_HISTORY_REPLY_MAX_CHARS = 2_000;
/** Le résumé est mis à jour quand ce nombre d'échanges dépasse la fenêtre (un appel pour plusieurs échanges). */
export const JEV_SUMMARY_BATCH_TURNS = 3;
export const JEV_SUMMARY_MAX_WORDS = 180;
/** Conversation supprimée après ce nombre de jours sans échange. */
export const JEV_CONVERSATION_RETENTION_DAYS = 30;

export interface JevMemory {
  history: ChatTurn[];
  summary: string | null;
}

const SUMMARY_SYSTEM = [
  'Tu tiens la mémoire d’une conversation entre un administrateur de la plateforme RISE et l’assistant Jev.',
  'Mets à jour le résumé avec les nouveaux échanges : sujet et objets en cours (projet, compte, modèle, carte…, avec leur code ou leur nom exact), faits établis, chiffres utiles, questions restées ouvertes.',
  `Écris en français, en ${JEV_SUMMARY_MAX_WORDS} mots au plus, en phrases courtes ou en liste. N’invente rien ; garde les noms et les codes tels quels ; pas de formule de politesse.`,
].join('\n');

@Injectable()
export class JevMemoryService {
  /** Dernière mise à jour du résumé lancée (les tests l'attendent). */
  pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly today: TodayService,
  ) {}

  private cutoff(): Date {
    return new Date(this.today.now().getTime() - JEV_CONVERSATION_RETENTION_DAYS * 86_400_000);
  }

  /** Suppression des conversations sans échange depuis plus de `JEV_CONVERSATION_RETENTION_DAYS` jours. */
  purge() {
    return this.prisma.jevConversation.deleteMany({ where: { updatedAt: { lt: this.cutoff() } } });
  }

  /** Nouvelle conversation (« Nouvelle conversation », ou première question). */
  async start(accountId: string): Promise<JevConversation> {
    await this.purge();
    return this.prisma.jevConversation.create({ data: { id: techId('jc'), accountId } });
  }

  /** Conversation de ce compte (404 pour celle d'un autre compte, ou supprimée). */
  async own(accountId: string, id: string): Promise<JevConversation> {
    const c = await this.prisma.jevConversation.findFirst({ where: { id, accountId, updatedAt: { gte: this.cutoff() } } });
    if (!c) throw notFound('Conversation introuvable');
    return c;
  }

  /** Conversation en cours du compte (la plus récente), avec ses messages ; null s'il n'y en a pas. */
  async current(accountId: string) {
    const c = await this.prisma.jevConversation.findFirst({ where: { accountId, updatedAt: { gte: this.cutoff() } }, orderBy: { updatedAt: 'desc' } });
    if (!c) return { id: null, messages: [] };
    const messages = await this.prisma.jevMessage.findMany({ where: { conversationId: c.id }, orderBy: { seq: 'asc' } });
    return { id: c.id, messages: messages.map((m) => ({ role: m.role, text: m.text, sources: m.sources, at: m.createdAt })) };
  }

  /**
   * Mémoire envoyée au modèle : échanges non résumés, les `JEV_HISTORY_TURNS` derniers au plus, dans la limite de
   * `JEV_HISTORY_MAX_CHARS` ; et le résumé des plus anciens.
   */
  async memory(c: JevConversation): Promise<JevMemory> {
    const msgs = await this.prisma.jevMessage.findMany({ where: { conversationId: c.id }, orderBy: { seq: 'asc' }, skip: c.summarizedCount });
    let turns = pairs(msgs).slice(-JEV_HISTORY_TURNS);
    while (turns.length && chars(turns) > JEV_HISTORY_MAX_CHARS) turns = turns.slice(1);
    return { history: turns.flat(), summary: c.summary };
  }

  /** Enregistre un échange, puis met à jour le résumé si des échanges sortent de la fenêtre (après la réponse). */
  async record(c: JevConversation, question: string, reply: string, sources: string[]): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.jevMessage.create({ data: { conversationId: c.id, role: 'user', text: question } }),
      this.prisma.jevMessage.create({ data: { conversationId: c.id, role: 'assistant', text: reply, sources } }),
      this.prisma.jevConversation.update({ where: { id: c.id }, data: { updatedAt: this.today.now() } }),
    ]);
    this.pending = this.summarize(c.id).catch((e) => console.warn('[jev-memory] résumé', e?.message ?? e));
  }

  /** Résumé incrémental : les échanges sortis de la fenêtre rejoignent le résumé, par lots de `JEV_SUMMARY_BATCH_TURNS`. */
  async summarize(id: string): Promise<void> {
    const c = await this.prisma.jevConversation.findUniqueOrThrow({ where: { id } });
    const msgs = await this.prisma.jevMessage.findMany({ where: { conversationId: id }, orderBy: { seq: 'asc' }, skip: c.summarizedCount });
    const turns = pairs(msgs);
    if (turns.length <= JEV_HISTORY_TURNS + JEV_SUMMARY_BATCH_TURNS - 1) return;
    const fold = turns.slice(0, turns.length - JEV_HISTORY_TURNS);
    const text = fold.map(([q, a]) => `Administrateur : ${q.content}\nJev : ${a.content}`).join('\n\n');
    const r = await this.llm.complete({
      functionId: 'guidage',
      source: 'JEV',
      system: SUMMARY_SYSTEM,
      prompt: `## Résumé actuel\n${c.summary || '(aucun)'}\n\n## Nouveaux échanges à intégrer\n${text}\n\nRéponds uniquement par le résumé mis à jour.`,
      maxWords: JEV_SUMMARY_MAX_WORDS,
    });
    await this.prisma.jevConversation.update({ where: { id }, data: { summary: r.text.trim(), summarizedCount: c.summarizedCount + fold.length * 2 } });
  }
}

/** Messages → échanges [question, réponse] (un message isolé en fin de liste est ignoré). */
function pairs(msgs: Array<{ role: string; text: string }>): Array<[ChatTurn, ChatTurn]> {
  const out: Array<[ChatTurn, ChatTurn]> = [];
  for (let i = 0; i + 1 < msgs.length; i += 2) {
    if (msgs[i].role !== 'user' || msgs[i + 1].role !== 'assistant') continue;
    const reply = msgs[i + 1].text.length > JEV_HISTORY_REPLY_MAX_CHARS ? msgs[i + 1].text.slice(0, JEV_HISTORY_REPLY_MAX_CHARS) + ' […]' : msgs[i + 1].text;
    out.push([{ role: 'user', content: msgs[i].text }, { role: 'assistant', content: reply }]);
  }
  return out;
}

const chars = (turns: Array<[ChatTurn, ChatTurn]>) => turns.reduce((n, [q, a]) => n + q.content.length + a.content.length, 0);
