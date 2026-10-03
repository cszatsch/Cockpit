import { Injectable } from '@nestjs/common';
import { ProjectScope } from '../../core/access.service';
import { PrismaService, Tx } from '../../core/prisma.service';
import { StorageService } from '../../core/storage.service';
import { badRequest, notFound } from '../../core/errors';
import { OoxmlPackage } from '../../core/ooxml';
import { analyzePptx, mediaDataUri } from '../../core/report-format-read';
import { LlmService } from '../../core/llm.service';
import { parseRoles, ROLES_SYSTEM, ROLES_TIMEOUT_MS, rolesPrompt } from '../../domain/report-writing';
import { FormatAnalysis, formatErrors, FormatSelection, PAGE_KINDS, PageKind, pageSummary, pageWarnings, previewSvg, RoleMap, roleErrors, SHAPE_ROLES, sizeLabel, suggestRoles } from '../../domain/report-format';

type FileRow = { id: string; fileName: string; kind: string; sizeBytes: number; fileKey: string; analysis: any; createdAt: Date };

/** Format du rapport : fichiers de pages modèles, contrôles, aperçus et génération du PowerPoint. */
@Injectable()
export class ReportFormatService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly llm: LlmService) {}

  /** Vue d'un fichier chargé : diapositives (libellé, résumé de l'extraction, alertes selon chaque type de page). */
  fileView(f: FileRow) {
    const a = f.analysis as FormatAnalysis;
    return {
      id: f.id, fileName: f.fileName, kind: f.kind, sizeBytes: f.sizeBytes, createdAt: f.createdAt, format: sizeLabel(a.size), size: a.size, slideCount: a.slides.length, warnings: a.warnings,
      slides: a.slides.map((s) => ({ index: s.index, label: s.label, summary: pageSummary(a, s), warnings: Object.fromEntries(PAGE_KINDS.map((k) => [k, pageWarnings(k, s, a.kind, a.embeddedFonts)])) })),
    };
  }

  async file(scope: ProjectScope, id: string, db: Tx | PrismaService = this.prisma): Promise<FileRow> {
    const f = await db.reportFormatFile.findFirst({ where: { id, projectId: scope.project.id } });
    if (!f) throw notFound('Fichier de format introuvable');
    return f as FileRow;
  }

  /** Aperçu SVG d'une diapositive (médias intégrés en `data:`). */
  async preview(scope: ProjectScope, id: string, n: number, roles?: RoleMap): Promise<string> {
    const f = await this.withShapes(await this.file(scope, id));
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
    return previewSvg(a, s, (p) => uris.get(p) ?? null, roles ? { roles } : {});
  }

  /** Contrôles du format complet : erreurs bloquantes et alertes par page. */
  async check(scope: ProjectScope, sel: FormatSelection, db: Tx | PrismaService = this.prisma) {
    const ids = [...new Set(PAGE_KINDS.map((k) => sel[k]?.fileId).filter(Boolean))] as string[];
    const rows = (await db.reportFormatFile.findMany({ where: { projectId: scope.project.id, id: { in: ids } } })) as FileRow[];
    const files = new Map(rows.map((f) => [f.id, { name: f.fileName, analysis: f.analysis as FormatAnalysis, error: null }]));
    const errors = formatErrors(sel, files);
    // Rôles des formes (PowerPoint) : ceux validés à l'étape B, sinon ceux proposés ; un titre est obligatoire.
    for (const k of PAGE_KINDS) {
      const ref = sel[k];
      const f = ref && !errors[k] ? rows.find((r) => r.id === ref.fileId) : null;
      const s = f && (f.analysis as FormatAnalysis).kind === 'PPTX' ? (f.analysis as FormatAnalysis).slides[ref!.slide - 1] : null;
      if (!s?.shapes) continue;
      const e = roleErrors(k, s.shapes, ref!.roles ?? s.suggestedRoles?.[k]?.roles ?? suggestRoles(k, s.shapes, (f!.analysis as FormatAnalysis).size));
      if (e) errors[k] = e;
    }
    const pages = Object.fromEntries(PAGE_KINDS.map((k) => {
      const ref = sel[k];
      const f = ref ? rows.find((r) => r.id === ref.fileId) : null;
      const a = f?.analysis as FormatAnalysis | undefined;
      const s = a?.slides[(ref?.slide ?? 0) - 1];
      const roles = s && a?.kind === 'PPTX' && s.shapes ? ref!.roles ?? s.suggestedRoles?.[k]?.roles ?? suggestRoles(k, s.shapes, a.size) : undefined;
      return [k, s && a ? { fileName: f!.fileName, slide: ref!.slide, kind: a.kind, warnings: pageWarnings(k, s, a.kind, a.embeddedFonts, roles), summary: pageSummary(a, s, roles) } : null];
    }));
    return { complete: !Object.keys(errors).length, errors, pages, rows };
  }

  /** Format enregistré avec le template : pour chaque page, la référence et les éléments extraits de la diapositive. */
  async formatForTemplate(scope: ProjectScope, sel: FormatSelection, db: Tx) {
    for (const k of PAGE_KINDS) if (sel[k]) await this.withShapes(await this.file(scope, sel[k]!.fileId, db), db);
    const c = await this.check(scope, sel, db);
    if (!c.complete) throw badRequest('Format du rapport incomplet', c.errors);
    const pages: Record<string, unknown> = {};
    for (const k of PAGE_KINDS) {
      const ref = sel[k]!;
      const f = c.rows.find((r) => r.id === ref.fileId)!;
      const a = f.analysis as FormatAnalysis;
      const s = a.slides[ref.slide - 1];
      const roles = a.kind === 'PPTX' && s.shapes ? ref.roles ?? s.suggestedRoles?.[k]?.roles ?? suggestRoles(k, s.shapes, a.size) : undefined;
      pages[k] = { fileId: f.id, fileName: f.fileName, slide: ref.slide, kind: a.kind, size: a.size, theme: a.theme, embeddedFonts: a.embeddedFonts, analysis: s, ...(roles ? { roles } : {}), ...(ref.verified ? { verified: true } : {}) };
    }
    return { pages };
  }

  /** Fichier chargé avant l'inventaire des formes (03/10/2026) : analyse refaite une fois et enregistrée. */
  async withShapes(f: FileRow, db: Tx | PrismaService = this.prisma): Promise<FileRow> {
    const a = f.analysis as FormatAnalysis;
    if (a.kind !== 'PPTX' || a.slides.every((x) => x.shapes)) return f;
    const buf = await this.storage.get(f.fileKey);
    if (!buf) return f;
    const fresh = await analyzePptx(buf);
    fresh.slides = fresh.slides.map((x, i) => ({ ...x, ...(a.slides[i]?.suggestedRoles ? { suggestedRoles: a.slides[i].suggestedRoles } : {}) }));
    await db.reportFormatFile.update({ where: { id: f.id }, data: { analysis: fresh as any } });
    return { ...f, analysis: fresh };
  }

  /**
   * Rôles proposés pour les formes d'une diapositive selon le type de page : règles, puis IA (fonction « Génération de
   * rapports ») quand elle est disponible ; résultat gardé avec le fichier (un appel par diapositive et type de page).
   */
  async roles(scope: ProjectScope, id: string, n: number, kind: PageKind) {
    const f = await this.withShapes(await this.file(scope, id));
    const a = f.analysis as FormatAnalysis;
    const s = a.slides[n - 1];
    if (!s) throw notFound(`Diapositive ${n} introuvable`);
    const view = (roles: RoleMap | null, source: string, note: string | null = null) => ({
      kind, source, note, roleLabels: SHAPE_ROLES,
      shapes: (s.shapes ?? []).map((x) => ({ id: x.id, name: x.name, kind: x.kind, text: x.text.replace(/\s+/g, ' ').slice(0, 120), size: x.size, box: { x: x.box.x / a.size.cx, y: x.box.y / a.size.cy, w: x.box.w / a.size.cx, h: x.box.h / a.size.cy } })),
      roles: roles ?? {}, error: roles && s.shapes ? roleErrors(kind, s.shapes, roles) : null,
    });
    if (a.kind !== 'PPTX' || !s.shapes) return view(null, 'aucun', 'Page reconstruite (PDF ou image) : pas de formes à désigner.');
    const cached = s.suggestedRoles?.[kind];
    if (cached) return view(cached.roles, cached.source);
    const rules = suggestRoles(kind, s.shapes, a.size);
    let roles = rules, source = 'regles', note: string | null = null;
    if (this.llm.isLive('rapports')) {
      try {
        const r = await this.llm.complete({ functionId: 'rapports', system: ROLES_SYSTEM, prompt: rolesPrompt(kind, s.shapes, a.size, rules), projectId: scope.project.id, source: 'COCKPIT', timeoutMs: ROLES_TIMEOUT_MS, maxTokens: 1500 });
        const parsed = parseRoles(r.text, kind, s.shapes, rules);
        if (parsed) { roles = parsed; source = 'ia'; } else note = 'Proposition de l’IA refusée au contrôle : proposition par règles.';
      } catch (e) { note = `IA indisponible (${String((e as { message?: string }).message ?? e).slice(0, 80)}) : proposition par règles.`; }
    }
    a.slides[n - 1] = { ...s, suggestedRoles: { ...(s.suggestedRoles ?? {}), [kind]: { roles, source } } };
    await this.prisma.reportFormatFile.update({ where: { id: f.id }, data: { analysis: a as any } });
    return view(roles, source, note);
  }
}
