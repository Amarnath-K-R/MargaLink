"use client";

import { useState } from "react";
import { admin, date, money, num, when } from "./admin";
import { cell, Loading, Table, useAdmin } from "./parts";

type User = { id: string; email: string; createdAt: number; balance: number; roles: string[]; lastSeen: number | null; aiCalls: number; input: number; output: number; cost: number | null };

// Every account, most recently seen first: its balance, its roles on the
// access list, and its AI use over the activity log's 30 days. "Give coins"
// adds an Adjustment to its history.
export default function UsersTab() {
  const { data, setData, error } = useAdmin<{ users: User[] }>("users");
  if (!data) return <Loading error={error} />;
  const setBalance = (id: string, balance: number) => setData({ users: data.users.map((u) => (u.id === id ? { ...u, balance } : u)) });
  return (
    <Table head={["Account", "Balance", "Last seen", "AI calls", "Tokens in", "Tokens out", "Cost", ""]} caption={`${num(data.users.length)} accounts`}>
      {data.users.map((u) => (
        <UserRow key={u.id} user={u} onBalance={(b) => setBalance(u.id, b)} />
      ))}
    </Table>
  );
}

function UserRow({ user: u, onBalance }: { user: User; onBalance: (balance: number) => void }) {
  const [giving, setGiving] = useState(false);
  const [coins, setCoins] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function give(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await admin<{ balance: number }>("users", { userId: u.id, coins: Number(coins) });
      onBalance(r.balance);
      setGiving(false);
      setCoins("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <tr>
      <th scope="row" className="px-5 py-3 text-left font-medium">
        {u.email}
        <span className="block text-xs font-normal text-ink-soft">
          {u.roles.length ? u.roles.map((r) => (r === "beta" ? "Beta tester" : "Developer")).join(", ") : "Not on the list"}, since {date(u.createdAt)}
        </span>
      </th>
      <td className={cell}>{num(u.balance)}</td>
      <td className={cell}>{u.lastSeen ? when(u.lastSeen) : "Never"}</td>
      <td className={cell}>{num(u.aiCalls)}</td>
      <td className={cell}>{num(u.input)}</td>
      <td className={cell}>{num(u.output)}</td>
      <td className={cell}>{money(u.cost)}</td>
      <td className="px-3 py-3 text-right">
        {giving ? (
          <form onSubmit={give} className="flex items-center justify-end gap-2">
            <label htmlFor={`give-${u.id}`} className="sr-only">
              Coins to give
            </label>
            <input id={`give-${u.id}`} type="number" min={1} max={10000} step={1} required value={coins} onChange={(e) => setCoins(e.target.value)} className="clay-input h-8 w-20 text-sm" />
            <button type="submit" disabled={busy} className="clay-chip">
              Give
            </button>
            <button type="button" onClick={() => setGiving(false)} className="text-xs text-ink-soft hover:underline">
              Cancel
            </button>
            {error && (
              <span role="alert" className="text-xs text-away">
                {error}
              </span>
            )}
          </form>
        ) : (
          <button type="button" onClick={() => setGiving(true)} className="clay-chip">
            Give coins
          </button>
        )}
      </td>
    </tr>
  );
}
