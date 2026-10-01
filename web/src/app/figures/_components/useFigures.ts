"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { prepareDataset, readWorkbook, suggestPrepOptions, type Dataset, type PrepOptions, type Workbook } from "@/lib/figures/spreadsheet";
import { cancelPreviews, exportFigure, renderFigure, warmUp, FigureRenderError, type ImageFormat, type RenderRequest } from "@/lib/figures/figureRunner";
import { LIMITS, checkSpecAgainstColumns, validateFigureSpec, type FigureSpec, type Panel } from "@/lib/figures/figureSpec";
import { bindTemplate, loadTemplates, type Template } from "@/lib/figures/figureTemplates";
import { errorMessage } from "@/lib/errorMessage";
import type { ClaudeResult } from "@/lib/figures/figure";
import type { PreviewState } from "./FigurePreview";
import type { Recipe } from "./RecipeImportExport";

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

// The figure studio's state and wiring — attach a spreadsheet, check how it
// was read, start from a template, adjust, and the live preview that redraws
// on this device on every change — as one hook, shared by the /figures page
// and the writing workspace's Figures window. Rendering is local
// (figureRunner.ts → public/figureWorker.mjs → public/figurelib.py); no
// request carries your data. Pyodide loads only once a spreadsheet is attached.
export function useFigures() {
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
  const approveHook = () => setHookApproved(true);
  function removeHook() {
    setHook(null);
    setHookApproved(false);
  }

  const onExport = useCallback(
    async (formats: ImageFormat[], dpi: number) => {
      const req = request(formats, dpi);
      if (!req) throw new Error("Pick a starting point first.");
      return (await exportFigure(req)).images;
    },
    [request],
  );

  return {
    workbook,
    prep,
    setPrep,
    uploadError,
    dataset,
    prepError,
    sourceColumns,
    templates,
    templateId,
    pick,
    spec,
    setSpec,
    specKey,
    selected,
    setSelected,
    setPanel,
    addPanel,
    removePanel,
    hook,
    hookApproved,
    approveHook,
    removeHook,
    preview,
    problem,
    onFile,
    onClaude,
    loadRecipe,
    onExport,
  };
}

export type FiguresApi = ReturnType<typeof useFigures>;
