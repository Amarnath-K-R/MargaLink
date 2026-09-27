"use client";

import Link from "next/link";
import { NetworkTracePanel, useNetworkTrace } from "@/components/NetworkTrace";
import PageHeader from "@/components/PageHeader";
import AddToPaper from "./_components/AddToPaper";
import FigureStudio from "./_components/FigureStudio";
import { useFigures } from "./_components/useFigures.ts";

// Attach a spreadsheet → check how it was read → start from a template →
// the figure redraws on this device on every change. The studio itself is
// FigureStudio over useFigures (shared with the writing workspace's Figures
// window); this page adds the header, the network trace and "Add to a paper".
export default function FiguresPage() {
  const { calls } = useNetworkTrace();
  const f = useFigures();

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

      <FigureStudio
        figures={f}
        exportExtra={
          <AddToPaper
            disabled={!f.spec || !!f.problem}
            getPdf={async () => {
              const pdf = (await f.onExport(["pdf"], 300)).pdf;
              if (!pdf) throw new Error("The PDF export came back empty — try Export first to see why.");
              return Uint8Array.from(atob(pdf), (c) => c.charCodeAt(0));
            }}
          />
        }
      />

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
