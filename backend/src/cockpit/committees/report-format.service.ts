import { Injectable } from '@nestjs/common';
import { ProjectScope } from '../../core/access.service';
import { PrismaService, Tx } from '../../core/prisma.service';
import { StorageService } from '../../core/storage.service';
import { TodayService } from '../../core/today.service';
import { badRequest, notFound } from '../../core/errors';
import { OoxmlPackage } from '../../core/ooxml';
import { mediaDataUri } from '../../core/report-format-read';
import { buildReportPptx, PageSource, ReportContent, ReportSection } from '../../core/report-format-write';
import { FormatAnalysis, formatErrors, FormatSelection, PAGE_KINDS, PageKind, pageSummary, pageWarnings, previewSvg, sizeLabel } from '../../domain/report-format';

/** Libellés des composants de rapport (catalogue de l'écran « Créer un template »). */
export const COMPONENT_LABELS: Record<string, string> = { synthese: 'Synthèse de situation', planning: 'Planning', jalons: 'Jalons', risques: 'Risques et problèmes', actions: 'Actions', decisions: 'Décisions', barometre: 'Baromètre du projet', dashboard: 'Tableau de bord', budget: 'Budget' };
const STATUS: Record<string, string> = { OPEN: 'ouvert', IN_PROGRESS: 'en cours', BLOCKED: 'bloqué', DONE: 'terminé', CLOSED: 'clos', PLANNED: 'prévu', PREPARATION: 'en préparation', ACTIVE: 'actif', MITIGATING: 'en traitement', DRAFT: 'brouillon', IN_REVIEW: 'en revue', TO_ARBITRATE: 'à arbitrer', ARBITRATED: 'arbitrée', CANCELLED: 'annulée', SUPERSEDED: 'remplacée' };
const st = (s: string) => STATUS[s] ?? s.toLowerCase().replace(/_/g, ' ');
export const frLongDate = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

type FileRow = { id: string; fileName: string; kind: string; sizeBytes: number; fileKey: string; analysis: any; createdAt: Date };

