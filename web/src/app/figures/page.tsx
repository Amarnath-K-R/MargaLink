"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { prepareDataset, readWorkbook, suggestPrepOptions, type Dataset, type PrepOptions, type Workbook } from "@/lib/spreadsheet";
import { cancelPreviews, exportFigure, renderFigure, warmUp, FigureRenderError, type ImageFormat, type RenderRequest } from "@/lib/figureRunner";
import { LIMITS, checkSpecAgainstColumns, validateFigureSpec, type FigureSpec, type Panel } from "@/lib/figureSpec";
import { bindTemplate, loadTemplates, type Template } from "@/lib/figureTemplates";
import { errorMessage } from "@/lib/errorMessage";
import { NetworkTracePanel, useNetworkTrace } from "@/components/NetworkTrace";
import PageHeader from "@/components/PageHeader";
import PaperDropzone from "@/components/PaperDropzone";
import ErrorText from "@/components/ErrorText";
import DataPrep from "./_components/DataPrep";
import Gallery from "./_components/Gallery";
import Describe from "./_components/Describe";
import type { ClaudeResult } from "@/lib/figure";
import FigurePreview, { type PreviewState } from "./_components/FigurePreview";
import ExportBar from "./_components/ExportBar";
import PanelEditor from "./_components/PanelEditor";
import StyleBar from "./_components/StyleBar";
import RecipeImportExport, { type Recipe } from "./_components/RecipeImportExport";

