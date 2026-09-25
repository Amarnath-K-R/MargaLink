"use client";

import Link from "next/link";
import { useEffect } from "react";
import { ArrowUpRight, BookOpen, ScanSearch, FileCheck2, BarChart3, PenLine, X } from "lucide-react";

const TOOLS = [
  {
    href: "/journals",
    icon: BookOpen,
    title: "Browse journals",
    description: "Fees, fields, indexing — no upload needed.",
  },
  {
    href: "/match",
    icon: ScanSearch,
    title: "Match your paper",
    description: "Local fit scoring and a structural format check.",
  },
  {
    href: "/review",
    icon: FileCheck2,
    title: "Get it reviewed",
    description: "An optional AI review — sent only after you agree.",
  },
  {
    href: "/write",
    icon: PenLine,
    title: "Write the paper",
    description: "Your journal's LaTeX template, compiled in your browser.",
  },
  {
    href: "/figures",
    icon: BarChart3,
    title: "Make figures",
    description: "Publication-ready charts — your data never leaves the tab.",
  },
] as const;

export default function ToolsOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="tools-overlay" role="dialog" aria-modal="true" aria-label="Explore tools">
      <button className="tools-backdrop" aria-label="Close" onClick={onClose} />
      <div className="tools-dialog">
        <div className="tools-dialog-head">
          <h2 className="tools-title">Which tool do you need?</h2>
          <button className="tools-close" aria-label="Close" onClick={onClose}>
            <X size={18} strokeWidth={1.8} />
          </button>
        </div>
        <div className="tools-grid">
          {TOOLS.map(({ href, icon: Icon, title, description }) => (
            <Link key={href} href={href} className="tools-card" onClick={onClose}>
              <Icon size={22} strokeWidth={1.6} aria-hidden="true" />
              <strong>{title}</strong>
              <small>{description}</small>
              <ArrowUpRight size={16} className="tools-card-arrow" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
