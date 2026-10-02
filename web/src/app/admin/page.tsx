import type { Metadata } from "next";
import PageHeader from "@/components/layout/PageHeader";
import AdminConsole from "./_components/AdminConsole";

export const metadata: Metadata = {
  title: "Console | MargaLink",
  description: "MargaLink's developer console.",
  robots: { index: false },
};

// The developer console. The page gate (functions/_middleware.ts) lets only
// developers load it, and every /api/admin request is checked again.
export default function AdminPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pt-3 pb-20">
      <PageHeader
        width="3xl"
        page="admin"
        title="Console"
        subtitle={<p className="mt-3 text-lg text-ink-soft">Who&apos;s using MargaLink, what the AI costs, and who&apos;s on the beta list.</p>}
      />
      <AdminConsole />
    </main>
  );
}