const PREVIEW_DPI = 144;
const DEBOUNCE_MS = 250;
const IDLE: PreviewState = { png: null, meta: null, error: null, stage: null, busy: false, hookWarning: null };

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
  const [selected, setSelected] = useState(0);
  // Bumped whenever the spec is replaced wholesale, so editors with
  // uncontrolled inputs (typed-on-blur fields) start fresh.
  const [specKey, setSpecKey] = useState(0);
  const [hook, setHook] = useState<string | null>(null);
  // A tweak (from Claude or an imported recipe) never runs until the user
  // has seen the code and clicked Run — the first of three layers (see
  // figurePrompt.ts isCodeSafeToRun and figureWorker.mjs lockNetwork).
  const [hookApproved, setHookApproved] = useState(false);
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
  const problem = useMemo(() => {
    if (!dataset || !spec) return null;
    const valid = validateFigureSpec(spec);
    return typeof valid === "string" ? `The figure settings aren't valid: ${valid}` : checkSpecAgainstColumns(dataset.columns, spec);
  }, [dataset, spec]);

  const request = useCallback(
    (formats: ImageFormat[], dpi: number): RenderRequest | null =>
      dataset && spec
        ? { spec, csv: dataset.csv, dtypes: Object.fromEntries(dataset.columns.map((c) => [c.name, c.dtype])), formats, dpi, hook: hookApproved ? hook : null }
        : null,
    [dataset, spec, hook, hookApproved],
  );

  // Live preview: debounced; renderFigure resolves null for a superseded
  // render, so a slow early render can never overwrite a newer one.
  useEffect(() => {
    const req = request(["png"], PREVIEW_DPI);
    if (!req || problem) {
      cancelPreviews(); // a render still in flight must not land over the problem message
      return;
    }
    const timer = setTimeout(() => {
      setPreview((p) => ({ ...p, busy: true }));
      renderFigure(req, (stage) => setPreview((p) => ({ ...p, stage }))).then(
        (result) => {
          if (result) setPreview({ png: result.images.png ?? null, meta: result.meta, error: null, stage: null, busy: false, hookWarning: result.hookWarning });
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
    cancelPreviews();
    setPreview(IDLE);
    setSpec(null);
    setTemplateId(null);
    setHook(null);
    setHookApproved(false);
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
      setSelected(0);
      setSpecKey((k) => k + 1);
    },
    [dataset],
  );

  const setPanel = (i: number, p: Panel) => spec && setSpec({ ...spec, panels: spec.panels.map((q, j) => (j === i ? p : q)) });
  function addPanel() {
    if (!spec || spec.panels.length >= LIMITS.panels) return;
    const panels = [...spec.panels, { ...structuredClone(spec.panels[selected]), title: "" }];
    let { rows, cols } = spec.layout;
    while (rows * cols < panels.length) {
      if (cols <= rows) cols++;
      else rows++;
    }
    setSpec({ ...spec, panels, layout: { ...spec.layout, rows, cols } });
    setSelected(panels.length - 1);
  }
  function removePanel(i: number) {
    if (!spec || spec.panels.length <= 1) return;
    setSpec({ ...spec, panels: spec.panels.filter((_, j) => j !== i) });
    setSelected(Math.max(0, Math.min(selected, spec.panels.length - 2)));
  }
  function onClaude(r: ClaudeResult) {
    if (r.kind === "hook") {
      setHook(r.hook);
      setHookApproved(false);
      return;
    }
    setSpec(r.spec);
    setTemplateId(null);
    setSelected((i) => Math.min(i, r.spec.panels.length - 1));
    setSpecKey((k) => k + 1);
  }
  function loadRecipe(r: Recipe) {
    setSpec(r.spec);
    setHook(r.hook);
    setHookApproved(false);
    setTemplateId(null);
    setSelected(0);
    setSpecKey((k) => k + 1);
  }

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
          <div>
            <section>
              <p className="mb-3 text-sm font-medium text-accent">3. Describe it to Claude…</p>
              <Describe dataset={dataset} spec={spec && typeof validateFigureSpec(spec) !== "string" ? spec : null} onResult={onClaude} />
            </section>
            <section className="mt-10">
              <p className="mb-3 text-sm font-medium text-accent">…or start from a template</p>
              <Gallery templates={templates} selected={templateId} onPick={pick} />
            </section>
            {spec && (
              <section className="mt-10 border-t border-line pt-8" key={specKey}>
                <p className="mb-3 text-sm font-medium text-accent">4. Adjust</p>
                <StyleBar spec={spec} onChange={setSpec} />
                <div className="mt-6 flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Panels">
                  {spec.panels.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      role="tab"
                      aria-selected={selected === i}
                      onClick={() => setSelected(i)}
                      className={`rounded-sm border px-3 py-1 text-sm ${selected === i ? "border-accent bg-accent-soft" : "border-line bg-paper-alt hover:border-accent"}`}
                    >
                      Panel {String.fromCharCode(97 + i)} · {p.family}
                    </button>
                  ))}
                  <button type="button" onClick={addPanel} disabled={spec.panels.length >= LIMITS.panels} className="px-2 py-1 text-sm text-accent disabled:opacity-40">
                    Add panel
                  </button>
                  {spec.panels.length > 1 && (
                    <button type="button" onClick={() => removePanel(selected)} className="px-2 py-1 text-sm text-accent">
                      Remove panel {String.fromCharCode(97 + selected)}
                    </button>
                  )}
                </div>
                <div className="mt-4">
                  <PanelEditor key={selected} panel={spec.panels[selected]} onChange={(p) => setPanel(selected, p)} dataset={dataset} />
                </div>
                {hook && (
                  <details className="mt-6 border-t border-line pt-4 text-sm" data-testid="hook" open={!hookApproved}>
                    <summary className="cursor-pointer font-medium">
                      Custom tweak (Python){hookApproved ? " — running" : " — not running yet"}
                    </summary>
                    <pre className="mt-2 max-h-60 overflow-auto rounded-sm border border-line bg-paper-alt p-2 text-xs">{hook}</pre>
                    {!hookApproved && (
                      <p className="mt-2 text-ink-soft">
                        Read it before running: it runs on this device, after the figure is drawn, with network access switched off. Only
                        run code you understand or got from someone you trust.
                      </p>
                    )}
                    <div className="mt-2 flex gap-4">
                      {!hookApproved && (
                        <button type="button" onClick={() => setHookApproved(true)} className="text-accent hover:underline">
                          Run this tweak
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          setHook(null);
                          setHookApproved(false);
                        }}
                        className="text-accent hover:underline"
                      >
                        Remove tweak
                      </button>
                    </div>
                  </details>
                )}
                <div className="mt-6 border-t border-line pt-4">
                  <RecipeImportExport spec={spec} hook={hook} columns={dataset.columns} onLoad={loadRecipe} />
                </div>
              </section>
            )}
          </div>
          <section className="lg:sticky lg:top-6 lg:self-start">
            <p className="mb-3 text-sm font-medium text-accent">Your figure</p>
            <FigurePreview state={problem ? { ...preview, busy: false, stage: null } : preview} problem={problem} />
            <div className="mt-6">
              <ExportBar disabled={!spec || !!problem} onExport={onExport} />
            </div>
          </section>
        </div>
      )}

      <NetworkTracePanel calls={calls}>
        {calls.filter((c) => c.hadBody).length === 0
          ? "Live previews and exports make no request — they're drawn on this device. The figure engine, fonts and template pictures are fetched without any of your data."
          : "Live previews and exports make no request. The one request with a body is the Ask Claude call you confirmed — its exact contents are shown above."}
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
