import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How privacy works — MargaLink",
  description: "What leaves your device when you use MargaLink, and what doesn't.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-14 sm:py-20">
      <Link href="/" className="text-sm text-ink-soft hover:text-ink">
        ← Back
      </Link>

      <h1 className="mt-6 font-serif text-3xl font-medium sm:text-4xl">
        How privacy works
      </h1>
      <p className="mt-3 text-lg text-ink-soft">
        Three rules, and one diagram of what actually happens.
      </p>

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
            Matching and the format check never do. A future paid review
            feature would need a large language model, which can&apos;t run in
            a browser — that will ask first, in plain language, before
            sending anything.
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
        viewBox="0 0 760 400"
        role="img"
        aria-label="Diagram: inside your browser, a paper is extracted to text, embedded into a vector, then ranked against a journal index — all locally. Two public files (the embedding model and the journal index) download once into the browser. No MargaLink server is part of this flow."
        className="w-full h-auto"
        style={{ color: "var(--ink)" }}
      >
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
          </marker>
        </defs>

        {/* top public file box */}
        <rect x="260" y="14" width="240" height="52" rx="2" fill="none" stroke="currentColor" strokeWidth="1" />
        <text x="380" y="36" textAnchor="middle" fontSize="12" fontFamily="var(--font-sans)">Embedding model (~30MB)</text>
        <text x="380" y="52" textAnchor="middle" fontSize="11" fill="var(--ink-soft)" fontFamily="var(--font-sans)">public file, no personal data</text>
        <line x1="380" y1="66" x2="380" y2="110" stroke="currentColor" strokeWidth="1" markerEnd="url(#arrow)" />
        <text x="392" y="90" fontSize="10.5" fill="var(--ink-soft)" fontFamily="var(--font-sans)">downloads once, cached</text>

        {/* browser boundary */}
        <rect x="20" y="110" width="720" height="160" rx="3" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
        <text x="36" y="130" fontSize="12" fontFamily="var(--font-sans)" fill="var(--accent)">Your browser</text>

        {/* pipeline steps */}
        <g fontFamily="var(--font-sans)" fontSize="12">
          <rect x="45" y="170" width="90" height="42" rx="2" fill="none" stroke="currentColor" />
          <text x="90" y="195" textAnchor="middle">Paper</text>

          <line x1="135" y1="191" x2="190" y2="191" stroke="currentColor" markerEnd="url(#arrow)" />
          <text x="162" y="182" textAnchor="middle" fontSize="10.5" fill="var(--ink-soft)">extract</text>

          <rect x="192" y="170" width="90" height="42" rx="2" fill="none" stroke="currentColor" />
          <text x="237" y="195" textAnchor="middle">Text</text>

          <line x1="282" y1="191" x2="337" y2="191" stroke="currentColor" markerEnd="url(#arrow)" />
          <text x="309" y="182" textAnchor="middle" fontSize="10.5" fill="var(--ink-soft)">embed</text>

          <rect x="339" y="170" width="90" height="42" rx="2" fill="none" stroke="currentColor" />
          <text x="384" y="195" textAnchor="middle">Vector</text>

          <line x1="429" y1="191" x2="484" y2="191" stroke="currentColor" markerEnd="url(#arrow)" />
          <text x="456" y="182" textAnchor="middle" fontSize="10.5" fill="var(--ink-soft)">rank</text>

          <rect x="486" y="170" width="200" height="42" rx="2" fill="none" stroke="currentColor" />
          <text x="586" y="195" textAnchor="middle">Ranked journals</text>
        </g>

        {/* bottom public file box */}
        <line x1="384" y1="330" x2="384" y2="270" stroke="currentColor" strokeWidth="1" markerEnd="url(#arrow)" />
        <text x="396" y="310" fontSize="10.5" fill="var(--ink-soft)" fontFamily="var(--font-sans)">downloads once, cached</text>
        <rect x="264" y="330" width="240" height="52" rx="2" fill="none" stroke="currentColor" strokeWidth="1" />
        <text x="384" y="352" textAnchor="middle" fontSize="12" fontFamily="var(--font-sans)">Journal index (~8MB)</text>
        <text x="384" y="368" textAnchor="middle" fontSize="11" fill="var(--ink-soft)" fontFamily="var(--font-sans)">public file, no personal data</text>

        {/* absent server, explicitly drawn */}
        <rect x="560" y="330" width="180" height="52" rx="2" fill="none" stroke="var(--away)" strokeWidth="1" strokeDasharray="4 3" />
        <text x="650" y="352" textAnchor="middle" fontSize="12" fill="var(--away)" fontFamily="var(--font-sans)">MargaLink server</text>
        <text x="650" y="368" textAnchor="middle" fontSize="11" fill="var(--away)" fontFamily="var(--font-sans)">no such request exists</text>
      </svg>
      <figcaption className="mt-3 text-sm text-ink-soft">
        Everything that touches your paper happens inside the browser
        boundary. The only network traffic is two public, non-personal
        downloads — there is no server in this loop to send your paper to.
      </figcaption>
    </figure>
  );
}
