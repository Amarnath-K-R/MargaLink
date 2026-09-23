import Link from "next/link";
import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";

export const metadata: Metadata = {
  title: "How privacy works — MargaLink",
  description: "What leaves your device when you use MargaLink, and what doesn't.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-14 sm:py-20">
      <PageHeader
        width="2xl"
        links={[{ href: "/match", label: "← Back to matching" }]}
        title="How privacy works"
        subtitle={<p className="mt-3 text-lg text-ink-soft">Three rules, two disclosed exceptions, and one diagram of what actually happens.</p>}
      />

      <ol className="mt-10 space-y-4">
        <li className="border-t border-line pt-4">
          <p className="font-medium">Your paper is never uploaded.</p>
          <p className="mt-1 text-ink-soft">
            Not for matching, not for the format check. The file stays on your
            device the whole time.
          </p>
        </li>
        <li className="border-t border-line pt-4">
          <p className="font-medium">Nothing from a paper is stored anywhere.</p>
          <p className="mt-1 text-ink-soft">
            Not on a server, not in an account — even if you sign in later,
            paper content is never part of what&apos;s saved.
          </p>
        </li>
        <li className="border-t border-line pt-4">
          <p className="font-medium">
            Anything that would need to leave your device is opt-in.
          </p>
          <p className="mt-1 text-ink-soft">
            Matching, the format check, and the journal rules check never do.
            Two features are the exceptions:{" "}
            <Link href="#review-exception" className="text-accent hover:underline">
              getting a paper reviewed
            </Link>{" "}
            and{" "}
            <Link href="#figures-exception" className="text-accent hover:underline">
              making figures from a spreadsheet
            </Link>
            . Both use a large language model, which can&apos;t run in a
            browser — each asks first, in plain language, exactly what
            it&apos;s about to send, before sending anything.
          </p>
        </li>
      </ol>

      <h2 className="mt-12 font-serif text-xl font-medium">What actually happens</h2>
      <PrivacyDiagram />
      <p className="mt-4 text-sm text-ink-soft">
        The embedding model and the journal index are public files — the same
        ones for everyone, downloaded once and cached by your browser. Your
        paper never appears in either direction of those downloads. There is
        no MargaLink server in this loop at all: matching a paper to a
        journal is a page in your browser talking to files, not to us.
      </p>

      <h2 className="mt-12 font-serif text-xl font-medium">Why this is checkable, not just claimed</h2>
      <p className="mt-3 text-ink-soft">
        Open your browser&apos;s network tab (or use the panel that appears on
        the upload page after you run a match) and read the requests
        yourself: every one is a plain <code className="font-mono text-sm">GET</code> for
        a public file, none carries a request body. The browser-side code
        that does the extracting, embedding, and ranking is what actually
        ships to your browser — there&apos;s nothing hidden behind a server
        to take on faith.
      </p>

      <h2 className="mt-12 font-serif text-xl font-medium">What an embedding reveals</h2>
      <p className="mt-3 text-ink-soft">
        Matching works by turning your paper&apos;s title and abstract into a
        list of a few hundred numbers (an embedding) and comparing it against
        the same kind of list for each journal. Be clear about what that
        number list is: it carries the general topic of your paper, not the
        words. It can&apos;t be turned back into your original text in any
        practical way — but it&apos;s still derived from your paper, so we
        don&apos;t send it anywhere either. The whole comparison happens
        locally, against the journal index already in your browser.
      </p>

      <h2 id="review-exception" className="mt-12 font-serif text-xl font-medium">
        The first exception: getting a paper reviewed
      </h2>
      <p className="mt-3 text-ink-soft">
        Everything above — matching, the format check, the journal rules check — runs
        entirely on your device. Getting a paper reviewed is different: it sends your
        paper&apos;s text to Anthropic&apos;s Claude API, because that kind of review needs a
        large language model, and no model capable of it runs in a browser today. It only
        runs if you explicitly ask for it:
      </p>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-soft">
        <li>
          Nothing is sent until you confirm a plain-language notice naming exactly what&apos;s
          about to happen — including how many requests it takes: one per section of your
          paper, then one over the numbers found. There is no default-on path.
        </li>
        <li>
          Author names and email addresses are stripped from the text first, on a
          best-effort basis, before anything leaves your device.
        </li>
        <li>
          Anthropic&apos;s API terms don&apos;t use this data to train models. MargaLink
          doesn&apos;t store what you send, before or after the review.
        </li>
        <li>
          Before sending, you can see how your paper was split into sections and mark any
          section &ldquo;Don&apos;t send&rdquo; — it never leaves your device.
        </li>
        <li>
          Each request carries one section; the server reviews it and forgets it — MargaLink
          keeps nothing between requests. Anthropic retains API data only under its own API
          data policy.
        </li>
        <li>
          Like every other request in MargaLink, these show up in the network-request log
          on the review page, one line per request, when they happen — they aren&apos;t hidden from the same
          transparency check the rest of the site relies on.
        </li>
      </ul>

      <h2 id="figures-exception" className="mt-12 font-serif text-xl font-medium">
        The second exception: making figures from a spreadsheet
      </h2>
      <p className="mt-3 text-ink-soft">
        The figure generator lets you upload a CSV or Excel file and get a publication-style
        chart back, drawn with real Python plotting libraries. Real statistical figures need
        real computation — but your raw spreadsheet is more sensitive than a manuscript
        draft, so it never leaves your device. What leaves instead is a description: your
        column names, their inferred types, how many rows you have, the chart type you
        picked, and an optional short note — never a single cell value. Claude reads that
        description and writes Python code; that code then runs locally, in your browser, and
        only there does it ever touch your real data.
      </p>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-soft">
        <li>
          Nothing is sent until you confirm a plain-language notice, once per browser
          session, naming exactly what&apos;s about to happen.
        </li>
        <li>
          The exact data sent — the schema, nothing else — is shown on the page before every
          generation, whether or not the consent notice appears that time.
        </li>
        <li>
          The Python code Claude writes is always shown, never hidden behind the figure it
          produces.
        </li>
        <li>
          The one honest caveat: the figure runs inside a Web Worker that downloads its own
          Python runtime from a public CDN. Those downloads are public files, never anything
          from your data, but they happen off the main thread and so don&apos;t appear in the
          network-request log the rest of this page points to.
        </li>
      </ul>

      <h2 className="mt-12 font-serif text-xl font-medium">Accounts and payment</h2>
      <p className="mt-3 text-ink-soft">
        If accounts exist later, they&apos;ll need only an email address.
        Payment details stay with the payment provider — MargaLink never
        sees or stores card numbers.
      </p>
    </main>
  );
}

