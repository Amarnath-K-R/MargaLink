"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { admin } from "./admin";

// The pieces every console tab uses: a request, its loading and error line,
// and a table in the site's style (pricing/page.tsx).

/** Loads one console request; `reload` asks again. */
export function useAdmin<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    admin<T>(path).then(
      (d) => {
        setData(d);
        setError(null);
      },
      (e: Error) => setError(e.message),
    );
  }, [path]);
  useEffect(reload, [reload]);
  return { data, setData, error, reload };
}

export function Loading({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="text-sm text-away">
      {error}
    </p>
  ) : (
    <p className="text-sm text-ink-soft">Loading…</p>
  );
}

// `left`: how many leading columns hold words (left-aligned); the rest are figures.
export function Table({ head, children, caption, left = 1 }: { head: string[]; children: ReactNode; caption?: string; left?: number }) {
  return (
    <div className="sheet overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
        {caption && <caption className="px-5 pt-4 text-left text-xs font-medium text-accent">{caption}</caption>}
        <thead>
          <tr className="border-b border-line/70 text-left text-xs text-ink-soft">
            {head.map((h, i) => (
              <th key={h} scope="col" className={`py-3 font-medium ${i ? "px-3" : "px-5"} ${i < left ? "" : "text-right"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line/70">{children}</tbody>
      </table>
    </div>
  );
}

export const cell = "px-3 py-3 text-right tabular-nums";
