"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { parseSpreadsheet, type Dataset } from "@/lib/spreadsheet";
import { requestFigureCode, figuresRemaining, figureConsentGiven, recordFigureConsent } from "@/lib/figure";
import { runFigureCode, warmUp, type FigureImages, type ProgressStage } from "@/lib/figureRunner";
import { validateSpec, type FigureSpec } from "@/lib/figureSchema";
import { errorMessage } from "@/lib/errorMessage";
import { NetworkTracePanel, useNetworkTrace } from "@/components/NetworkTrace";
import PageHeader from "@/components/PageHeader";
import PaperDropzone from "@/components/PaperDropzone";
import ErrorText from "@/components/ErrorText";
import FigureConsent from "@/components/FigureConsent";
import FigureSpecForm from "./_components/FigureSpecForm";
import FigurePanel from "./_components/FigurePanel";

const DEFAULT_SPEC: FigureSpec = { chartType: "bar-error", roles: {}, note: "" };

// Attach a spreadsheet → describe the figure → generate. Unlike /match and
// /review, the network exception here is much narrower (see
// figureSchema.ts): only column names, types, and the chart choice ever
// leave the device — the actual code that touches real data runs locally,
// in a Web Worker (figureRunner.ts/public/figureWorker.mjs), never on a
// server.
export default function FiguresPage() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [spec, setSpec] = useState<FigureSpec>(DEFAULT_SPEC);
  const [consentOpen, setConsentOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progressStage, setProgressStage] = useState<ProgressStage | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [images, setImages] = useState<FigureImages | null>(null);
  const [genError, setGenError] = useState<string | null>(null);
  const { calls } = useNetworkTrace();

  const onFile = useCallback(async (file: File) => {
    setUploadError(null);
    setCode(null);
    setImages(null);
    setGenError(null);
    setSpec(DEFAULT_SPEC);
    try {
      const ds = await parseSpreadsheet(file);
      setDataset(ds);
      // Start loading Pyodide the moment we have real data, so it's
      // usually ready by the time generated code comes back.
      warmUp();
    } catch (err) {
      setUploadError(errorMessage(err));
    }
  }, []);

  const runGeneration = useCallback(async () => {
    if (!dataset) return;
    setBusy(true);
    setGenError(null);
    setCode(null);
    setImages(null);
    try {
      const generatedCode = await requestFigureCode(dataset, spec);
      setCode(generatedCode);
      const result = await runFigureCode(generatedCode, dataset.csv, setProgressStage);
      setImages(result);
    } catch (err) {
      setGenError(errorMessage(err));
    } finally {
      setBusy(false);
      setProgressStage(null);
    }
  }, [dataset, spec]);

  const onGenerateClick = useCallback(() => {
    if (!dataset) return;
    if (!figureConsentGiven()) {
      setConsentOpen(true);
      return;
    }
    void runGeneration();
  }, [dataset, runGeneration]);

  const onConfirmConsent = useCallback(() => {
    recordFigureConsent();
    setConsentOpen(false);
    void runGeneration();
  }, [runGeneration]);

  const specError = dataset ? validateSpec(dataset.columns, spec) : null;
  const generateLabel = busy
    ? progressStage === "loading-runtime" || progressStage === "loading-packages"
      ? "Loading Python runtime…"
      : "Working…"
    : figuresRemaining() <= 0
      ? "Pilot figure limit reached on this device"
      : "Generate figure";

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-14 sm:py-20">
      <PageHeader
        width="4xl"
        links={[
          { href: "/", label: "← Back" },
          { href: "/privacy", label: "How privacy works" },
        ]}
        title="Make a figure."
        subtitle={
          <p className="mt-3 max-w-md text-lg text-ink-soft">
            Upload your data, pick a chart, and get a publication-ready figure — your values never leave this tab.
          </p>
        }
      />

      <section>
        <p className="mb-3 text-sm font-medium text-accent">1. Attach your data</p>
        <PaperDropzone
          busy={busy}
          onFile={(file) => void onFile(file)}
          accept=".csv,.xlsx"
          title="Drop a CSV or XLSX"
          ariaLabel="Upload a CSV or XLSX spreadsheet"
        />
        {uploadError && <ErrorText>{uploadError}</ErrorText>}
        {dataset && !uploadError && (
          <p className="mt-3 text-sm text-ink-soft">
            Loaded {dataset.fileName} — {dataset.rowCount.toLocaleString()} rows, {dataset.columns.length} columns.
          </p>
        )}
      </section>

      {dataset && (
        <section className="mt-12 border-t border-line pt-8">
          <p className="mb-3 text-sm font-medium text-accent">2. Describe the figure</p>
          <FigureSpecForm dataset={dataset} spec={spec} onChange={setSpec} />
          {specError && <ErrorText>{specError}</ErrorText>}
        </section>
      )}

      {dataset && (
        <section className="mt-12 border-t border-line pt-8">
          <p className="mb-3 text-sm font-medium text-accent">3. Generate</p>
          <p className="mt-1 text-sm text-ink-soft">
            Only the column names, types, and your chart choice above are sent to Claude — never your
            data&apos;s actual values. That&apos;s the exact request shown above.
          </p>
          <button
            type="button"
            onClick={onGenerateClick}
            disabled={busy || !!specError || figuresRemaining() <= 0}
            className="mt-4 rounded-sm border border-line bg-paper-alt px-4 py-2 text-sm hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            {generateLabel}
          </button>
          {consentOpen && <FigureConsent onConfirm={onConfirmConsent} onCancel={() => setConsentOpen(false)} />}
          <FigurePanel images={images} code={code} error={genError} onRegenerate={() => void runGeneration()} busy={busy} />
        </section>
      )}

      <NetworkTracePanel calls={calls}>
        {calls.filter((c) => c.hadBody).length === 0
          ? "None of these carried your data's values — only column names and your chart choice, on the one request that leaves this tab."
          : "A request with a body only happens after you confirm the figure-generation consent notice above."}
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
