import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getAllJournals, getPrerenderedJournals, getTopicNames } from "@/lib/journalsServer";
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
  if (!journal) return { title: "Journal not found | MargaLink" };
  return {
    title: `${journal.display_name} | MargaLink`,
    description: `Journal info and paper matching for ${journal.display_name}.`,
  };
}

export default async function JournalPage(props: PageProps<"/journal/[id]">) {
  const { id } = await props.params;
  const journal = findJournal(id);
  if (!journal) notFound();

  return (
    <main className="mx-auto w-full max-w-2xl px-6 pt-3 pb-20">
      <PageHeader width="2xl" tool="journals" title={journal.display_name} />
      <p className="mb-8 mt-6 flex flex-wrap gap-3 text-sm">
        <Link href={`/write?journal=${id}`} className="clay-btn clay-primary h-10 px-5 font-medium">
          Write a paper for this journal →
        </Link>
        <Link href="/journals" className="clay-btn h-10 px-5">
          ← All journals
        </Link>
      </p>
      <div className="sheet p-6 sm:p-8">
        <JournalDetail journal={journal} topicNames={getTopicNames()} />
      </div>
    </main>
  );
}
