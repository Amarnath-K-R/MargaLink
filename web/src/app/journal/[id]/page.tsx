import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getAllJournals, getPrerenderedJournals } from "@/lib/journalsServer";
import { shortId } from "@/lib/journalUrl";
import type { JournalMeta } from "@/lib/match";
import JournalDetail from "@/components/JournalDetail";
import PageHeader from "@/components/PageHeader";

export async function generateStaticParams() {
  return getPrerenderedJournals().map((j) => ({ id: shortId(j.id) }));
}

function findJournal(id: string): JournalMeta | undefined {
  return getAllJournals().find((j) => shortId(j.id) === id);
}

export async function generateMetadata(props: PageProps<"/journal/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const journal = findJournal(id);
  if (!journal) return { title: "Journal not found — MargaLink" };
  return {
    title: `${journal.display_name} — MargaLink`,
    description: `Journal info and paper matching for ${journal.display_name}.`,
  };
}

export default async function JournalPage(props: PageProps<"/journal/[id]">) {
  const { id } = await props.params;
  const journal = findJournal(id);
  if (!journal) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-14 sm:py-20">
      <PageHeader width="2xl" links={[{ href: "/journals", label: "← Browse journals" }]} title={journal.display_name} />
      <JournalDetail journal={journal} />
    </main>
  );
}
