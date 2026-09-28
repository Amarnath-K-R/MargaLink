import Link from "next/link";
import type { Metadata } from "next";
import PageHeader from "@/components/PageHeader";
import { CONTACT_EMAIL } from "@/lib/site";

export const metadata: Metadata = {
  title: "How privacy works | MargaLink",
  description: "What leaves your device when you use MargaLink, and what doesn't.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 pt-3 pb-20">
      <PageHeader page="privacy"
        width="2xl"
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
            Not on a server, not in an account. Even if you sign in later,
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
            browser. Each asks first, in plain language, exactly what
            it&apos;s about to send, before sending anything.
          </p>
        </li>
      </ol>

      <h2 className="mt-12 font-serif text-xl font-medium">What actually happens</h2>
      <PrivacyDiagram />
      <p className="mt-4 text-sm text-ink-soft">
        The embedding model and the journal index are public files, the same
        ones for everyone, downloaded once and cached by your browser. Your
        paper never appears in either direction of those downloads. There is
        no MargaLink server in this loop at all: matching a paper to a
        journal is a page in your browser talking to files, not to us.
      </p>

      <h2 className="mt-12 font-serif text-xl font-medium">Why this is checkable, not just claimed</h2>
      <p className="mt-3 text-ink-soft">
        Open your browser&apos;s network tab (in its developer tools) and read the requests
        yourself: every one is a plain <code className="font-mono text-sm">GET</code> for
        a public file, none carries a request body. The browser-side code
        that does the extracting, embedding, and ranking is what actually
        ships to your browser; there&apos;s nothing hidden behind a server
        to take on faith.
      </p>

      <h2 className="mt-12 font-serif text-xl font-medium">What an embedding reveals</h2>
      <p className="mt-3 text-ink-soft">
        Matching works by turning your paper&apos;s title and abstract into a
        list of a few hundred numbers (an embedding) and comparing it against
        the same kind of list for each journal. Be clear about what that
        number list is: it carries the general topic of your paper, not the
        words. It can&apos;t be turned back into your original text in any
        practical way, but it&apos;s still derived from your paper, so we
        don&apos;t send it anywhere either. The whole comparison happens
        locally, against the journal index already in your browser.
      </p>
      <p className="mt-3 text-ink-soft">
        Two more things are worked out on your device, from the same text: which research
        topics your paper reads as (compared against a public list of about 4,500 topics),
        and which journals your own reference list cites. Neither leaves the tab. If you
        paste a title and abstract instead of uploading a file, that text stays in the tab
        too.
      </p>
      <p className="mt-3 text-ink-soft">
        How good is the matching? Every index build holds back each journal&apos;s most recent
        papers (they are never part of the index) and checks how often each one&apos;s real
        journal comes back in the top ten. That figure is shown at the bottom of the matching
        page for the build you are using. It measures papers that were published, so treat it
        as a guide, not a promise for yours.
      </p>

      <h2 id="review-exception" className="mt-12 font-serif text-xl font-medium">
        The first exception: getting a paper reviewed
      </h2>
      <p className="mt-3 text-ink-soft">
        Everything above (matching, the format check, the journal rules check) runs
        entirely on your device. Getting a paper reviewed is different: it sends your
        paper&apos;s text to Anthropic&apos;s Claude API, because that kind of review needs a
        large language model, and no model capable of it runs in a browser today. It only
        runs if you explicitly ask for it:
      </p>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-soft">
        <li>
          Nothing is sent until you confirm a plain-language notice naming exactly what&apos;s
          about to happen, including how many requests it takes: one per section of your
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
          section &ldquo;Don&apos;t send&rdquo;; it never leaves your device.
        </li>
        <li>
          Each request carries one section; the server reviews it and forgets it; MargaLink
          keeps nothing between requests. Anthropic retains API data only under its own API
          data policy.
        </li>
        <li>
          None of it is hidden: the notice says how many requests a review takes before you
          send it, and in the writing workspace the status line counts every request that
          carried text you agreed to send.
        </li>
        <li>
          A review is paid in M coins, charged when you confirm. So that each request can be
          checked against what was paid for, the server keeps which sections the review covers
          and their lengths (never their text) for about two hours.
        </li>
      </ul>

      <h2 id="figures-exception" className="mt-12 font-serif text-xl font-medium">
        The second exception: making figures from a spreadsheet
      </h2>
      <p className="mt-3 text-ink-soft">
        The figure studio turns a CSV or Excel file into a publication-ready figure. Reading your
        file, drawing the figure, the statistics and every export happen in your browser; your
        spreadsheet never leaves your device. Only one optional step sends anything: asking Claude
        to set up a figure from a description you type. What goes then is a description: your
        column names, their inferred types, how many rows you have, your request, and the current
        figure settings (chart types, which columns go where, axis settings), never a cell value,
        and never titles or notes you typed.
      </p>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-soft">
        <li>
          Nothing is sent until you confirm a plain-language notice, once per browser session. The
          exact request is shown on the page before every call.
        </li>
        <li>
          Group labels (like &quot;Placebo&quot; or a site name) are values too, so they&apos;re only
          sent if you tick a separate box, and then the notice appears every time and lists the
          exact labels. Only columns with at most 30 distinct values qualify, so ID-like columns
          never do.
        </li>
        <li>
          Error details from drawing a figure can quote your data, so they&apos;re shown only to you
          and never sent anywhere.
        </li>
        <li>
          A custom tweak (written by Claude, or inside a recipe someone shares) is shown to you and
          never runs until you click Run. It&apos;s checked first, and it runs only in your browser,
          in a worker whose network access is switched off before any tweak can run.
        </li>
        <li>
          Drawing happens in a Web Worker that downloads its Python runtime, the figure engine and
          fonts: public files, never anything from your data. They appear in your browser&apos;s
          network tab like any other request.
        </li>
      </ul>

      <h2 id="writing" className="mt-12 font-serif text-xl font-medium">
        Writing your paper
      </h2>
      <p className="mt-3 text-ink-soft">
        The writing workspace compiles your LaTeX in your browser, with TeX Live running on your
        device. Your manuscript, figures and bibliography are kept in this browser&apos;s own storage
        on this device, never on a server. The workspace has no AI writing help: nothing rewrites
        your text. The other tools open inside it as windows: matching and the format and
        journal-rules checks read the PDF you compiled, on your device; the AI review and the figure
        window&apos;s Ask Claude are the same two opt-in exceptions described above, behind the same
        notices, and nothing is sent until you confirm one of them. The workspace&apos;s status line
        says when a request carried something you agreed to send.
      </p>
      <ul className="mt-3 list-disc space-y-2 pl-5 text-ink-soft">
        <li>
          The first compile downloads the TeX engine and its packages (about 140 MB, more for some
          templates) from our public file host. Those downloads carry nothing from your paper, and
          your browser keeps them for later compiles.
        </li>
        <li>
          Because your drafts live only in this browser, clearing its site data deletes them. Use
          &quot;Download backup&quot; to keep a copy or to move to another computer, and import the
          zip to continue.
        </li>
        <li>
          Figures made in the workspace&apos;s figure window, or added from the figure studio, are
          written straight into the project&apos;s figures folder in your browser; nothing is uploaded.
        </li>
      </ul>

      <h2 id="accounts" className="mt-12 scroll-mt-24 font-serif text-xl font-medium">
        Accounts, M coins and payment
      </h2>
      <p className="mt-3 text-ink-soft">
        Only the two features above that cost money each time they run, the AI review and Ask
        Claude, need an account. Everything else works without one, and a visitor who isn&apos;t
        signed in makes no account requests at all. The three rules at the top of this page apply
        to accounts too: nothing from a paper is ever part of one.
      </p>
      <h3 className="mt-6 font-medium">What an account keeps</h3>
      <ul className="mt-2 list-disc space-y-2 pl-5 text-ink-soft">
        <li>Your email address. If you use &ldquo;Continue with Google&rdquo;, also Google&apos;s id for your account, so we recognise it. Not your name, not your photo.</li>
        <li>Your M coin history: each welcome bonus, purchase, charge and refund, with its date.</li>
        <li>
          Your purchases: for each pack or Pro payment, what it bought, the amount and currency, and Paddle&apos;s references for the payment and for
          you as its customer; for Pro, the plan and its billing periods; and any refund or chargeback of them.
        </li>
        <li>Your sign-ins: for each browser you&apos;re signed in on, a one-way fingerprint of its sign-in token and when it expires (30 days, extended while you use it).</li>
        <li>Which version of this notice you signed up under.</li>
      </ul>
      <h3 className="mt-6 font-medium">Kept briefly</h3>
      <ul className="mt-2 list-disc space-y-2 pl-5 text-ink-soft">
        <li>While a paid review runs: which sections it covers, their lengths and which came back (never their text), deleted shortly after its two hours end.</li>
        <li>An emailed sign-in link: the address it was sent to and the page to return to, with a one-way fingerprint of the link, deleted when it&apos;s used or shortly after its 15 minutes.</li>
        <li>
          Counters that limit how many sign-in emails an address or a network can ask for. They&apos;re keyed by fingerprints made with a secret key
          only our server holds (a network&apos;s also changes daily), never the address itself, and they expire within a day.
        </li>
        <li>Paddle&apos;s ids for the payment events it tells us about (nothing personal in them), for 90 days, so a repeated one is recognised.</li>
      </ul>
      <h3 className="mt-6 font-medium">Kept after you delete your account</h3>
      <p className="mt-2 text-ink-soft">
        A fingerprint of your email address, made with a secret key only our server holds, so the
        welcome bonus is given once per address. It holds no address, and without that key it
        can&apos;t be matched to one.
      </p>
      <h3 className="mt-6 font-medium">Never kept</h3>
      <p className="mt-2 text-ink-soft">
        Anything from your papers, spreadsheets or figures. Card or bank details: buying M coins
        goes through Paddle, which sells them to you as the merchant of record, takes the payment,
        handles the tax and sends the receipt. MargaLink never sees or stores card numbers.
      </p>
      <h3 className="mt-6 font-medium">Cookies</h3>
      <p className="mt-2 text-ink-soft">
        Signed in, your browser holds two: one carries your sign-in and can&apos;t be read by
        pages, the other only says that you&apos;re signed in, so signed-out pages ask nothing. A
        third, short-lived one exists only during a Google sign-in. MargaLink sets no tracking or
        advertising cookies. When you buy coins, Paddle&apos;s checkout runs its own script, and where
        it&apos;s switched on so does Cloudflare&apos;s Turnstile check; each follows its own privacy terms.
      </p>
      <h3 className="mt-6 font-medium">Who else is involved</h3>
      <ul className="mt-2 list-disc space-y-2 pl-5 text-ink-soft">
        <li>Cloudflare hosts the site and the account database and, where it&apos;s switched on, checks that an email sign-in request comes from a person (Turnstile).</li>
        <li>Google, only if you choose it, tells us your verified email address and its id for your account.</li>
        <li>Resend sends sign-in emails: your address and the link.</li>
        <li>Paddle takes payments, as the merchant of record.</li>
        <li>Anthropic runs the AI review and Ask Claude, as described above.</li>
      </ul>
      <h3 className="mt-6 font-medium">What we use it for, and your choices</h3>
      <p className="mt-2 text-ink-soft">
        Your address signs you in and receives sign-in links; we don&apos;t send marketing email.
        Your coin history runs the service and our accounts. On{" "}
        <Link href="/account" className="text-accent hover:underline">
          your account page
        </Link>{" "}
        you can see that history, download everything we hold as a file, sign out on every
        browser, and delete your account, which is immediate. For anything else about your data,
        or a complaint,{" "}
        {CONTACT_EMAIL ? (
          <>
            write to{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">
              {CONTACT_EMAIL}
            </a>
            .
          </>
        ) : (
          "write to the contact address listed here once accounts open."
        )}{" "}
        The{" "}
        <Link href="/terms" className="text-accent hover:underline">
          terms
        </Link>{" "}
        cover how M coins work.
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
        aria-label="Diagram: inside your browser, a paper is extracted to text, embedded into a vector, then ranked against a journal index, all locally. Two public files (the embedding model and the journal index) download once into the browser. No MargaLink server is part of this flow."
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
        downloads; there is no server in this loop to send your paper to.
      </figcaption>
    </figure>
  );
}
