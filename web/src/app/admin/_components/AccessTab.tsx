"use client";

import { useState } from "react";
import { admin, date } from "./admin";
import { Loading, Table, useAdmin } from "./parts";

type Entry = { email_key: string; email: string; role: "beta" | "developer"; note: string | null; added_at: number; user_id: string | null };
type Added = { added: string[]; already: string[]; invalid: string[] };

// The beta and developer lists. Addresses are matched however they're
// spelled (Gmail dots, +tags), so each also shows the form it's matched as.
// Removing someone's last role signs them out everywhere; their account and
// coins stay. The last developer can't be removed.
export default function AccessTab() {
  const { data, error, reload } = useAdmin<{ entries: Entry[] }>("access");
  const [emails, setEmails] = useState("");
  const [role, setRole] = useState<Entry["role"]>("beta");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Added | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const list = emails.split(/[\s,;]+/).filter(Boolean);
      setResult(await admin<Added>("access", { action: "add", role, emails: list, note: note.trim() || undefined }));
      setEmails("");
      reload();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  async function remove(entry: Entry) {
    const what = entry.role === "beta" ? "the beta list" : "the developers";
    if (!window.confirm(`Remove ${entry.email} from ${what}? Without a role left, they're signed out everywhere.`)) return;
    setProblem(null);
    try {
      await admin("access", { action: "remove", role: entry.role, emailKey: entry.email_key });
      reload();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-6">
      <form onSubmit={add} className="sheet grid gap-3 p-5 sm:grid-cols-[1fr_14rem]">
        <div className="flex flex-col gap-1.5 sm:row-span-2">
          <label htmlFor="access-emails" className="text-xs font-medium text-ink-soft">
            Addresses
          </label>
          <textarea id="access-emails" required rows={4} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="One or more, separated by commas or new lines" className="clay-input min-h-24 py-2 text-sm" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="access-role" className="text-xs font-medium text-ink-soft">
            List
          </label>
          <select id="access-role" value={role} onChange={(e) => setRole(e.target.value as Entry["role"])} className="clay-select h-10 text-sm">
            <option value="beta">Beta testers</option>
            <option value="developer">Developers</option>
          </select>
          <label htmlFor="access-note" className="mt-1 text-xs font-medium text-ink-soft">
            Note
          </label>
          <input id="access-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} placeholder="Optional, for you" className="clay-input h-10 text-sm" />
        </div>
        <button type="submit" disabled={busy || !emails.trim()} className="clay-btn clay-primary h-10 justify-center text-sm font-medium disabled:opacity-50">
          {role === "beta" ? "Add to the beta list" : "Add to the developers"}
        </button>
        {result && (
          <p aria-live="polite" className="text-sm text-ink-soft sm:col-span-2">
            Added {result.added.length}.{result.already.length > 0 && ` Already listed: ${result.already.join(", ")}.`}
            {result.invalid.length > 0 && <span className="text-away"> Not addresses: {result.invalid.join(", ")}.</span>}
          </p>
        )}
      </form>
      {problem && (
        <p role="alert" className="text-sm text-away">
          {problem}
        </p>
      )}
      {!data ? (
        <Loading error={error} />
      ) : (
        (["developer", "beta"] as const).map((r) => (
          <AccessList key={r} title={r === "beta" ? "Beta testers" : "Developers"} entries={data.entries.filter((e) => e.role === r)} onRemove={remove} />
        ))
      )}
    </div>
  );
}

function AccessList({ title, entries, onRemove }: { title: string; entries: Entry[]; onRemove: (e: Entry) => void }) {
  return (
    <Table head={["Address", "Note", "Added", "Signed in", ""]} caption={`${title}: ${entries.length}`} left={2}>
      {entries.map((e) => (
        <tr key={e.email_key}>
          <th scope="row" className="px-5 py-3 text-left font-medium">
            {e.email}
            {e.email !== e.email_key && <span className="block text-xs font-normal text-ink-soft">matched as {e.email_key}</span>}
          </th>
          <td className="px-3 py-3 text-ink-soft">{e.note ?? ""}</td>
          <td className="px-3 py-3 text-right tabular-nums">{date(e.added_at)}</td>
          <td className="px-3 py-3 text-right">{e.user_id ? "Yes" : "Not yet"}</td>
          <td className="px-3 py-3 text-right">
            <button type="button" onClick={() => onRemove(e)} className="clay-chip">
              Remove
            </button>
          </td>
        </tr>
      ))}
    </Table>
  );
}
