import Link from "next/link";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import PageHeader from "@/components/PageHeader";
import { Aside, DocBody, OptionTable, type TocItem } from "@/components/docs/Doc";
import { CONTACT_EMAIL, OPERATOR } from "@/lib/site";
import { FIGURE_PRICE, WELCOME_COINS } from "@/lib/coins";

export const metadata: Metadata = {
  title: "How privacy works | MargaLink",
  description: "What MargaLink collects, why, where it goes, how long it's kept, and your rights.",
};

// The privacy notice. Written to cover what UK/EU GDPR (Art. 13) and India's
// DPDP Rules (Rule 3: an itemised list of personal data with its purpose,
// in plain language, with how to withdraw consent, use your rights and
// complain) ask for, from what the code actually does. When the product
// changes what it collects or sends, change this page in the same commit,
// and bump the version and date below.
const VERSION = "Version 1, 28 September 2026";

const TOC: TocItem[] = [
  { id: "summary", label: "In short" },
  { id: "who", label: "Who runs MargaLink" },
  { id: "papers", label: "Your papers stay with you" },
  { id: "no-account", label: "Without an account" },
  { id: "ai", label: "The two features that send something", tint: "#f1d2c2" },
  { id: "accounts", label: "Your account" },
  { id: "payments", label: "Buying M coins" },
  { id: "basis", label: "Why we may use it" },
  { id: "sharing", label: "Who else is involved" },
  { id: "cookies", label: "Cookies and browser storage" },
  { id: "keeping", label: "How long, and how safe" },
  { id: "rights", label: "Your rights" },
  { id: "children", label: "Children" },
  { id: "changes", label: "Changes and contact" },
];

