"use client";

import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import ClayDesk from "./ClayDesk.tsx";
import type { DeskLayout } from "./clayDesk.ts";
import "./demo.css";

export type Variant = "a" | "b" | "c";

// Three compositions of the same clay desk + "Find your path." — for picking a
// direction, not for shipping as-is.
const LAYOUTS: Record<Variant, DeskLayout> = {
  // A: the phrase leads on the left; the desk is a cluster on the right and
  // the path runs from the pencil back toward the words.
  a: {
    camera: { x: 1.2, y: 10.5, z: 11.5, lookX: 2.4, lookZ: 0.2, fov: 30 },
    items: [
      { kind: "graph", x: 4.6, z: -1.6, rotY: 0.28 },
      { kind: "chart", x: 4.7, z: -1.9, rotY: 0.28, lift: 0.036 },
      { kind: "stack", x: 7.4, z: 1.1, rotY: -0.2 },
      { kind: "ruler", x: 4.4, z: 2.9, rotY: 0.06 },
      { kind: "pencil", x: 2.9, z: 0.9, rotY: 2.7 },
      { kind: "notebook", x: 8.8, z: -2.6, rotY: 0.45 },
      { kind: "plane", x: 2.4, z: -1.6, rotY: 2.6, lift: 1.5, scale: 0.6 },
      { kind: "pin", x: 5.1, z: 2.1 },
    ],
    path: [[0.8, 0.4], [1.4, 1.6], [2.8, 2.05], [4.0, 1.8], [4.9, 2.1]],
  },
  // B: the wordmark leads in the centre; the desk frames it from the edges
  // and the path threads underneath from the pencil to the pin.
  b: {
    camera: { x: 0, y: 12, z: 10, lookX: 0, lookZ: 0.4, fov: 32 },
    items: [
      { kind: "pencil", x: -6.2, z: -2.6, rotY: -0.25 },
      { kind: "graph", x: 6.4, z: -2.9, rotY: -0.3 },
      { kind: "chart", x: 6.4, z: -3.1, rotY: -0.3, lift: 0.036 },
      { kind: "ruler", x: -5.6, z: 3.6, rotY: -0.14 },
      { kind: "stack", x: 6.6, z: 2.8, rotY: 0.18 },
      { kind: "notebook", x: -9.6, z: 0.4, rotY: 0.5 },
      { kind: "plane", x: 2.6, z: -2.4, rotY: 0.3, lift: 1.6, scale: 0.6 },
      { kind: "pin", x: 3.8, z: 4.1 },
    ],
    path: [[-3.6, -1.9], [-4.3, 0.6], [-3.4, 2.7], [-0.8, 3.7], [2.0, 3.8], [3.6, 4.1]],
  },
  // C: a flat-lay from above, objects scattered across the page behind
  // stacked cutout labels.
  c: {
    camera: { x: 0, y: 15, z: 6.5, lookX: 0.4, lookZ: 0, fov: 34 },
    items: [
      { kind: "graph", x: 6.6, z: -2.6, rotY: -0.35 },
      { kind: "ruler", x: 1.6, z: -4.2, rotY: 0.12 },
      { kind: "pencil", x: 4.4, z: 1.2, rotY: 2.3 },
      { kind: "stack", x: 9.8, z: 1.2, rotY: 0.22 },
      { kind: "chart", x: 7.6, z: 3.8, rotY: -0.2 },
      { kind: "notebook", x: -8.8, z: 3.0, rotY: -0.35 },
      { kind: "plane", x: 3.4, z: -2.6, rotY: 2.3, lift: 2.0, scale: 0.6 },
      { kind: "pin", x: -1.0, z: 3.0 },
    ],
    path: [[2.7, -0.3], [2.4, 1.0], [1.4, 2.4], [0.2, 2.3], [-0.6, 3.0], [-0.9, 3.0]],
  },
};

