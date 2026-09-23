"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { prepareDataset, readWorkbook, suggestPrepOptions, type Dataset, type PrepOptions, type Workbook } from "@/lib/spreadsheet";
import { exportFigure, renderFigure, warmUp, FigureRenderError, type ImageFormat, type RenderRequest } from "@/lib/figureRunner";
import { checkSpecAgainstColumns, type FigureSpec } from "@/lib/figureSpec";
import { bindTemplate, loadTemplates, type Template } from "@/lib/figureTemplates";
import { errorMessage } from "@/lib/errorMessage";
import { NetworkTracePanel, useNetworkTrace } from "@/components/NetworkTrace";
import PageHeader from "@/components/PageHeader";
import PaperDropzone from "@/components/PaperDropzone";
import ErrorText from "@/components/ErrorText";
import DataPrep from "./_components/DataPrep";
import Gallery from "./_components/Gallery";
import FigurePreview, { type PreviewState } from "./_components/FigurePreview";
import ExportBar from "./_components/ExportBar";

const PREVIEW_DPI = 144;
const DEBOUNCE_MS = 250;
const IDLE: PreviewState = { png: null, meta: null, error: null, stage: null, busy: false };

function prepare(workbook: Workbook | null, options: PrepOptions | null): { dataset: Dataset | null; error: string | null } {
  if (!workbook || !options) return { dataset: null, error: null };
  try {
    return { dataset: prepareDataset(workbook, options), error: null };
  } catch (err) {
    return { dataset: null, error: errorMessage(err) };
  }
}

// Attach a spreadsheet → check how it was read → start from a template →
// the figure redraws on this device on every change. Rendering is local
// (figureRunner.ts → public/figureWorker.mjs → public/figurelib.py); no
// request carries your data.
export default function FiguresPage() {
  const [workbook, setWorkbook] = useState<Workbook | null>(null);
  const [prep, setPrep] = useState<PrepOptions | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [spec, setSpec] = useState<FigureSpec | null>(null);
  const [preview, setPreview] = useState<PreviewState>(IDLE);
  const { calls } = useNetworkTrace();

  useEffect(() => {
    loadTemplates().then(setTemplates, (err) => setUploadError(errorMessage(err)));
  }, []);

  const { dataset, error: prepError } = useMemo(() => prepare(workbook, prep), [workbook, prep]);
  // The columns as they are before any stacking — what the reshape picker offers.
  const sourceColumns = useMemo(
    () => prepare(workbook, prep && { ...prep, reshape: null, typeOverrides: {} }).dataset?.columns.map((c) => c.name) ?? [],
    [workbook, prep],
  );
  const problem = dataset && spec ? checkSpecAgainstColumns(dataset.columns, spec) : null;

  const request = useCallback(
    (formats: ImageFormat[], dpi: number): RenderRequest | null =>
      dataset && spec
        ? { spec, csv: dataset.csv, dtypes: Object.fromEntries(dataset.columns.map((c) => [c.name, c.dtype])), formats, dpi, hook: null }
        : null,
    [dataset, spec],
  );

  // Live preview: debounced; renderFigure resolves null for a superseded
  // render, so a slow early render can never overwrite a newer one.
  useEffect(() => {
    const req = request(["png"], PREVIEW_DPI);
    if (!req || problem) return;
    const timer = setTimeout(() => {
      setPreview((p) => ({ ...p, busy: true }));
      renderFigure(req, (stage) => setPreview((p) => ({ ...p, stage }))).then(
        (result) => {
          if (result) setPreview({ png: result.images.png ?? null, meta: result.meta, error: null, stage: null, busy: false });
        },
        (err: unknown) => {
          const error = err instanceof FigureRenderError ? { message: err.message, traceback: err.traceback } : { message: errorMessage(err), traceback: "" };
          setPreview((p) => ({ ...p, error, stage: null, busy: false }));
        },
      );
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [request, problem]);

  const onFile = useCallback(async (file: File) => {
    setUploadError(null);
    setPreview(IDLE);
    setSpec(null);
    setTemplateId(null);
    try {
      const wb = await readWorkbook(file);
      setWorkbook(wb);
      setPrep(suggestPrepOptions(wb));
      // Start loading Pyodide now, so it's usually ready by the first pick.
      void warmUp({ fonts: true }).catch(() => {});
    } catch (err) {
      setUploadError(errorMessage(err));
    }
  }, []);

  const pick = useCallback(
    (t: Template) => {
      if (!dataset) return;
      setTemplateId(t.id);
      setSpec(bindTemplate(t, dataset.columns));
    },
    [dataset],
  );

  const onExport = useCallback(
    async (formats: ImageFormat[], dpi: number) => {
      const req = request(formats, dpi);
      if (!req) throw new Error("Pick a starting point first.");
      return (await exportFigure(req)).images;
    },
    [request],
  );

  return (
    <main className="mx-auto w-full max-w-6xl px-6 py-14 sm:py-20">
      <PageHeader
        width="4xl"
        links={[
          { href: "/", label: "← Back" },
          { href: "/privacy", label: "How privacy works" },
        ]}
        title="Make a figure."
        subtitle={
          <p className="mt-3 max-w-md text-lg text-ink-soft">
            Upload your data, start from a template, and export a journal-ready figure — drawn on this device, your values never leave this tab.
          </p>
        }
      />

      <section>
        <p className="mb-3 text-sm font-medium text-accent">1. Attach your data</p>
        <PaperDropzone
          busy={false}
          onFile={(file) => void onFile(file)}
          accept=".csv,.tsv,.txt,.xlsx"
          title="Drop a CSV or XLSX"
          ariaLabel="Upload a CSV or XLSX spreadsheet"
        />
        {uploadError && <ErrorText>{uploadError}</ErrorText>}
        {workbook && !uploadError && <p className="mt-3 text-sm text-ink-soft">Loaded {workbook.fileName}.</p>}
      </section>

      {workbook && prep && (
        <section className="mt-12 border-t border-line pt-8">
          <p className="mb-3 text-sm font-medium text-accent">2. Check how it was read</p>
          <DataPrep key={workbook.fileName} workbook={workbook} options={prep} onChange={setPrep} dataset={dataset} sourceColumns={sourceColumns} />
          {prepError && <ErrorText>{prepError}</ErrorText>}
        </section>
      )}

      {dataset && (
        <div className="mt-12 grid gap-10 border-t border-line pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <section>
            <p className="mb-3 text-sm font-medium text-accent">3. Start from</p>
            <Gallery templates={templates} selected={templateId} onPick={pick} />
          </section>
          <section className="lg:sticky lg:top-6 lg:self-start">
            <p className="mb-3 text-sm font-medium text-accent">Your figure</p>
            <FigurePreview state={preview} problem={problem} />
            <div className="mt-6">
              <ExportBar disabled={!spec || !!problem} onExport={onExport} />
            </div>
          </section>
        </div>
      )}

      <NetworkTracePanel calls={calls}>
        {calls.filter((c) => c.hadBody).length === 0
          ? "None of these carried your data — previews and exports are drawn on this device. The requests above only fetch the public figure engine, fonts and template pictures."
          : "A request with a body only happens after you confirm the Ask Claude notice."}
      </NetworkTracePanel>

      <footer className="mt-20 border-t border-line pt-6 text-sm text-ink-soft">
        <p>
          <Link href="/privacy" className="text-accent hover:underline">
            How privacy works
          </Link>{" "}
          — including the figure generator&apos;s exception.
        </p>
      </footer>
    </main>
  );
}