/** Format du rapport : fichiers de pages modèles, contrôles, aperçus et génération du PowerPoint. */
@Injectable()
export class ReportFormatService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly todaySvc: TodayService) {}

  /** Vue d'un fichier chargé : diapositives (libellé, résumé de l'extraction, alertes selon chaque type de page). */
  fileView(f: FileRow) {
    const a = f.analysis as FormatAnalysis;
    return {
      id: f.id, fileName: f.fileName, kind: f.kind, sizeBytes: f.sizeBytes, createdAt: f.createdAt, format: sizeLabel(a.size), slideCount: a.slides.length, warnings: a.warnings,
      slides: a.slides.map((s) => ({ index: s.index, label: s.label, summary: pageSummary(a, s), warnings: Object.fromEntries(PAGE_KINDS.map((k) => [k, pageWarnings(k, s, a.kind, a.embeddedFonts)])) })),
    };
  }

  async file(scope: ProjectScope, id: string, db: Tx | PrismaService = this.prisma): Promise<FileRow> {
    const f = await db.reportFormatFile.findFirst({ where: { id, projectId: scope.project.id } });
    if (!f) throw notFound('Fichier de format introuvable');
    return f as FileRow;
  }

  /** Aperçu SVG d'une diapositive (médias intégrés en `data:`). */
  async preview(scope: ProjectScope, id: string, n: number): Promise<string> {
    const f = await this.file(scope, id);
    const a = f.analysis as FormatAnalysis;
    const s = a.slides[n - 1];
    if (!s) throw notFound(`Diapositive ${n} introuvable`);
    const buf = await this.storage.get(f.fileKey);
    if (!buf) throw notFound('Fichier de format introuvable');
    if (a.kind === 'IMAGE') {
      const uri = `data:${buf[0] === 0x89 ? 'image/png' : 'image/jpeg'};base64,${buf.toString('base64')}`;
      return previewSvg(a, s, () => uri);
    }
    const uris = new Map<string, string | null>();
    if (a.kind === 'PPTX') {
      const pkg = await OoxmlPackage.load(buf);
      for (const p of [s.background.image, ...s.elements.map((e) => e.image ?? e.fill?.image)]) if (p && !uris.has(p)) uris.set(p, await mediaDataUri(pkg, p));
    }
    return previewSvg(a, s, (p) => uris.get(p) ?? null);
  }

  /** Contrôles du format complet : erreurs bloquantes et alertes par page. */
  async check(scope: ProjectScope, sel: FormatSelection, db: Tx | PrismaService = this.prisma) {
    const ids = [...new Set(PAGE_KINDS.map((k) => sel[k]?.fileId).filter(Boolean))] as string[];
    const rows = (await db.reportFormatFile.findMany({ where: { projectId: scope.project.id, id: { in: ids } } })) as FileRow[];
    const files = new Map(rows.map((f) => [f.id, { name: f.fileName, analysis: f.analysis as FormatAnalysis, error: null }]));
    const errors = formatErrors(sel, files);
    const pages = Object.fromEntries(PAGE_KINDS.map((k) => {
      const ref = sel[k];
      const f = ref ? rows.find((r) => r.id === ref.fileId) : null;
      const a = f?.analysis as FormatAnalysis | undefined;
      const s = a?.slides[(ref?.slide ?? 0) - 1];
      return [k, s && a ? { fileName: f!.fileName, slide: ref!.slide, kind: a.kind, warnings: pageWarnings(k, s, a.kind, a.embeddedFonts), summary: pageSummary(a, s) } : null];
    }));
    return { complete: !Object.keys(errors).length, errors, pages, rows };
  }

  /** Format enregistré avec le template : pour chaque page, la référence et les éléments extraits de la diapositive. */
  async formatForTemplate(scope: ProjectScope, sel: FormatSelection, db: Tx) {
    const c = await this.check(scope, sel, db);
    if (!c.complete) throw badRequest('Format du rapport incomplet', c.errors);
    const pages: Record<string, unknown> = {};
    for (const k of PAGE_KINDS) {
      const ref = sel[k]!;
      const f = c.rows.find((r) => r.id === ref.fileId)!;
      const a = f.analysis as FormatAnalysis;
      pages[k] = { fileId: f.id, fileName: f.fileName, slide: ref.slide, kind: a.kind, size: a.size, theme: a.theme, embeddedFonts: a.embeddedFonts, analysis: a.slides[ref.slide - 1] };
    }
    return { pages };
  }

  /** Données du rapport : une section par composant, sur son périmètre. */
  async sections(scope: ProjectScope, comps: Array<{ id: string; scope: string; targetId?: string | null }>): Promise<ReportSection[]> {
    const P = { projectId: scope.project.id };
    const out: ReportSection[] = [];
    for (const c of comps) {
      const t = c.targetId ?? null;
      let scopeLabel = 'Projet entier';
      if (c.scope === 'WAVE' && t) scopeLabel = `Lot ${(await this.prisma.wave.findUnique({ where: { id: t } }))?.seq ?? ''}`.trim();
      if (c.scope === 'PHASE' && t) scopeLabel = (await this.prisma.phase.findUnique({ where: { id: t } }))?.name ?? 'Phase';
      if (c.scope === 'WORKSTREAM' && t) scopeLabel = (await this.prisma.workstream.findUnique({ where: { id: t } }))?.name ?? 'Chantier';
      const ws = c.scope === 'WORKSTREAM' && t ? { wsId: t } : {};
      const lines: string[] = [];
      switch (c.id) {
        case 'synthese':
        case 'dashboard': {
          const [m, r, d, a] = await Promise.all([
            this.prisma.milestone.count({ where: P }),
            this.prisma.risk.count({ where: { ...P, ...ws, status: { not: 'CLOSED' } } }),
            this.prisma.decision.count({ where: { ...P, ...ws, status: { in: ['DRAFT', 'IN_REVIEW', 'TO_ARBITRATE'] } } }),
            this.prisma.action.count({ where: { ...P, ...ws, status: { not: 'DONE' } } }),
          ]);
          lines.push(`Projet ${scope.project.code} — ${scope.project.name}`, `Statut : ${st(scope.project.status)}`);
          if (scope.project.objective) lines.push(`Objectif : ${scope.project.objective}`);
          if (scope.project.forecastGoliveIso) lines.push(`Go-live prévu : ${frLongDate(scope.project.forecastGoliveIso)}`);
          lines.push(`${m} jalons · ${r} risques ouverts · ${d} décisions en attente · ${a} actions ouvertes`);
          break;
        }
        case 'planning':
          for (const p of await this.prisma.phase.findMany({ where: { ...P, ...(c.scope === 'PHASE' && t ? { id: t } : {}) }, orderBy: { seq: 'asc' } })) lines.push(`${p.code} · ${p.name} · ${p.startDate} → ${p.endDate} · ${p.progressPct} % · ${st(p.status)}`);
          break;
        case 'jalons':
          for (const m of await this.prisma.milestone.findMany({ where: { ...P, ...(c.scope === 'PHASE' && t ? { phaseId: t } : c.scope === 'WAVE' && t ? { waveId: t } : c.scope === 'WORKSTREAM' && t ? { wsId: t } : {}) }, orderBy: { iso: 'asc' } }))
            lines.push(`${m.code} · ${m.iso} · ${m.n}${m.iso !== m.baselineIso ? ` (référence ${m.baselineIso})` : ''}`);
          break;
        case 'risques':
          for (const x of (await this.prisma.risk.findMany({ where: { ...P, ...ws, status: { not: 'CLOSED' } } })).sort((a, b) => b.p * b.i - a.p * a.i || a.code.localeCompare(b.code))) lines.push(`${x.code} · criticité ${x.p * x.i} · ${x.n}`);
          break;
        case 'decisions':
          for (const d of await this.prisma.decision.findMany({ where: { ...P, ...ws }, orderBy: { code: 'asc' } })) lines.push(`${d.code} · ${st(d.status)} · ${d.t}`);
          break;
        case 'actions':
          for (const a of await this.prisma.action.findMany({ where: { ...P, ...ws, status: { not: 'DONE' } }, orderBy: { order: 'asc' } })) lines.push(`${a.code} · échéance ${a.dueIso ?? '—'} · ${a.n}`);
          break;
        case 'barometre':
          for (const b of await this.prisma.barometerSurvey.findMany({ where: P, orderBy: { month: 'desc' }, take: 6 })) lines.push(`${b.label} · score ${b.overallScore ?? '—'} · ${b.respondents ?? 0} répondants`);
          break;
        case 'budget':
          lines.push('Engagé, consommé et reste à faire : données du module Budget du projet.');
          break;
      }
      out.push({ title: COMPONENT_LABELS[c.id] ?? c.id, scope: scopeLabel, lines });
    }
    return out;
  }

  /** PowerPoint d'un template, avec les données du jour ; présentation par défaut si le template n'a pas de format. */
  async generate(scope: ProjectScope, tpl: { name: string; version: string; bodyId: string | null; components: any; format: any }): Promise<Buffer> {
    const body = tpl.bodyId ? await this.prisma.governanceBody.findUnique({ where: { id: tpl.bodyId } }) : null;
    const today = this.todaySvc.today(scope.project.timezone);
    const project = scope.project.name.startsWith(scope.project.code) ? scope.project.name : `${scope.project.code} — ${scope.project.name}`;
    const content: ReportContent = {
      title: tpl.name,
      subtitle: [body?.name, project, `v${tpl.version}`].filter(Boolean).join(' · '),
      date: frLongDate(today),
      project,
      committee: body?.name ?? '',
      sections: await this.sections(scope, tpl.components as any[]),
    };
    let pages: Record<PageKind, PageSource> | null = null;
    if (tpl.format?.pages) {
      pages = {} as Record<PageKind, PageSource>;
      const bufs = new Map<string, Buffer | null>();
      for (const k of PAGE_KINDS) {
        const p = tpl.format.pages[k];
        const f = await this.prisma.reportFormatFile.findUnique({ where: { id: p.fileId } });
        if (!f) throw notFound(`Format du rapport : fichier de la ${k} introuvable`);
        if (!bufs.has(f.id)) bufs.set(f.id, await this.storage.get(f.fileKey));
        const analysis = { ...(f.analysis as unknown as FormatAnalysis) };
        // La diapositive retenue est celle enregistrée avec le template.
        analysis.slides = analysis.slides.map((s, i) => (i === p.slide - 1 && p.analysis ? p.analysis : s));
        pages[k] = { fileId: f.id, kind: f.kind as any, buf: bufs.get(f.id) ?? null, analysis, slide: p.slide };
      }
    }
    return buildReportPptx(pages, content);
  }
}
