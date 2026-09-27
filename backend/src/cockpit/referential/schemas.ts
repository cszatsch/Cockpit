import { z } from 'zod';
import { isIsoDate } from '../../domain/dates';

/** Briques de validation communes (API et import Excel). */
export const isoDate = z.string().refine(isIsoDate, 'date ISO attendue (AAAA-MM-JJ)');
export const optIsoDate = isoDate.nullable().optional();
export const pct = z.number().int().min(0, '0 minimum').max(100, '100 maximum');
export const text = (max = 500) => z.string().trim().min(1, 'obligatoire').max(max);
export const optText = (max = 4000) => z.string().max(max).nullable().optional();
export const id = z.string().min(1, 'obligatoire');
export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'couleur hexadécimale attendue (#RRGGBB)');
export const precision = z.enum(['D', 'M', 'Y']);

export const planStatus = z.enum(['PLANNED', 'IN_PROGRESS', 'DONE']);
export const frequency = z.enum(['DAILY', 'WEEKLY', 'BIWEEKLY', 'MONTHLY', 'QUARTERLY', 'SEMIANNUAL', 'ON_DEMAND']);

export const ClientCreate = z
  .object({ code: text(40), name: text(200), description: optText(), status: z.enum(['ACTIVE', 'INACTIVE']).optional() })
  .strict();

export const WaveCreate = z
  .object({
    seq: z.number().int().min(1),
    name: text(200),
    startDate: optIsoDate,
    endDate: optIsoDate,
    startPrecision: precision.optional(),
    endPrecision: precision.optional(),
    status: planStatus.optional(),
    ownerId: id.nullable().optional(),
  })
  .strict();

export const PhaseCreate = z
  .object({
    seq: z.number().int().min(1),
    code: z.string().trim().min(1).max(20).optional(),
    name: text(200),
    description: optText(),
    startDate: isoDate,
    endDate: isoDate,
    startPrecision: precision.optional(),
    endPrecision: precision.optional(),
    status: planStatus.optional(),
    progressPct: pct.optional(),
    plannedPctOverride: pct.nullable().optional(),
    critical: z.boolean().optional(),
    ownerId: id,
    waveIds: z.array(id).optional(),
  })
  .strict();

export const SubphaseCreate = z
  .object({
    phaseId: id,
    code: z.string().trim().min(1).max(20),
    name: text(200),
    description: optText(),
    startDate: optIsoDate,
    endDate: optIsoDate,
    startPrecision: precision.optional(),
    endPrecision: precision.optional(),
    status: planStatus.optional(),
    progressPct: pct.optional(),
    plannedPctOverride: pct.nullable().optional(),
    critical: z.boolean().optional(),
    ownerId: id.nullable().optional(),
  })
  .strict();

export const WorkstreamCreate = z
  .object({
    seq: z.number().int().min(1).optional(),
    name: text(200),
    ownerId: id,
    status: z.enum(['ACTIVE', 'CLOSED']).optional(),
    startDate: optIsoDate,
    endDate: optIsoDate,
    progressPct: pct.optional(),
    plannedPctOverride: pct.nullable().optional(),
    critical: z.boolean().optional(),
    description: optText(),
    phaseIds: z.array(id).optional(),
    waveIds: z.array(id).optional(),
    dependsOn: z.union([z.literal('ALL'), z.array(id)]).optional(),
  })
  .strict();

export const DeliverableCreate = z
  .object({
    name: text(300),
    subphaseId: id,
    workstreamId: id.nullable().optional(),
    ownerId: id,
    start: optIsoDate,
    due: isoDate,
    prog: pct.optional(),
    riskOverride: z.enum(['OK', 'TENSION', 'CRITICAL']).nullable().optional(),
    teamLabel: optText(60),
  })
  .strict();

export const TeamCreate = z
  .object({ name: text(120), description: optText(), kind: z.enum(['CLIENT', 'AMOA', 'INTEGRATOR', 'OTHER']).optional() })
  .strict();

export const RoleCreate = z
  .object({ label: text(120), description: optText(), order: z.number().int().optional(), tier: z.number().int().min(0).max(3).nullable().optional() })
  .strict();

export const PersonCreate = z
  .object({
    firstName: text(80),
    lastName: z.string().trim().max(80).default(''),
    email: z.string().trim().toLowerCase().email('e-mail invalide'),
    teamId: id,
    title: optText(200),
    active: z.boolean().optional(),
    photoUrl: optText(2_000_000),
    wsIds: z.array(id).optional(),
  })
  .strict();

export const AssignmentCreate = z
  .object({ personId: id, roleId: id, startDate: isoDate, endDate: optIsoDate })
  .strict();

export const BodyCreate = z
  .object({
    name: text(200),
    shortName: text(40),
    color: hexColor,
    frequency,
    level: z.enum(['STRATEGIC', 'STEERING', 'OPERATIONAL', 'OFF_CYCLE']).nullable().optional(),
    description: optText(),
    members: z.array(z.object({ personId: id, role: z.enum(['CHAIR', 'MEMBER', 'SECRETARY', 'GUEST']).default('MEMBER') })).optional(),
  })
  .strict();

export const MilestoneCreate = z
  .object({
    n: text(300),
    phaseId: id,
    subphaseId: id.nullable().optional(),
    wsId: id.nullable().optional(),
    waveId: id.nullable().optional(),
    owner: id.nullable().optional(),
    iso: isoDate,
    baselineIso: optIsoDate,
  })
  .strict();

/** PATCH : tous les champs deviennent facultatifs ; aucun `id` accepté. */
export function patchOf<T extends z.ZodObject<any>>(schema: T) {
  return schema.partial().strict();
}
