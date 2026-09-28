"use client";

// What a window that reads the paper shows until there is a compiled PDF.
export default function CompileFirst({ compiling, onCompile }: { compiling: boolean; onCompile: () => void }) {
  return (
    <div className="rounded-sm border border-line bg-paper-alt p-4 text-sm">
      <p>Compile the paper first: these read the compiled PDF, on this device.</p>
      <button
        type="button"
        onClick={onCompile}
        disabled={compiling}
        className="mt-3 rounded-sm border border-line bg-paper px-4 py-1.5 hover:border-accent disabled:cursor-not-allowed disabled:opacity-60"
      >
        {compiling ? "Compiling…" : "Compile"}
      </button>
    </div>
  );
}
