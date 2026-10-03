"use client";

import { useEffect, useState } from "react";

export type NetworkCall = { method: string; url: string; hadBody: boolean };

// Instruments fetch for the page's lifetime, so /write's status line can
// count the requests that carried a body (what was sent, if anything)
// whenever they fire, whichever tool window sent them.
export function useNetworkTrace() {
  const [calls, setCalls] = useState<NetworkCall[]>([]);

  useEffect(() => {
    const originalFetch = window.fetch;
    window.fetch = async (...args: Parameters<typeof fetch>) => {
      const [input, init] = args;
      const url = typeof input === "string" ? input : input.toString();
      setCalls((prev) => [...prev, { method: init?.method ?? "GET", url, hadBody: Boolean(init?.body) }]);
      return originalFetch(...args);
    };
    return () => {
      window.fetch = originalFetch;
    };
  }, []);

  return { calls };
}
