import type { JournalMeta } from "@/lib/match";

// The journal detail fields — shared between the static /journal/[id] page
// (for the top ~2,000 by output volume, see pipeline/build_index.py's
// mark_prerendered) and the inline fallback on /journals and /match for
// every other journal, which doesn't get a dedicated static page under
// Cloudflare Pages' 20,000-file cap.
export default function JournalDetail({ journal }: { journal: JournalMeta }) {
  return (
    <>
      {journal.host_organization_name && (
        <p className="mt-2 text-ink-soft">{journal.host_organization_name}</p>
      )}

      <dl className="mt-6">
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
        {journal.country_code && <Row label="Country" value={countryName(journal.country_code)} />}
      </dl>

      <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2">
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

      <p className="mt-6 border-t border-line pt-4 text-sm text-ink-soft">
        This information comes from OpenAlex
        {journal.publication_time_weeks != null || journal.license_type ? " and DOAJ" : ""}, and
        hasn&apos;t been independently verified. The journal&apos;s own page is the final
        authority — see the links above.
      </p>
    </>
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
