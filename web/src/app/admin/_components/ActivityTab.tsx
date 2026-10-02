"use client";

import { useEffect, useState } from "react";
import { admin, num, when } from "./admin";
import { cell, Loading, Table } from "./parts";

type Event = { id: number; at: number; route: string; method: string; status: number; ms: number; model: string | null; input: number | null; output: number | null; userId: string | null; email: string | null };
type Page = { events: Event[]; next: number | null };

// The activity log: every API request of the last 30 days, newest first,
// metadata only (no query, body or IP). Filters go to the server; Older
// fetches the next page.
export default function ActivityTab() {
  const [route, setRoute] = useState("");
  const [appliedRoute, setAppliedRoute] = useState(""); // on Enter or leaving the field, not every keystroke
  const [status, setStatus] = useState("");
  const [ai, setAi] = useState(false);
  const [events, setEvents] = useState<Event[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = (before?: number) => {
    const q = new URLSearchParams();
    if (appliedRoute) q.set("route", appliedRoute);
    if (status) q.set("status", status);
    if (ai) q.set("ai", "1");
    if (before) q.set("before", String(before));
    return `events${q.size ? `?${q}` : ""}`;
  };
  const first = query();
  useEffect(() => {
    admin<Page>(first).then(
      (page) => {
        setEvents(page.events);
        setNext(page.next);
        setError(null);
      },
      (e: Error) => setError(e.message),
    );
  }, [first]);
  async function older(before: number) {
    try {
      const page = await admin<Page>(query(before));
      setEvents((prev) => [...(prev ?? []), ...page.events]);
      setNext(page.next);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }
  const apply = () => setAppliedRoute(route.trim());

  return (
    <div className="space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <div className="flex flex-col gap-1.5">
          <label htmlFor="activity-route" className="text-xs font-medium text-ink-soft">
            Route starts with
          </label>
          <input id="activity-route" value={route} onChange={(e) => setRoute(e.target.value)} onBlur={apply} placeholder="/api/review" className="clay-input h-10 w-56 text-sm" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="activity-status" className="text-xs font-medium text-ink-soft">
            Status
          </label>
          <select id="activity-status" value={status} onChange={(e) => setStatus(e.target.value)} className="clay-select h-10 text-sm">
            <option value="">All</option>
            <option value="2">Answered (2xx)</option>
            <option value="3">Redirected (3xx)</option>
            <option value="4">Refused (4xx)</option>
            <option value="5">Failed (5xx)</option>
          </select>
        </div>
        <label className="flex h-10 items-center gap-2 text-sm">
          <input type="checkbox" checked={ai} onChange={(e) => setAi(e.target.checked)} />
          AI calls only
        </label>
      </form>
      {!events ? (
        <Loading error={error} />
      ) : (
        <>
          <Table head={["Time", "Account", "Request", "Status", "Took", "AI tokens in, out"]} left={3}>
            {events.map((e) => (
              <tr key={e.id}>
                <th scope="row" className="px-5 py-2.5 text-left font-normal tabular-nums">
                  {when(e.at)}
                </th>
                <td className="px-3 py-2.5">{e.email ?? <span className="text-ink-soft">None</span>}</td>
                <td className="px-3 py-2.5 font-mono text-xs">
                  {e.method} {e.route}
                </td>
                <td className={`${cell} ${e.status >= 500 ? "text-away" : ""}`}>{e.status}</td>
                <td className={cell}>{num(e.ms)} ms</td>
                <td className={cell}>{e.model ? `${num(e.input ?? 0)}, ${num(e.output ?? 0)}` : ""}</td>
              </tr>
            ))}
          </Table>
          {events.length === 0 && <p className="text-sm text-ink-soft">Nothing matches these filters in the last 30 days.</p>}
          {error && (
            <p role="alert" className="text-sm text-away">
              {error}
            </p>
          )}
          {next !== null && (
            <button type="button" onClick={() => void older(next)} className="clay-btn h-10 px-5 text-sm">
              Older
            </button>
          )}
        </>
      )}
    </div>
  );
}
