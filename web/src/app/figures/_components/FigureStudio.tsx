"use client";

import type { ReactNode } from "react";
import { LIMITS, validateFigureSpec } from "@/lib/figures/figureSpec";
import PaperDropzone from "@/components/ui/PaperDropzone";
import ErrorText from "@/components/ui/ErrorText";
import Step from "@/components/ui/Step";
import { Check } from "lucide-react";
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
const TINT = "#f1d2c2"; // the Figures bead

export default function FigureStudio({ figures: f, exportExtra }: { figures: FiguresApi; exportExtra?: ReactNode }) {
  return (
    <div className="space-y-6">
      <Step n={1} tint={TINT} title="Attach your data" hint="A CSV or an Excel sheet. It's read in this tab; the values never leave it.">
        <PaperDropzone busy={false} onFile={(file) => void f.onFile(file)} accept=".csv,.tsv,.txt,.xlsx" title="Drop a CSV or XLSX" ariaLabel="Upload a CSV or XLSX spreadsheet" />
        {f.uploadError && <ErrorText>{f.uploadError}</ErrorText>}
        {f.workbook && !f.uploadError && (
          <p className="mt-4 flex items-center gap-2 text-sm">
            <span aria-hidden className="grid h-5 w-5 place-items-center rounded-full bg-accent text-white">
              <Check size={12} strokeWidth={3} />
            </span>
            Loaded {f.workbook.fileName}.
          </p>
        )}
      </Step>

      {f.workbook && f.prep && (
        <Step n={2} tint={TINT} title="Check how it was read" hint="The header row, number formats and column types, guessed from the file. Fix anything that looks wrong.">
          <DataPrep key={f.workbook.fileName} workbook={f.workbook} options={f.prep} onChange={f.setPrep} dataset={f.dataset} sourceColumns={f.sourceColumns} />
          {f.prepError && <ErrorText>{f.prepError}</ErrorText>}
        </Step>
      )}

      {f.dataset && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="min-w-0 space-y-6">
            <Step n={3} tint={TINT} title="Describe it to Claude…">
              <Describe key={f.uploadId} dataset={f.dataset} spec={f.spec && typeof validateFigureSpec(f.spec) !== "string" ? f.spec : null} onResult={f.onClaude} />
            </Step>
            <section className="clay p-6 sm:p-8">
              <h2 className="mb-5 font-serif text-xl font-medium tracking-[-0.01em]">…or start from a template</h2>
              <Gallery templates={f.templates} selected={f.templateId} onPick={f.pick} />
            </section>
            {f.spec && (
              <Step n={4} tint={TINT} title="Adjust" key={f.specKey}>
                <StyleBar spec={f.spec} onChange={f.setSpec} />
                <div className="mt-6 flex flex-wrap items-center gap-2" role="tablist" aria-label="Panels">
                  {f.spec.panels.map((p, i) => (
                    <button key={i} type="button" role="tab" aria-selected={f.selected === i} onClick={() => f.setSelected(i)} className="clay-chip h-8 px-3.5 text-sm">
                      Panel {String.fromCharCode(97 + i)} · {p.family}
                    </button>
                  ))}
                  <button type="button" onClick={f.addPanel} disabled={f.spec.panels.length >= LIMITS.panels} className="clay-btn h-8 px-3 text-sm">
                    Add panel
                  </button>
                  {f.spec.panels.length > 1 && (
                    <button type="button" onClick={() => f.removePanel(f.selected)} className="clay-btn h-8 px-3 text-sm text-ink-soft">
                      Remove panel {String.fromCharCode(97 + f.selected)}
                    </button>
                  )}
                </div>
                <div className="mt-5">
                  <PanelEditor key={f.selected} panel={f.spec.panels[f.selected]} onChange={(p) => f.setPanel(f.selected, p)} dataset={f.dataset} />
                </div>
                {f.hook && (
                  <details className="clay-well mt-6 rounded-2xl p-4 text-sm" data-testid="hook" open={!f.hookApproved}>
                    <summary className="cursor-pointer font-medium">Custom tweak (Python){f.hookApproved ? " (running)" : " (not running yet)"}</summary>
                    <pre className="sheet mt-3 max-h-60 overflow-auto p-3 text-xs">{f.hook}</pre>
                    {!f.hookApproved && (
                      <p className="mt-3 text-ink-soft">
                        Read it before running: it runs on this device, after the figure is drawn, with network access switched off. Only run code you
                        understand or got from someone you trust.
                      </p>
                    )}
                    <div className="mt-3 flex gap-2">
                      {!f.hookApproved && (
                        <button type="button" onClick={f.approveHook} className="clay-btn clay-primary">
                          Run this tweak
                        </button>
                      )}
                      <button type="button" onClick={f.removeHook} className="clay-btn">
                        Remove tweak
                      </button>
                    </div>
                  </details>
                )}
                <div className="mt-6 border-t border-line/70 pt-5">
                  <RecipeImportExport spec={f.spec} hook={f.hook} columns={f.dataset.columns} onLoad={f.loadRecipe} />
                </div>
              </Step>
            )}
          </div>
          <section className="min-w-0 lg:sticky lg:top-24 lg:self-start">
            <h2 className="mb-3 flex items-center gap-2 px-1 text-sm font-medium text-accent">
              <span aria-hidden className={`h-1.5 w-1.5 rounded-full bg-accent ${f.preview.busy ? "pulse-dot" : ""}`} />
              Your figure
            </h2>
            <FigurePreview state={f.problem ? { ...f.preview, busy: false, stage: null } : f.preview} problem={f.problem} />
            <div className="mt-5">
              <ExportBar disabled={!f.spec || !!f.problem} onExport={f.onExport}>
                {exportExtra}
              </ExportBar>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
