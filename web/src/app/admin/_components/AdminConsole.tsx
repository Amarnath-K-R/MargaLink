"use client";

import { useState, type ReactNode } from "react";
import { useAccount } from "@/components/account/useAccount";
import { FEATURES, money, num, type Stats, type Totals } from "./admin";
import { cell, Loading, Table, useAdmin } from "./parts";
import Bars from "./Bars";
import UsersTab from "./UsersTab";
import AccessTab from "./AccessTab";
import ActivityTab from "./ActivityTab";

// The console's five tabs. Overview and AI usage share one request; the
// other tabs load their own when opened. Everything is read fresh each time
// a tab opens, since it's a few developers looking now and then.
const TABS = ["Overview", "AI usage", "Users", "Access", "Activity"] as const;
type Tab = (typeof TABS)[number];

export default function AdminConsole() {
  const account = useAccount();
  const [tab, setTab] = useState<Tab>("Overview");
  if (account.status === "unknown") return null;
  if (account.status !== "in" || !account.developer) return <p className="sheet p-6 text-ink-soft">This page is for MargaLink&apos;s developers.</p>;
  return (
    <div>
      <div role="tablist" aria-label="Console" className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t} type="button" role="tab" id={`tab-${t}`} aria-selected={tab === t} aria-controls="console-panel" onClick={() => setTab(t)} className="clay-chip h-9 px-4 text-sm">
            {t}
          </button>
        ))}
      </div>
      <div role="tabpanel" id="console-panel" aria-labelledby={`tab-${tab}`} className="mt-6">
        {tab === "Overview" || tab === "AI usage" ? <StatsTab tab={tab} /> : tab === "Users" ? <UsersTab /> : tab === "Access" ? <AccessTab /> : <ActivityTab />}
      </div>
    </div>
  );
}

function StatsTab({ tab }: { tab: "Overview" | "AI usage" }) {
  const { data, error } = useAdmin<Stats>("stats");
  if (!data) return <Loading error={error} />;
  return tab === "Overview" ? <Overview stats={data} /> : <Usage stats={data} />;
}

function Tile({ label, value, children }: { label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div className="sheet p-5">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="mt-1 font-serif text-3xl font-medium tabular-nums">{value}</p>
      {children && <p className="mt-1 text-sm text-ink-soft">{children}</p>}
    </div>
  );
}

function Overview({ stats }: { stats: Stats }) {
  const o = stats.overview;
  const days = stats.usage.days;
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Tile label="Accounts" value={num(o.users.total)}>
          {num(o.users.new7)} new this week
        </Tile>
        <Tile label="Active, last 24 hours" value={num(o.active.day)}>
          {num(o.active.week)} this week, {num(o.active.month)} in 30 days
        </Tile>
        <Tile label="Beta testers signed in" value={`${num(o.list.beta.joined)} of ${num(o.list.beta.listed)}`}>
          Developers: {num(o.list.developer.joined)} of {num(o.list.developer.listed)}
        </Tile>
        <Tile label="Requests, last 24 hours" value={num(o.requests.day)}>
          {num(o.requests.errors)} failed, {num(o.requests.refused)} refused
        </Tile>
        <Tile label="AI cost, 30 days" value={money(o.ai.cost)}>
          {num(o.ai.calls)} calls, {num(o.ai.input)} tokens in, {num(o.ai.output)} out
        </Tile>
        <Tile label="Coins spent, 30 days" value={num(o.coins.spent)}>
          {num(o.coins.welcomed)} given on sign-up, {num(o.coins.granted)} given here
        </Tile>
      </div>
      <div className="sheet p-5">
        <Bars days={days.map((d) => d.day)} values={days.map((d) => d.requests)} label="API requests a day, last 30 days" format={num} />
      </div>
    </div>
  );
}

function TotalsCells({ t }: { t: Totals }) {
  return (
    <>
      <td className={cell}>{num(t.calls)}</td>
      <td className={cell}>{num(t.input)}</td>
      <td className={cell}>{num(t.output)}</td>
      <td className={cell}>{money(t.cost)}</td>
    </>
  );
}

function Usage({ stats }: { stats: Stats }) {
  const { days, routes, people } = stats.usage;
  return (
    <div className="space-y-6">
      <div className="sheet p-5">
        <Bars days={days.map((d) => d.day)} values={days.map((d) => d.cost ?? 0)} label="Estimated AI cost a day, in US dollars, last 30 days" format={(n) => `$${n.toFixed(2)}`} />
      </div>
      <Table head={["Feature", "Calls", "Tokens in", "Tokens out", "Cost"]} caption="By feature, last 30 days">
        {routes.map((r) => (
          <tr key={r.route}>
            <th scope="row" className="px-5 py-3 text-left font-medium">
              {FEATURES[r.route] ?? r.route} <span className="ml-1 font-normal text-ink-soft">{r.route}</span>
            </th>
            <TotalsCells t={r} />
          </tr>
        ))}
      </Table>
      <Table head={["Account", "Calls", "Tokens in", "Tokens out", "Cost"]} caption="The 20 heaviest users, last 30 days">
        {people.map((p) => (
          <tr key={p.userId ?? "none"}>
            <th scope="row" className="px-5 py-3 text-left font-medium">
              {p.email ?? "Signed out, or a deleted account"}
            </th>
            <TotalsCells t={p} />
          </tr>
        ))}
      </Table>
      <p className="text-xs text-ink-soft">Costs are estimates at Anthropic&apos;s standard rates for each model. Unknown: a model with no price in the console yet.</p>
    </div>
  );
}