const Contact = () =>
  CONTACT_EMAIL ? (
    <a href={`mailto:${CONTACT_EMAIL}`} className="text-accent hover:underline">
      {CONTACT_EMAIL}
    </a>
  ) : (
    <>the contact address listed here once accounts open</>
  );

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-6xl px-6 pt-3 pb-24">
      <PageHeader
        page="privacy"
        width="3xl"
        title="How privacy works"
        subtitle={
          <p className="mt-3 max-w-2xl text-lg text-ink-soft">
            What MargaLink collects, why, where it goes, how long it&apos;s kept, and what you can do about it.{" "}
            <span className="text-base">{VERSION}.</span>
          </p>
        }
      />

      <DocBody toc={TOC}>
        <div className="space-y-14">
          <Section id="summary" title="In short">
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>Your papers never reach our servers.</strong> Matching, the format and journal-rules checks, figures and writing all run in
                your browser. Nothing from a paper is stored on a server, for anyone, signed in or not.
              </li>
              <li>
                <strong>Two optional features send something to Anthropic&apos;s Claude</strong>, and only after you confirm a notice that says
                exactly what: the AI review (your paper&apos;s text) and Ask Claude in the figure studio (a description of your data, never its
                values).
              </li>
              <li>
                <strong>You need an account only for those two.</strong> It holds your email address, your M coin history and your purchases. Not your
                name, not your papers.
              </li>
              <li>
                <strong>No ads, no analytics, no tracking cookies</strong>, and we never sell or rent anything about you.
              </li>
              <li>
                <strong>You&apos;re in control:</strong> download everything we hold, or delete your account, on your account page, at any time.
              </li>
            </ul>
          </Section>

          <Section id="who" title="Who runs MargaLink">
            <p>
              MargaLink is run by {OPERATOR ?? "an individual in India"}, who decides what personal data is collected and why (the
              &ldquo;controller&rdquo; under GDPR, the &ldquo;Data Fiduciary&rdquo; under India&apos;s Digital Personal Data Protection Act). For any
              question about your data, a request, or a complaint, write to <Contact />. The same address reaches the person responsible for
              handling grievances.
            </p>
          </Section>

          <Section id="papers" title="Your papers stay with you">
            <p>Three rules shape every feature:</p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                <strong>Your paper is never uploaded</strong> for matching or the format and journal checks. The file stays on your device.
              </li>
              <li>
                <strong>Nothing from a paper is stored on a server</strong>, not even for signed-in users.
              </li>
              <li>
                <strong>Anything that sends text off your device is opt-in</strong>, behind a plain-language notice. Only the two features below do.
              </li>
            </ol>
            <PrivacyDiagram />
            <p>
              <strong>Checkable, not just claimed.</strong> Open your browser&apos;s developer tools and watch the network tab while you match a paper:
              every request is a plain download of a public file, and none carries a body. The code that reads, embeds and ranks your paper is the
              code your browser runs.
            </p>
            <p>
              <strong>What an embedding is.</strong> Matching turns your title and abstract into a list of a few hundred numbers that capture the
              topic, not the words, and compares it with the same kind of list for each journal. It can&apos;t practically be turned back into your
              text, but it comes from your paper, so it never leaves the tab either; nor do the research topics and cited journals worked out from
              the same text.
            </p>
          </Section>

          <Section id="no-account" title="Using MargaLink without an account">
            <p>
              Browsing journals, matching, the checks, the figure studio (drawing, statistics, exports) and the writing workspace need no account and
              send nothing about you or your work. To run in your browser, the page downloads public files, the same for everyone:
            </p>
            <OptionTable
              title="What your browser downloads, and from where"
              rows={[
                { name: "The site and the journal index", what: "Pages, the journal index, templates and fonts, from our site (hosted by Cloudflare)." },
                { name: "The matching model", what: "The embedding model's weights, from Hugging Face." },
                { name: "Runtimes", what: "The ONNX runtime (for the model) and Pyodide with its Python packages (for figures), from the jsDelivr CDN." },
                { name: "The TeX engine", what: "TeX Live and its packages for the writing workspace, from our file storage (Cloudflare R2)." },
              ]}
            />
            <p>
              Like any request on the web, each of these reaches its host with your IP address and ordinary browser details (such as its version),
              which the host uses to deliver the file and protect its service under its own privacy policy. None of them carries anything from your
              papers, spreadsheets or drafts. We run no analytics and keep no access logs of our own; Cloudflare processes request data to serve and
              protect the site.
            </p>
            <p>
              <strong>Your drafts live in your browser.</strong> Writing projects are kept in your browser&apos;s own storage on your device, never on
              a server. Clearing this site&apos;s data in your browser deletes them, so use &ldquo;Download backup&rdquo; to keep a copy or move to
              another computer.
            </p>
          </Section>

          <Section id="ai" title="The two features that send something">
            <p>
              Each needs a large language model that can&apos;t run in a browser, so each sends something to Anthropic&apos;s Claude API (in the United
              States) through our server, which holds the API key and keeps nothing it passes on. Neither starts until you confirm its notice.
            </p>
            <OptionTable
              title="What each one sends"
              rows={[
                {
                  name: "AI pre-submission review",
                  what: (
                    <>
                      Your paper&apos;s text, a section at a time, then one cross-check over the numbers found, with the chosen journal&apos;s guidelines.
                      Author names and email addresses are stripped first (best effort). Sections you mark &ldquo;Don&apos;t send&rdquo; are never
                      sent.
                    </>
                  ),
                  away: true,
                },
                {
                  name: "Ask Claude (figures)",
                  what: (
                    <>
                      Column names and their types, the row count, your request, and the current figure&apos;s settings with any text you typed blanked.
                      Never a cell value. Group labels (like &ldquo;Placebo&rdquo;) only if you tick a separate box, and the notice lists them each
                      time.
                    </>
                  ),
                  away: true,
                },
              ]}
            />
            <p>
              <strong>What Anthropic does with it.</strong> Under its commercial terms, Anthropic doesn&apos;t use API data to train its models and
              deletes inputs and outputs within 30 days, except that content flagged for breaking its usage policy may be kept for up to 2 years
              (and as the law requires).{" "}
              <a href="https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data" className="text-accent hover:underline">
                Anthropic&apos;s retention policy
              </a>
            </p>
            <p>
              <strong>What we keep.</strong> Nothing of what&apos;s sent, before or after. To charge a review once and refund what didn&apos;t run, we
              keep which sections it covers, their lengths and which came back (never their text), for about two hours. Ask Claude costs{" "}
              {FIGURE_PRICE} M coin a request; we keep only that coin&apos;s charge or refund.
            </p>
          </Section>

          <Section id="accounts" title="Your account">
            <p>
              You need an account only for the two features above. Sign in with Google (which tells us your verified email address and its id for
              your account, nothing else) or with a one-time link sent to your email. Here is everything an account involves:
            </p>
            <OptionTable
              title="What we keep, why, and for how long"
              rows={[
                { name: "Email address", what: "To sign you in, send your sign-in links, and reach you about your account.", def: "Until you delete your account" },
                { name: "Google's id for you", what: "Only if you use Google: to recognise your Google sign-in.", def: "Until you delete your account" },
                { name: "Sign-ins", what: "For each browser you're signed in on, a one-way fingerprint of its sign-in token and when it expires.", def: "30 days after you last use it" },
                { name: "Emailed sign-in links", what: "The address it went to, the page to return to, and a fingerprint of the link.", def: "Until used, or 15 minutes" },
                { name: "M coin history", what: "Each welcome bonus, charge, refund and purchase, with its date, so your balance is right.", def: "Until you delete your account" },
                { name: "Purchases and Pro", what: "See Buying M coins below.", def: "Until you delete your account" },
                { name: "A running review", what: "Which sections it covers, their lengths, its tries and which came back. Never text.", def: "About 2 hours" },
                {
                  name: "Abuse limits",
                  what: "Counters of how many sign-in emails an address or a network asked for, keyed by fingerprints made with a secret key (a network's changes daily). Never the address or IP itself.",
                  def: "Within a day",
                },
                {
                  name: "Welcome-bonus fingerprint",
                  what: `A fingerprint of your email address made with a secret key, so the ${WELCOME_COINS}-coin welcome bonus is given once per address. It holds no address and can't be matched to one without that key.`,
                  def: "Kept after you delete your account",
                },
                { name: "Notice version", what: "Which version of this notice you signed up under.", def: "Until you delete your account" },
              ]}
            />
            <p>
              We don&apos;t collect your name, photo, affiliation, phone number or location, and we don&apos;t build a profile of you. Your papers,
              spreadsheets and figures are never part of an account.
            </p>
          </Section>

          <Section id="payments" title="Buying M coins">
            <p>
              Coin packs and Pro are sold by Paddle, which acts as the merchant of record: it takes the payment, charges any sales tax, sends the
              receipt and handles refund requests, as the controller of that payment data under{" "}
              <a href="https://www.paddle.com/legal/privacy" className="text-accent hover:underline">
                its own privacy notice
              </a>
              . Your card or bank details go to Paddle only; MargaLink never sees or stores them. Paddle&apos;s checkout script loads only when you
              choose to buy.
            </p>
            <p>
              From Paddle we keep, for each purchase: what it bought, the amount and currency, and Paddle&apos;s references for the payment and for you
              as its customer; for Pro, the plan, its status and billing periods; and any refund or chargeback. We also keep Paddle&apos;s ids for the
              payment events it sends us (nothing personal in them) for 90 days, to recognise a repeat. Paddle keeps its own records as the law
              requires of a seller.
            </p>
          </Section>

          <Section id="basis" title="Why we may use it">
            <OptionTable
              rows={[
                {
                  name: "Your account, coins, purchases",
                  what: "To provide the service you signed up for: our contract with you (GDPR Art. 6(1)(b)); under India's law, your consent when you sign up.",
                },
                {
                  name: "The AI review and Ask Claude",
                  what: "Your consent, given each time you confirm the notice (GDPR Art. 6(1)(a)). Not confirming, or simply not using them, is how you withhold it.",
                  away: true,
                },
                {
                  name: "Abuse limits, the welcome fingerprint, payment event ids",
                  what: "Our legitimate interest in keeping the service secure and fair, weighed against yours: they hold no address, name or IP (GDPR Art. 6(1)(f)).",
                },
                { name: "Purchase records", what: "Also to meet accounting and tax duties (GDPR Art. 6(1)(c)).", def: "" },
              ]}
            />
            <p>
              Giving your email address is needed to have an account; without one you can still use every tool except the two AI features. We make
              no decisions about you by automated means that have legal or similar effects: match suggestions and the AI review are aids you read
              and judge yourself.
            </p>
          </Section>

          <Section id="sharing" title="Who else is involved">
            <p>We never sell, rent or trade personal data, and we share it only with the services that run MargaLink:</p>
            <OptionTable
              title="Who processes what"
              rows={[
                {
                  name: "Cloudflare",
                  what: "Hosts the site, the account database (primarily in the Asia-Pacific region) and our file storage; protects them from attacks; runs the optional Turnstile check on the email sign-in form.",
                  def: "Global network",
                },
                { name: "Anthropic", what: "Runs the AI review and Ask Claude, as described above.", def: "United States", away: true },
                { name: "Google", what: "Only if you choose Continue with Google: confirms your email address and its id for your account.", def: "United States" },
                { name: "Resend", what: "Sends your sign-in emails: your address and the link.", def: "United States" },
                { name: "Paddle", what: "Sells coin packs and Pro as merchant of record.", def: "UK / United States" },
              ]}
            />
            <p>
              Some of them are outside your country, so your data may be processed in the United States and elsewhere. We rely on each
              provider&apos;s data-protection terms (including the standard contractual clauses the EU and UK recognise) for those transfers. We may
              also disclose data if the law requires it, for example to answer a valid court order.
            </p>
          </Section>

          <Section id="cookies" title="Cookies and browser storage">
            <p>
              MargaLink sets no advertising, analytics or tracking cookies, so it shows no cookie banner. Only these, all strictly necessary, and only
              when you&apos;re signed in or signing in:
            </p>
            <OptionTable
              title="Cookies"
              rows={[
                { name: "__Host-ml_session", what: "Keeps you signed in. Can't be read by pages; holds a random token, never your details.", def: "30 days, renewed as you use it" },
                { name: "ml_in", what: "Only says that you're signed in, so pages of a signed-out visitor never ask for account details.", def: "30 days, renewed as you use it" },
                { name: "__Host-ml_oauth", what: "Exists only during a Google sign-in, to complete it safely.", def: "10 minutes" },
              ]}
            />
            <p>
              The site also keeps a few things in your browser&apos;s own storage, on your device, which it never sends anywhere: your writing projects
              and their settings (layout, open files, whether to compile automatically), cached copies of the downloads listed above so they
              aren&apos;t fetched again, whether you&apos;ve seen the introduction, and, for this browser session, that you&apos;ve read the Ask Claude
              notice. When you buy coins, Paddle&apos;s checkout runs its own script, and where it&apos;s switched on so does Cloudflare&apos;s
              Turnstile check; each follows its own cookie and privacy terms.
            </p>
          </Section>

          <Section id="keeping" title="How long, and how safe">
            <p>
              Each item above shows how long it&apos;s kept. When something expires, or you delete your account, it&apos;s deleted from the live
              database straight away or within minutes. Our database provider keeps a point-in-time recovery copy for up to 30 days, so a deleted
              record can linger there for that long before it&apos;s gone for good; it&apos;s used only to recover from a failure.
            </p>
            <p>
              <strong>Safeguards.</strong> Everything travels over HTTPS. Sign-in tokens and links are stored only as one-way fingerprints, and the
              session cookie can&apos;t be read by scripts. Abuse counters and the welcome fingerprint are keyed with a secret, so they can&apos;t be
              matched to an address or IP by anyone without it. The API keys stay on the server. Only the person who runs MargaLink can reach the
              database. If a breach ever affected your data, we&apos;d tell you and the authorities as the law requires.
            </p>
          </Section>

          <Section id="rights" title="Your rights">
            <p>Depending on where you live, and in any case as our practice, you can:</p>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>See and take everything we hold</strong>: your{" "}
                <Link href="/account" className="text-accent hover:underline">
                  account page
                </Link>{" "}
                shows your coin history and has &ldquo;Download my data&rdquo;, a complete copy in a machine-readable file.
              </li>
              <li>
                <strong>Delete it</strong>: &ldquo;Delete my account&rdquo; on the same page removes it at once (it also cancels Pro).
              </li>
              <li>
                <strong>Correct it</strong>: write to <Contact /> to change your email address or fix anything else.
              </li>
              <li>
                <strong>Withdraw consent</strong>: stop using the AI features at any time; each needs your confirmation every time. Deleting your
                account withdraws consent to everything else, as easily as you gave it.
              </li>
              <li>
                <strong>Object, or ask us to restrict</strong> what we do with your data, including anything we do on the basis of legitimate interest.
              </li>
              <li>
                <strong>Nominate someone</strong> to exercise these rights for you if you die or can&apos;t (India&apos;s law provides for this):
                write to us.
              </li>
            </ul>
            <p>
              For anything the account page doesn&apos;t do, write to <Contact />. We&apos;ll answer within 30 days. If you&apos;re not satisfied,
              you can complain to your data-protection authority: in India, the Data Protection Board of India; in the EU, the authority where you
              live; in the UK, the Information Commissioner&apos;s Office.
            </p>
          </Section>

          <Section id="children" title="Children">
            <p>
              Accounts are for people 18 or older. The tools that need no account collect no personal data from anyone. If you believe someone under
              18 has created an account, write to us and we&apos;ll delete it.
            </p>
          </Section>

          <Section id="changes" title="Changes and contact">
            <p>
              When what MargaLink collects or sends changes, this notice changes first, with a new version and date at the top, and we&apos;ll tell
              account holders by email before a change that matters takes effect. New uses of your data would need your consent first where the law
              requires it.
            </p>
            <Aside title="Questions, requests and complaints">
              <p>
                Write to <Contact />. The{" "}
                <Link href="/terms" className="text-accent hover:underline">
                  terms
                </Link>{" "}
                cover how M coins work, and the{" "}
                <Link href="/refunds" className="text-accent hover:underline">
                  refund policy
                </Link>{" "}
                what comes back and when.
              </p>
            </Aside>
          </Section>
        </div>
      </DocBody>
    </main>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="max-w-3xl scroll-mt-28">
      <h2 className="font-serif text-2xl font-medium tracking-[-0.01em]">{title}</h2>
      <div className="mt-4 space-y-4 leading-relaxed text-ink-soft [&_strong]:font-medium [&_strong]:text-ink">{children}</div>
    </section>
  );
}

