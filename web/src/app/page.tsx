import Link from "next/link";
import IntroOverlay from "@/components/IntroOverlay";

const TOOLS = [
  {
    title: "Browse journals",
    body: "Search by name or field, see fees and indexing — no upload needed.",
    href: "/journals",
  },
  {
    title: "Match your paper",
    body: "Upload a finished paper, get ranked journal matches, and check its format — on your device.",
    href: "/match",
  },
];

const PATH_STEPS = [
  {
    title: "Match to a journal",
    body: "Upload your paper. Get ranked journal matches by field, fee, speed, and indexing.",
    status: "available" as const,
    href: "/match",
  },
  {
    title: "Check the format",
    body: "Word count, abstract, required sections, references — a structural check, done locally.",
    status: "available" as const,
    href: "/match",
  },
  {
    title: "Follow the journal's own rules",
    body: "Word limits, reference style, required statements — pulled from your chosen journal's actual guidelines.",
    status: "soon" as const,
  },
  {
    title: "Get it reviewed",
    body: "Structure, statistical reporting, and journal fit, checked before you submit.",
    status: "soon" as const,
  },
];

export default function HomePage() {
  return (
    <>
      <IntroOverlay />
      <main className="mx-auto w-full max-w-4xl px-6 py-14 sm:py-20">
        <header className="mb-12">
          <div className="mb-8 flex items-baseline justify-between">
            <span className="font-serif text-lg font-medium">MargaLink</span>
            <nav className="flex gap-5 text-sm text-ink-soft">
              <Link href="/journals" className="hover:text-ink">
                Browse journals
              </Link>
              <Link href="/privacy" className="hover:text-ink">
                How privacy works
              </Link>
            </nav>
          </div>
          <h1 className="font-serif text-4xl font-medium leading-tight sm:text-5xl">
            Get your paper ready to submit.
          </h1>
          <p className="mt-3 max-w-xl text-lg text-ink-soft">
            Match it to the right journal and check its format now — formatting
            rules and a pre-submission review are coming next. Your paper never
            leaves your device, at any step.
          </p>
        </header>

        <section className="grid gap-6 sm:grid-cols-2">
          {TOOLS.map((tool) => (
            <Link
              key={tool.title}
              href={tool.href}
              className="rounded-sm border border-line bg-paper-alt p-6 hover:border-accent"
            >
              <p className="font-serif text-lg font-medium">{tool.title}</p>
              <p className="mt-2 text-sm text-ink-soft">{tool.body}</p>
            </Link>
          ))}
        </section>

        <section className="mt-16">
          <h2 className="font-serif text-xl font-medium">
            The path from finished paper to submission
          </h2>
          <ol className="mt-6">
            {PATH_STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-4 border-t border-line py-5 first:border-t-0">
                <span className="font-mono text-sm text-ink-soft">{i + 1}</span>
                <div className="flex-1">
                  <div className="flex flex-wrap items-baseline gap-3">
                    {step.href ? (
                      <Link href={step.href} className="font-medium hover:underline">
                        {step.title}
                      </Link>
                    ) : (
                      <span className="font-medium">{step.title}</span>
                    )}
                    <span className={step.status === "available" ? "text-xs text-accent" : "text-xs text-ink-soft"}>
                      {step.status === "available" ? "Available now" : "Coming soon"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-ink-soft">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <footer className="mt-20 border-t border-line pt-6 text-sm text-ink-soft">
          <p>
            Matching is measured, not just claimed: 82% top-10 accuracy on
            held-out papers in the current sample.{" "}
            <Link href="/match" className="text-accent hover:underline">
              Try it
            </Link>
            .
          </p>
        </footer>
      </main>
    </>
  );
}
