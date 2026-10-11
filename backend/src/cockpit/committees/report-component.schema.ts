import { z } from 'zod';
import { COMPONENT_IDS, PERIODS, PLAN_LEVELS } from '../../domain/report-components';

const ids = <T extends string>(l: readonly T[]) => l as unknown as [T, ...T[]];

/**
 * Composant d'un template (étape 4) : périmètre, niveau (Planning), période, indicateurs, ouverture d'une section. Schéma
 * unique de la création, de la modification et de l'aperçu (11/10/2026) ; identifiants, périodes et niveaux lus dans le
 * catalogue (`report-components.ts`) pour ne plus diverger.
 */
export const ComponentSchema = z
  .object({
    id: z.enum(ids(COMPONENT_IDS)),
    scope: z.enum(['PROJECT', 'WAVE', 'PHASE', 'WORKSTREAM']),
    targetId: z.string().nullable().optional(),
    level: z.enum(ids(PLAN_LEVELS.map((l) => l.id))).optional(),
    statuses: z.array(z.enum(['ACTIVE', 'FUTURE', 'LATE', 'DONE'])).max(4).optional(),
    period: z.enum(ids(PERIODS.map((p) => p.id))).optional(),
    indicators: z.array(z.string().min(1)).max(10).optional(),
    newSection: z.boolean().optional(),
    sectionTitle: z.string().max(120).nullable().optional(),
  })
  .strict();