function PrivacyDiagram() {
  return (
    <figure className="mt-6">
      <svg
        viewBox="0 0 420 598"
        role="img"
        aria-label="Diagram: inside your browser, a paper is extracted to text, embedded into a vector, then ranked against a journal index — all locally. Two public files (the embedding model and the journal index) download once into the browser. No MargaLink server is part of this flow."
        className="w-full h-auto"
        style={{ color: "var(--ink)" }}
      >
        {/* Vertical stack (not a wide horizontal flow) so it stays legible at
            phone width — the diagram scales by width, and a narrow viewBox
            shrinks far less on a 375px screen than a wide one would. */}
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
          </marker>
        </defs>

        <g fontFamily="var(--font-sans)">
          {/* top public file box */}
          <rect x="70" y="14" width="280" height="52" rx="2" fill="none" stroke="currentColor" strokeWidth="1" />
          <text x="210" y="37" textAnchor="middle" fontSize="15">Embedding model (~30MB)</text>
          <text x="210" y="54" textAnchor="middle" fontSize="13" fill="var(--ink-soft)">public file, no personal data</text>
          <line x1="210" y1="66" x2="210" y2="104" stroke="currentColor" markerEnd="url(#arrow)" />
          <text x="222" y="89" fontSize="13" fill="var(--ink-soft)">downloads once, cached</text>

          {/* browser boundary */}
          <rect x="20" y="104" width="380" height="310" rx="3" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
          <text x="36" y="126" fontSize="15" fill="var(--accent)">Your browser</text>

          {/* pipeline steps, stacked */}
          <rect x="60" y="140" width="300" height="42" rx="2" fill="none" stroke="currentColor" />
          <text x="210" y="166" textAnchor="middle" fontSize="15">Paper</text>

          <line x1="210" y1="182" x2="210" y2="208" stroke="currentColor" markerEnd="url(#arrow)" />
          <text x="222" y="199" fontSize="13" fill="var(--ink-soft)">extract</text>

          <rect x="60" y="208" width="300" height="42" rx="2" fill="none" stroke="currentColor" />
          <text x="210" y="234" textAnchor="middle" fontSize="15">Text</text>

          <line x1="210" y1="250" x2="210" y2="276" stroke="currentColor" markerEnd="url(#arrow)" />
          <text x="222" y="267" fontSize="13" fill="var(--ink-soft)">embed</text>

          <rect x="60" y="276" width="300" height="42" rx="2" fill="none" stroke="currentColor" />
          <text x="210" y="302" textAnchor="middle" fontSize="15">Vector</text>

          <line x1="210" y1="318" x2="210" y2="344" stroke="currentColor" markerEnd="url(#arrow)" />
          <text x="222" y="335" fontSize="13" fill="var(--ink-soft)">rank</text>

          <rect x="60" y="344" width="300" height="50" rx="2" fill="none" stroke="currentColor" />
          <text x="210" y="374" textAnchor="middle" fontSize="15">Ranked journals</text>

          {/* bottom public file box */}
          <line x1="210" y1="414" x2="210" y2="452" stroke="currentColor" markerEnd="url(#arrow)" />
          <text x="222" y="437" fontSize="13" fill="var(--ink-soft)">downloads once, cached</text>
          <rect x="70" y="452" width="280" height="52" rx="2" fill="none" stroke="currentColor" strokeWidth="1" />
          <text x="210" y="475" textAnchor="middle" fontSize="15">Journal index (~8MB)</text>
          <text x="210" y="492" textAnchor="middle" fontSize="13" fill="var(--ink-soft)">public file, no personal data</text>

          {/* absent server, explicitly drawn */}
          <rect x="70" y="524" width="280" height="54" rx="2" fill="none" stroke="var(--away)" strokeWidth="1" strokeDasharray="4 3" />
          <text x="210" y="547" textAnchor="middle" fontSize="15" fill="var(--away)">MargaLink server</text>
          <text x="210" y="564" textAnchor="middle" fontSize="13" fill="var(--away)">no such request exists</text>
        </g>
      </svg>
      <figcaption className="mt-3 text-sm text-ink-soft">
        Everything that touches your paper happens inside the browser
        boundary. The only network traffic is two public, non-personal
        downloads — there is no server in this loop to send your paper to.
      </figcaption>
    </figure>
  );
}
