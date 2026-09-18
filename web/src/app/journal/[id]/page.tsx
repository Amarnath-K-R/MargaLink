import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getAllJournals } from "@/lib/journals-server";
import { shortId } from "@/lib/journal-url";
import type { JournalMeta } from "@/lib/match";

export async function generateStaticParams() {
  return getAllJournals().map((j) => ({ id: shortId(j.id) }));
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
      <div className="mb-8 flex items-baseline justify-between">
        <Link href="/" className="font-serif text-lg font-medium">
          MargaLink
        </Link>
        <Link href="/journals" className="text-sm text-ink-soft hover:text-ink">
          ← Browse journals
        </Link>
      </div>

      <h1 className="font-serif text-3xl font-medium sm:text-4xl">
        {journal.display_name}
      </h1>
      {journal.host_organization_name && (
        <p className="mt-2 text-ink-soft">{journal.host_organization_name}</p>
      )}

      <dl className="mt-10">
        {journal.field && <Row label="Field" value={journal.field} />}
        <Row
          label="Open access"
          value={journal.is_in_doaj ? "Listed in DOAJ" : "Not verified in DOAJ"}
        />
        <Row
          label="Indexed in MEDLINE"
          value={journal.medline_indexed ? "Yes" : "Not verified"}
        />
        <Row
          label="Article processing fee"
          value={journal.apc_usd != null ? `$${journal.apc_usd.toLocaleString()} USD` : "Not reported"}
        />
        {journal.doaj_apc_amount != null && journal.doaj_apc_currency && (
          <Row
            label="Fee (DOAJ's own figure)"
            value={`${journal.doaj_apc_amount.toLocaleString()} ${journal.doaj_apc_currency}`}
          />
        )}
        {journal.publication_time_weeks != null && (
          <Row label="Typical time to publish" value={`~${journal.publication_time_weeks} weeks`} />
        )}
        {journal.license_type && <Row label="Licence" value={journal.license_type} />}
        {journal.issn_l && <Row label="ISSN" value={journal.issn_l} mono />}
        {journal.last_publication_year && (
          <Row label="Last publication year" value={String(journal.last_publication_year)} />
        )}
        {journal.country_code && (
          <Row label="Country" value={countryName(journal.country_code)} />
        )}
      </dl>

      <div className="mt-10 flex flex-wrap gap-x-6 gap-y-2">
        {journal.homepage_url && (
          <a
            href={journal.homepage_url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-accent hover:underline"
          >
            Visit the journal&apos;s official page
          </a>
        )}
        {journal.review_url && (
          <a
            href={journal.review_url}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-accent hover:underline"
          >
            Peer review policy
          </a>
        )}
      </div>

      <p className="mt-10 border-t border-line pt-6 text-sm text-ink-soft">
        This information comes from OpenAlex
        {journal.publication_time_weeks != null || journal.license_type
          ? " and DOAJ"
          : ""}
        , and hasn&apos;t been independently verified. The journal&apos;s own
        page is the final authority — see the links above.
      </p>
    </main>
  );
}

const regionNames = new Intl.DisplayNames(["en"], { type: "region" });
function countryName(code: string): string {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code; // not a valid ISO region code — show it as-is rather than crash
  }
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between border-t border-line py-3 first:border-t-0 first:pt-0">
      <dt className="text-ink-soft">{label}</dt>
      <dd className={mono ? "font-mono text-sm" : ""}>{value}</dd>
    </div>
  );
}
