import { Injectable } from '@nestjs/common';
import { ProjectScope } from '../../core/access.service';
import { PrismaService, Tx } from '../../core/prisma.service';
import { StorageService } from '../../core/storage.service';
import { badRequest, notFound } from '../../core/errors';
import { OoxmlPackage } from '../../core/ooxml';
import { mediaDataUri } from '../../core/report-format-read';
import { FormatAnalysis, formatErrors, FormatSelection, PAGE_KINDS, pageSummary, pageWarnings, previewSvg, sizeLabel } from '../../domain/report-format';

type FileRow = { id: string; fileName: string; kind: string; sizeBytes: number; fileKey: string; analysis: any; createdAt: Date };

/** Format du rapport : fichiers de pages modèles, contrôles, aperçus et génération du PowerPoint. */
@Injectable()
export class ReportFormatService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService) {}

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
}