function PrivacyDiagram() {
  return (
    <figure className="sheet mx-auto max-w-md p-5">
      <svg
        viewBox="0 0 420 598"
        role="img"
        aria-label="Diagram: inside your browser, a paper is extracted to text, embedded into a vector, then ranked against a journal index, all locally. Two public files (the embedding model and the journal index) download once into the browser. No MargaLink server is part of this flow."
        className="h-auto w-full"
        style={{ color: "var(--ink)" }}
      >
        {/* Vertical stack (not a wide horizontal flow) so it stays legible at
            phone width: the diagram scales by width, and a narrow viewBox
            shrinks far less on a 375px screen than a wide one would. */}
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="currentColor" />
          </marker>
        </defs>

        <g fontFamily="var(--font-sans)">
          <rect x="70" y="14" width="280" height="52" rx="2" fill="none" stroke="currentColor" strokeWidth="1" />
          <text x="210" y="37" textAnchor="middle" fontSize="15">Embedding model (~30MB)</text>
          <text x="210" y="54" textAnchor="middle" fontSize="13" fill="var(--ink-soft)">public file, no personal data</text>
          <line x1="210" y1="66" x2="210" y2="104" stroke="currentColor" markerEnd="url(#arrow)" />
          <text x="222" y="89" fontSize="13" fill="var(--ink-soft)">downloads once, cached</text>

          <rect x="20" y="104" width="380" height="310" rx="3" fill="none" stroke="var(--accent)" strokeWidth="1.5" />
          <text x="36" y="126" fontSize="15" fill="var(--accent)">Your browser</text>

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

          <line x1="210" y1="414" x2="210" y2="452" stroke="currentColor" markerEnd="url(#arrow)" />
          <text x="222" y="437" fontSize="13" fill="var(--ink-soft)">downloads once, cached</text>
          <rect x="70" y="452" width="280" height="52" rx="2" fill="none" stroke="currentColor" strokeWidth="1" />
          <text x="210" y="475" textAnchor="middle" fontSize="15">Journal index (~8MB)</text>
          <text x="210" y="492" textAnchor="middle" fontSize="13" fill="var(--ink-soft)">public file, no personal data</text>

          <rect x="70" y="524" width="280" height="54" rx="2" fill="none" stroke="var(--away)" strokeWidth="1" strokeDasharray="4 3" />
          <text x="210" y="547" textAnchor="middle" fontSize="15" fill="var(--away)">MargaLink server</text>
          <text x="210" y="564" textAnchor="middle" fontSize="13" fill="var(--away)">no such request exists</text>
        </g>
      </svg>
      <figcaption className="mt-3 text-sm text-ink-soft">
        Matching a paper: everything that touches it happens inside the browser. The only traffic is two public downloads; there&apos;s no server
        in this loop to send your paper to.
      </figcaption>
    </figure>
  );
}
