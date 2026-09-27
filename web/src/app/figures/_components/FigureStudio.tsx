"use client";

import type { ReactNode } from "react";
import { LIMITS, validateFigureSpec } from "@/lib/figureSpec";
import PaperDropzone from "@/components/PaperDropzone";
import ErrorText from "@/components/ErrorText";
import DataPrep from "./DataPrep";
import Gallery from "./Gallery";
import Describe from "./Describe";
import FigurePreview from "./FigurePreview";
import ExportBar from "./ExportBar";
import PanelEditor from "./PanelEditor";
import StyleBar from "./StyleBar";
import RecipeImportExport from "./RecipeImportExport";
import type { FiguresApi } from "./useFigures.ts";

// The studio itself — attach, check, describe or pick a template, adjust,
// preview, export — over useFigures. The /figures page wraps it in its
// header and trace; the writing workspace shows it in a window.
// `exportExtra` sits beside the Export button (the page's "Add to a paper",
// the workspace's "Insert into paper").
export default function FigureStudio({ figures: f, exportExtra }: { figures: FiguresApi; exportExtra?: ReactNode }) {
  return (
    <>
      <section>
        <p className="mb-3 text-sm font-medium text-accent">1. Attach your data</p>
        <PaperDropzone busy={false} onFile={(file) => void f.onFile(file)} accept=".csv,.tsv,.txt,.xlsx" title="Drop a CSV or XLSX" ariaLabel="Upload a CSV or XLSX spreadsheet" />
        {f.uploadError && <ErrorText>{f.uploadError}</ErrorText>}
        {f.workbook && !f.uploadError && <p className="mt-3 text-sm text-ink-soft">Loaded {f.workbook.fileName}.</p>}
      </section>

      {f.workbook && f.prep && (
        <section className="mt-12 border-t border-line pt-8">
          <p className="mb-3 text-sm font-medium text-accent">2. Check how it was read</p>
          <DataPrep key={f.workbook.fileName} workbook={f.workbook} options={f.prep} onChange={f.setPrep} dataset={f.dataset} sourceColumns={f.sourceColumns} />
          {f.prepError && <ErrorText>{f.prepError}</ErrorText>}
        </section>
      )}

      {f.dataset && (
        <div className="mt-12 grid gap-10 border-t border-line pt-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div>
            <section>
              <p className="mb-3 text-sm font-medium text-accent">3. Describe it to Claude…</p>
              <Describe dataset={f.dataset} spec={f.spec && typeof validateFigureSpec(f.spec) !== "string" ? f.spec : null} onResult={f.onClaude} />
            </section>
            <section className="mt-10">
              <p className="mb-3 text-sm font-medium text-accent">…or start from a template</p>
              <Gallery templates={f.templates} selected={f.templateId} onPick={f.pick} />
            </section>
            {f.spec && (
              <section className="mt-10 border-t border-line pt-8" key={f.specKey}>
                <p className="mb-3 text-sm font-medium text-accent">4. Adjust</p>
                <StyleBar spec={f.spec} onChange={f.setSpec} />
                <div className="mt-6 flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Panels">
                  {f.spec.panels.map((p, i) => (
                    <button
                      key={i}
                      type="button"
                      role="tab"
                      aria-selected={f.selected === i}
                      onClick={() => f.setSelected(i)}
                      className={`rounded-sm border px-3 py-1 text-sm ${f.selected === i ? "border-accent bg-accent-soft" : "border-line bg-paper-alt hover:border-accent"}`}
                    >
                      Panel {String.fromCharCode(97 + i)} · {p.family}
                    </button>
                  ))}
                  <button type="button" onClick={f.addPanel} disabled={f.spec.panels.length >= LIMITS.panels} className="px-2 py-1 text-sm text-accent disabled:opacity-40">
                    Add panel
                  </button>
                  {f.spec.panels.length > 1 && (
                    <button type="button" onClick={() => f.removePanel(f.selected)} className="px-2 py-1 text-sm text-accent">
                      Remove panel {String.fromCharCode(97 + f.selected)}
                    </button>
                  )}
                </div>
                <div className="mt-4">
                  <PanelEditor key={f.selected} panel={f.spec.panels[f.selected]} onChange={(p) => f.setPanel(f.selected, p)} dataset={f.dataset} />
                </div>
                {f.hook && (
                  <details className="mt-6 border-t border-line pt-4 text-sm" data-testid="hook" open={!f.hookApproved}>
                    <summary className="cursor-pointer font-medium">Custom tweak (Python){f.hookApproved ? " — running" : " — not running yet"}</summary>
                    <pre className="mt-2 max-h-60 overflow-auto rounded-sm border border-line bg-paper-alt p-2 text-xs">{f.hook}</pre>
                    {!f.hookApproved && (
                      <p className="mt-2 text-ink-soft">
                        Read it before running: it runs on this device, after the figure is drawn, with network access switched off. Only run code you
                        understand or got from someone you trust.
                      </p>
                    )}
                    <div className="mt-2 flex gap-4">
                      {!f.hookApproved && (
                        <button type="button" onClick={f.approveHook} className="text-accent hover:underline">
                          Run this tweak
                        </button>
                      )}
                      <button type="button" onClick={f.removeHook} className="text-accent hover:underline">
                        Remove tweak
                      </button>
                    </div>
                  </details>
                )}
                <div className="mt-6 border-t border-line pt-4">
                  <RecipeImportExport spec={f.spec} hook={f.hook} columns={f.dataset.columns} onLoad={f.loadRecipe} />
                </div>
              </section>
            )}
          </div>
          <section className="lg:sticky lg:top-6 lg:self-start">
            <p className="mb-3 text-sm font-medium text-accent">Your figure</p>
            <FigurePreview state={f.problem ? { ...f.preview, busy: false, stage: null } : f.preview} problem={f.problem} />
            <div className="mt-6">
              <ExportBar disabled={!f.spec || !!f.problem} onExport={f.onExport}>
                {exportExtra}
              </ExportBar>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