function Header() {
  return (
    <header className="demo-header">
      <span className="demo-brand">
        <span className="demo-brand-mark">M</span> MargaLink
      </span>
      <span className="demo-header-links">
        <Link href="/journals">Journals</Link>
        <Link href="/match">Match</Link>
        <Link href="/write">Write</Link>
      </span>
    </header>
  );
}

function Actions() {
  return (
    <div className="demo-actions">
      <Link href="/match" className="demo-button">
        Match your paper <ArrowRight size={16} />
      </Link>
      <Link href="/journals" className="demo-link">
        Browse journals <ArrowUpRight size={15} />
      </Link>
    </div>
  );
}

const DECK =
  "Find the journals that fit your paper, check it against their rules, write it in their template — without your manuscript ever leaving the browser.";

function Copy({ variant }: { variant: Variant }) {
  if (variant === "a")
    return (
      <div className="demo-copy demo-copy-a">
        <p className="demo-kicker">
          <span /> Marga · Sanskrit for “path”
        </p>
        <h1 className="demo-phrase">
          <span className="demo-in" style={{ animationDelay: "100ms" }}>
            Find your
          </span>
          <mark className="demo-cut demo-in" style={{ animationDelay: "260ms" }}>
            path.
          </mark>
        </h1>
        <p className="demo-wordmark demo-in" style={{ animationDelay: "420ms" }}>
          Marga<em>Link</em>
        </p>
        <p className="demo-deck demo-in" style={{ animationDelay: "520ms" }}>
          {DECK}
        </p>
        <div className="demo-in" style={{ animationDelay: "620ms" }}>
          <Actions />
        </div>
      </div>
    );
  if (variant === "b")
    return (
      <div className="demo-copy demo-copy-b">
        <h1 className="demo-wordmark-xl demo-in" style={{ animationDelay: "100ms" }}>
          Marga<mark className="demo-cut">Link</mark>
        </h1>
        <p className="demo-catch demo-in" style={{ animationDelay: "280ms" }}>
          Find your <em>path.</em>
        </p>
        <p className="demo-kicker demo-kicker-center demo-in" style={{ animationDelay: "380ms" }}>
          <span /> Marga is Sanskrit for “path” <span />
        </p>
        <p className="demo-deck demo-in" style={{ animationDelay: "480ms" }}>
          {DECK}
        </p>
        <div className="demo-in" style={{ animationDelay: "580ms" }}>
          <Actions />
        </div>
      </div>
    );
  return (
    <div className="demo-copy demo-copy-c">
      <h1 className="demo-stack">
        <span className="demo-in" style={{ animationDelay: "80ms" }}>
          Find
        </span>
        <span className="demo-in" style={{ animationDelay: "180ms" }}>
          your
        </span>
        <span className="demo-labels">
          <mark className="demo-cut demo-tilt-l demo-in" style={{ animationDelay: "300ms" }}>
            path.
          </mark>
          <mark className="demo-cut demo-cut-ink demo-tilt-r demo-in" style={{ animationDelay: "440ms" }}>
            MargaLink
          </mark>
        </span>
      </h1>
      <p className="demo-deck demo-in" style={{ animationDelay: "560ms" }}>
        <strong>Marga</strong> is Sanskrit for path. {DECK}
      </p>
      <div className="demo-in" style={{ animationDelay: "660ms" }}>
        <Actions />
      </div>
    </div>
  );
}

export default function DemoHero({ variant }: { variant: Variant }) {
  return (
    <div className={`demo-page demo-page-${variant}`}>
      <ClayDesk layout={LAYOUTS[variant]} className="demo-canvas" />
      <div className="demo-grain" aria-hidden="true" />
      <Header />
      <main className="demo-main">
        <Copy variant={variant} />
      </main>
      <nav className="demo-switch" aria-label="Demo versions">
        Demo
        {(["a", "b", "c"] as const).map((v) => (
          <Link key={v} href={`/demo/landing/${v}`} aria-current={v === variant ? "page" : undefined}>
            {v.toUpperCase()}
          </Link>
        ))}
      </nav>
    </div>
  );
}
