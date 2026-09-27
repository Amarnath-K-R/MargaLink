import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, Boxes, ClipboardCheck, FileCheck2, FlaskConical, FolderTree, Palette, PenLine, Rocket, ScanSearch, ShieldCheck } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { Aside, DocBody, DocPart, DocSection, OptionTable, type TocItem } from "@/components/docs/Doc";
import { Steps, Swatches, SystemDiagram } from "@/components/docs/Diagrams";

export const metadata: Metadata = {
  title: "Architecture — MargaLink",
  description: "How MargaLink is built, for developers and reviewers: what runs where, how each privacy rule is enforced in code, each tool's pipeline, the design system, the tests and the review checklist.",
};

const TOC: TocItem[] = [
  { id: "overview", label: "The shape of it" },
  { id: "privacy", label: "Privacy, in code", tint: "#f1d2c2" },
  { id: "matching", label: "Matching", tint: "#cfe0e1" },
  { id: "reviewing", label: "The AI review", tint: "#ecdcc0" },
  { id: "figures", label: "Figures", tint: "#f1d2c2" },
  { id: "writing", label: "The workspace", tint: "#dde6e6" },
  { id: "design", label: "The clay design system" },
  { id: "code", label: "Where things live" },
  { id: "testing", label: "Tests" },
  { id: "deploying", label: "Deploying" },
  { id: "checklist", label: "Reviewing a change" },
];

const icon = (I: typeof Boxes) => <I size={20} strokeWidth={1.8} />;
const code = (s: string) => <code className="rounded-md bg-[#ebe8df] px-1.5 py-0.5 font-mono text-[0.85em] text-ink">{s}</code>;

export default function ArchitecturePage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-6 pt-3 pb-24">
      <PageHeader
        width="4xl"
        page="architecture"
        title="How MargaLink is built."
        subtitle={
          <p className="mt-3 max-w-2xl text-lg text-ink-soft">
            A tour for developers and reviewers: what runs where, why, and how to check a change keeps it that way. The reasoning in full lives in{" "}
            {code("docs/ARCHITECTURE.md")}; using the tools is in the{" "}
            <Link href="/guide" className="text-accent hover:underline">
              guide
            </Link>
            .
          </p>
        }
      />

      <DocBody toc={TOC}>
        {/* ---------------------------------------------------------------- */}
        <DocSection id="overview" title="The shape of it" icon={icon(Boxes)} lead="A static site that does its work in the browser, plus two small functions that exist only to hold an API key.">
          <SystemDiagram />
          <DocPart title="No server for the work">
            <p>
              The web app is a Next.js <strong>static export</strong> on Cloudflare Pages. There is no application server and no database. The journal
              index is built offline by the Python pipeline ({code("pipeline/")}) and shipped as static files ({code("web/public/index/")}); the browser
              downloads it once and does every match itself. That isn&apos;t an optimisation on top of a server design — a server that ranks journals
              necessarily sees the paper, so keeping &ldquo;the paper never leaves the device&rdquo; absolute meant taking the server out of the path.
            </p>
            <p>
              The two exceptions are Cloudflare Pages Functions — {code("functions/api/review.ts")} and {code("functions/api/figure.ts")} — for the two
              features that need a language model. They exist because the browser must never hold the Anthropic API key. Both are stateless.
            </p>
          </DocPart>
          <DocPart title="Heavy things run in workers">
            <p>
              LaTeX compiles in a Web Worker running TeX Live compiled to WebAssembly (BusyTeX). Figures draw in a worker running Python (Pyodide) with{" "}
              {code("public/figurelib.py")}. PDF text comes from pdf.js. The embedding model runs through transformers.js. Their files are public and
              versioned: the TeX engine and packs on an R2 bucket, Pyodide and the ONNX runtime from jsDelivr, the model from Hugging Face.
            </p>
          </DocPart>
        </DocSection>

        {/* ---------------------------------------------------------------- */}
        <DocSection id="privacy" title="Privacy, in code" icon={icon(ShieldCheck)} tint="#f1d2c2" lead="Three rules govern every change. Each is held by a specific place in the code, and checked by a test.">
          <OptionTable
            rows={[
              {
                name: "1 · The paper is never uploaded for matching or format checks",
                what: (
                  <>
                    Reading ({code("extract.ts")}), embedding ({code("embed.ts")}), ranking ({code("rank.ts")}, {code("match.ts")}), the format check (
                    {code("formatCheck.ts")}) and the journal-rules check ({code("rulesCheck.ts")}) run in the browser. Their only requests are bodyless GETs
                    for public files. The workspace reads its own compiled PDF the same way. Checked by {code("check_match.mjs")} and {code("check_write.mjs")}
                    : no request carries a body.
                  </>
                ),
              },
              {
                name: "2 · Nothing from a paper is stored on a server",
                what: (
                  <>
                    Both Functions are stateless: they validate, call Claude, gate the answer and return it. The only server state is a daily counter per
                    feature in KV ({code("review-pass-count:<date>")}, {code("figure-count:<date>")}). Writing projects live in the browser&apos;s Origin
                    Private File System ({code("projectStore.ts")}).
                  </>
                ),
              },
              {
                name: "3 · Anything that sends text out is opt-in, behind a plain notice",
                away: true,
                what: (
                  <>
                    Two features, each with its own notice: {code("ReviewConsent.tsx")} and {code("FigureConsent.tsx")}. A review starts only from the
                    notice&apos;s confirm (or Resume/Retry of a run already confirmed). Ask Claude&apos;s payload can only be built by{" "}
                    {code("buildFigurePayload()")} in {code("figureSchema.ts")}, whose selfcheck plants sentinels in cells and typed text and proves none
                    leave.
                  </>
                ),
              },
            ]}
          />
          <Aside tone="away" title="What the two exceptions send">
            <p>
              <strong>The review:</strong> the paper&apos;s text (author lines stripped, best effort), one request per section chunk, then one over the
              extracted claims — never the text again. Sections the user marks Don&apos;t send are never in any request.
            </p>
            <p>
              <strong>Ask Claude:</strong> column names and inferred types, the row count, the request text, the current figure spec with typed text
              blanked and groups as {code("#n")}; category labels only when a separate box is ticked. Never a cell value or a traceback.
            </p>
          </Aside>
        </DocSection>

        {/* ---------------------------------------------------------------- */}
        <DocSection id="matching" title="Matching" icon={icon(ScanSearch)} tint="#cfe0e1" lead="A hybrid ranker over a static index — its weights and its fit scale measured on held-out papers, not chosen.">
          <Steps
            tint="#cfe0e1"
            steps={[
              { title: "Read the paper", detail: "PDF text via pdf.js, DOCX via mammoth — or pasted text as a first-class entry.", files: "extract.ts" },
              { title: "Decide what to read", detail: "The title, the real abstract, keywords and the reference list — not the first few thousand characters, which are mostly authors.", files: "matchQuery.ts" },
              { title: "Embed", detail: "A small model (named in the manifest) turns the title and abstract into a 384-dimension vector, in the browser.", files: "embed.ts" },
              { title: "Topics and citations", detail: "The paper's likely research topics, and which journals its own references cite (a name counts only where a journal sits in a reference).", files: "topics.ts · references.ts" },
              { title: "Rank", detail: "Four signals — embedding similarity to each journal's closest centre, topic overlap, citations, a small activity prior — fused with fitted weights.", files: "rank.ts" },
              { title: "Say how good a match is", detail: "A calibrated fit: \"Fit 78\" is as close as 78% of real paper→journal pairings. An uncalibrated build shows raw similarity.", files: "rank.ts · manifest.json" },
            ]}
          />
          <DocPart title="The index">
            <p>
              Built offline: 1–4 centre embeddings per journal (k-means over its recent papers, so a broad journal is several clusters), metadata, a
              recent-topic profile, alternate names, and the topic table. Shipped as int8 rather than float (about 1 point of accuracy for a quarter of
              the size); every file stays under Cloudflare&apos;s 25 MB cap. Journals whose papers don&apos;t cohere are dropped at build time, with
              reasons. {code("web/scripts/eval_match.ts")} runs the same {code("rank.ts")} over each journal&apos;s newest (never indexed) papers, fits
              the weights and the fit scale, and writes both — with the measured accuracy — into the manifest.
            </p>
            <p>
              Only the {code("2,000")} most-published journals get a prerendered page ({code("/journal/[id]")}): Cloudflare Pages caps a deployment at
              20,000 files. Every other journal is fully searchable and matchable; its details expand in place. {code("journalUrl.ts")}&apos;s{" "}
              {code("isPrerendered()")} is the one place that decides.
            </p>
          </DocPart>
        </DocSection>

        {/* ---------------------------------------------------------------- */}
        <DocSection id="reviewing" title="The AI review" icon={icon(FileCheck2)} tint="#ecdcc0" lead="A map-reduce over the paper, run by the browser, where every quote the user sees has been verified against the paper.">
          <Steps
            tint="#ecdcc0"
            steps={[
              { title: "Prepare, on the device", detail: "Author lines stripped; the text normalised once (NFKC, ligatures, hyphenation, quotes) so quotes come back in the alphabet the check reads.", files: "review.ts" },
              { title: "Find the sections", detail: "From the document's own headings (Word heading styles; a PDF's fonts), a word list otherwise. The user can fix the outline and mark sections Don't send.", files: "headingHints.ts · reviewSections.ts" },
              { title: "Extract, per chunk", detail: "≤16k-character chunks, up to 3 at a time: bounded lists of quantitative claims, each with a verbatim quote.", files: "reviewOrchestrator.ts → /api/review", away: true },
              { title: "Verify every quote", detail: "On the server, each quote is checked against that chunk only; a quote that isn't there is dropped. A truncated pass is retried once asking for fewer claims.", files: "reviewGrounding.ts" },
              { title: "Cross-check the ledger", detail: "One pass over the claims ledger — never the text — finds inconsistencies and writes the prioritised summary. It can only cite ledger ids; unknown ids are dropped.", files: "reviewPasses.ts", away: true },
              { title: "Assemble", detail: "Findings with their verified quotes, and coverage: what was reviewed, what failed (retryable alone), what the depth skipped.", files: "reviewTypes.ts" },
            ]}
          />
          <DocPart title="Why it's built this way">
            <p>
              An early single-call version broke on long papers: thinking and the JSON answer shared one token budget, long text was cut, and one dropped
              stream lost everything. It also showed three model failure modes the design now defends against — numbers attributed to the wrong section
              (the abstract is its own labelled block), &ldquo;inconsistencies&rdquo; that reconciled on arithmetic (reconciliation is required before
              reporting), and quotes that appear nowhere (every quote is verified).
            </p>
            <p>
              Depth decides which section kinds are read, the claims cap per chunk and the effort of the cross-check; verification is the same at every
              depth. The Function checks exact request shapes and caps, applies the daily pass cap before calling upstream, streams from Anthropic (long
              non-streaming calls time out at the edge) and keeps nothing between requests. Papers over 400,000 characters are refused before the notice.
            </p>
          </DocPart>
        </DocSection>

        {/* ---------------------------------------------------------------- */}
        <DocSection id="figures" title="Figures" icon={icon(BarChart3)} tint="#f1d2c2" lead="Language is split from drawing: a declarative spec is the one artifact, drawn deterministically on the device.">
          <Steps
            tint="#f1d2c2"
            steps={[
              { title: "Read the data", detail: "Every sheet of an XLSX, CSV as UTF-8 or Windows-1252; the header row, decimal and thousands marks guessed; missing markers, strict numbers, type overrides, wide→long.", files: "spreadsheet.ts" },
              { title: "A figure is a spec", detail: "Panels × roles × overlays × statistics × annotations × journal style. Templates make one, the editor edits one, Claude returns one, a recipe saves one.", files: "figureSpec.ts · figureTemplates.ts" },
              { title: "Draw it in a worker", detail: "Pyodide runs figurelib.py on every change (debounced, stale renders dropped); exports at the journal width. SciPy loads only for a test.", files: "figureRunner.ts · figureWorker.mjs · figurelib.py" },
              { title: "Ask Claude (opt-in)", detail: "Only buildFigurePayload() builds what's sent: schema, request, the scrubbed spec. The Function re-validates it, then gates the answer.", files: "figureSchema.ts → /api/figure", away: true },
              { title: "Gate the answer", detail: "A spec must validate, fit the columns, and use no label it wasn't given. A tweak must define customize() and pass the allowlist.", files: "figureSpec.ts · figurePrompt.ts" },
              { title: "Run a tweak, fenced", detail: "Only after the user reads it and clicks Run; the worker first preloads what it needs, then replaces every network API and code-from-string path with throwing stubs.", files: "figureWorker.mjs · check_figure_sandbox.mjs" },
            ]}
          />
          <Aside title="Why labels are opt-in and tracebacks never leave">
            <p>
              A category label is a value — a site name, a patient ID. A Python traceback can quote a cell verbatim. So labels go only when ticked (and
              are listed in the notice), and render errors are shown as prose built from an error code and column names, with the traceback behind a
              &ldquo;stays on this device&rdquo; disclosure.
            </p>
          </Aside>
        </DocSection>

        {/* ---------------------------------------------------------------- */}
        <DocSection id="writing" title="The writing workspace" icon={icon(PenLine)} tint="#dde6e6" lead="LaTeX in the browser, full screen — and the hub the other tools open inside.">
          <Steps
            tint="#dde6e6"
            steps={[
              { title: "Projects in the browser", detail: "Each project is a folder in the Origin Private File System, with the last PDF; saves are debounced; zips for backup and import.", files: "projectStore.ts · zip.ts" },
              { title: "Edit", detail: "CodeMirror with the stex mode, a formatting bar, suggestions from the project's .bib keys and labels, an outline following \\input, diagnostics in the gutter.", files: "LatexEditor.tsx · EditorFormatBar.tsx · latexCompletions.ts · texSource.ts" },
              { title: "Compile", detail: "A worker runs BusyTeX (pdfLaTeX or XeLaTeX); packs chosen from the \\usepackage lines; a missing file retries once with every pack; a 90 s deadline once TeX runs.", files: "texRunner.ts · texEngine.ts · texWorker.js" },
              { title: "Read the compiled PDF", detail: "Match, Review and Checks read the last PDF through the same extraction as an upload — so they say Compile first until there is one.", files: "Workspace.tsx · extract.ts" },
              { title: "Tools as windows", detail: "Native <dialog>s over the workspace; each body a dynamic import. The tools' state lives in hooks mounted by the workspace — the same hooks the tool pages use — so a closed window keeps its results.", files: "useMatch · useReview · useFigures · useChecks" },
              { title: "Back into the paper", detail: "Insert into paper writes the figure's PDF and data-free recipe to figures/; review citations jump to their line; the target journal is kept in the project's meta.", files: "FiguresWindow.tsx · ReviewWindow.tsx" },
            ]}
          />
          <DocPart title="Engine hosting">
            <p>
              The engine (about 30 MB of WASM) and its data packs (about 110 MB basic) are too big for Pages&apos; per-file cap, so they live on a public R2
              bucket under a release-dated prefix, every object immutable. Packs are cached by the engine&apos;s own loader in IndexedDB.{" "}
              {code("scripts/publish_busytex.sh")} uploads an allowlist with pinned sizes and a total cap; the bucket&apos;s CORS allows only our origins.
            </p>
          </DocPart>
        </DocSection>

        {/* ---------------------------------------------------------------- */}
        <DocSection id="design" title="The clay design system" icon={icon(Palette)} lead="One palette, one light, a handful of surfaces — shared by the tool pages, the workspace and these docs.">
          <Swatches
            colors={[
              { name: "Paper", hex: "#f0efea", use: "the desk" },
              { name: "White", hex: "#fbfaf6", use: "sheets: what you read" },
              { name: "Ink", hex: "#1b1f27", use: "text" },
              { name: "Teal (accent)", hex: "#2c5f6f", use: "actions, the current thing" },
              { name: "Teal pale", hex: "#cfe0e1", use: "Match bead" },
              { name: "Sand", hex: "#ecdcc0", use: "Review bead" },
              { name: "Clay soft", hex: "#f1d2c2", use: "Figures bead" },
              { name: "Away", hex: "#a15a3f", use: "only: leaves the device" },
            ]}
          />
          <OptionTable
            title="app/clay.css — in the components layer, so a Tailwind utility on the same element wins"
            rows={[
              { name: ".clay", what: "A raised slab: matte gradient, a highlight on top, a warm shadow under. Trays, steps, cards." },
              { name: ".clay-well", what: "Pressed in: the current item, fields' surroundings, notes." },
              { name: ".sheet", what: "A white paper sheet on the desk — what you read: sources, PDFs, results, reviews." },
              { name: ".clay-btn · .clay-primary", what: "A pill that lifts on hover and presses in on click; the primary one is teal (one per screen)." },
              { name: ".clay-ghost · .clay-chip · .clay-key", what: "Flat until touched (tray items); small tinted actions inside cards; keycaps (⌘K, shortcuts)." },
              { name: ".clay-input · .clay-field · .clay-select", what: "Text fields and selects pressed into the clay, a teal ring on focus." },
              { name: ".clay-card", what: "A choice; aria-pressed / aria-checked / data-selected press it in and tint it teal." },
              { name: ".bead · .grip · .desk · .clay-window", what: "Icon beads (each tool has a tint), the split handle, the full-screen workspace background, dialogs." },
            ]}
          />
          <Aside title="Rules of thumb">
            <p>
              Shadows are warm (rgba(58, 44, 28, …)) and fall from one light at the top left. Things you read are sheets; things you touch are clay. The
              away colour is spent only on what would leave the device. The homepage keeps its own stylesheet ({code("_home/home.css")}) and 3D clay desk.
            </p>
          </Aside>
        </DocSection>

        {/* ---------------------------------------------------------------- */}
        <DocSection id="code" title="Where things live" icon={icon(FolderTree)} lead="Routes own their pages and pieces; shared logic is flat in lib/; the two server files are in functions/.">
          <OptionTable
            rows={[
              { name: "web/src/app/", what: "Routes. Each tool's page is JSX over a hook in its _components/ (useMatch, useReview, useFigures) that the workspace reuses. The homepage lives in _home/." },
              { name: "web/src/components/", what: "Shared pieces: PageHeader (the tray), Step, Dialog, the consent notices, result panels, docs/ (these pages' blocks), three/ (the homepage's 3D scenes)." },
              { name: "web/src/lib/", what: "Framework-agnostic logic, deliberately flat: match*/rank/topics/references, review*, figure*, tex*, projectStore, spreadsheet, journalRules. A relative lib import carries .ts (Node runs the selfchecks natively)." },
              { name: "web/functions/api/", what: "review.ts and figure.ts — the only server code. They may import from src/lib/ only modules that are pure or isomorphic (no window, localStorage or fs)." },
              { name: "web/public/", what: "The index, templates, the figure gallery, the TeX and figure workers, figurelib.py, fonts, the guide's screenshots." },
              { name: "pipeline/", what: "The offline Python (uv) pipeline: fetch from OpenAlex, enrich from DOAJ and NLM, k-means centres, quality filters, build the index." },
              { name: "web/scripts/", what: "The Playwright smokes (check_*.mjs), the ranker's evaluation (eval_match.ts), the guide's screenshots (guide_shots.mjs)." },
            ]}
          />
          <p className="text-sm text-ink-soft">
            Start with {code("CLAUDE.md")} (the three rules), then {code("src/lib/rank.ts")}, then {code("docs/ARCHITECTURE.md")}&apos;s folder map — one
            line per file.
          </p>
        </DocSection>

        {/* ---------------------------------------------------------------- */}
        <DocSection id="testing" title="Tests" icon={icon(FlaskConical)} lead="Selfchecks for pure logic, Playwright smokes for the flows, and CI on every push.">
          <OptionTable
            title="Commands"
            rows={[
              { name: "npm run check", what: "Typecheck, lint, and every *.selfcheck.ts (plain Node, no framework) — grounding, payload sentinels, the ranker's drift guard, LaTeX helpers…", def: "web/ · CI" },
              { name: "npm run smoke", what: "The Playwright checks below, against a running dev server.", def: "web/ · local" },
              { name: "uv run selfcheck.py", what: "figurelib.py under CPython with Pyodide's library versions; and the pipeline's own checks.", def: "web/figurelib, pipeline · CI" },
            ]}
          />
          <OptionTable
            title="The smokes (web/scripts/check_*.mjs)"
            rows={[
              { name: "check_match", what: "What is read from a real PDF, topics, fit badges, a why panel, the correction and paste paths, and not one request with a body." },
              { name: "check_filters · check_format", what: "Filters really re-rank; the format check on a multi-page PDF." },
              { name: "check_journals_browse · check_journal_page", what: "Browsing without the vector file; a result opens a real journal page." },
              { name: "check_review", what: "Against a mocked /api/review: consent naming the request count, per-pass progress, a failed section, Retry, grounded citations, cancel, the capacity stop." },
              { name: "check_figures · check_figure_sandbox", what: "A messy spreadsheet read right, templates, editors, recipes, a mocked Ask Claude; tweaks that try every way out fail with zero requests." },
              { name: "check_write", what: "Compile, diagnostics, backups, files, the hub windows (a mocked review, the figure window), the formatting bar, suggestions, the outline, views, a failed engine download." },
              { name: "check_keyboard · check_intro · check_homepage", what: "The dropzone by keyboard; the first-visit intro; the homepage." },
            ]}
          />
        </DocSection>

        {/* ---------------------------------------------------------------- */}
        <DocSection id="deploying" title="Deploying" icon={icon(Rocket)} lead="A static build to Cloudflare Pages, the two Functions alongside it.">
          <DocPart title="npm run deploy">
            <p>
              Builds the static export, removes one oversized WASM file Next copies in (the ONNX runtime is loaded from a CDN instead — Pages rejects files
              over 25 MB), then {code("wrangler pages deploy")}. The Functions need one secret, {code("ANTHROPIC_API_KEY")}, set in the Pages dashboard (
              {code("web/.dev.vars")} locally), and KV namespaces for the daily counters. The index must be built first ({code("pipeline/README.md")}); the
              TeX engine is published separately to R2 ({code("scripts/publish_busytex.sh")}).
            </p>
          </DocPart>
        </DocSection>

        {/* ---------------------------------------------------------------- */}
        <DocSection id="checklist" title="Reviewing a change" icon={icon(ClipboardCheck)} lead="What to check before approving anything, in the order it matters.">
          <ol className="grid gap-3 md:grid-cols-2">
            {[
              ["New requests", "Does anything new call fetch, XHR or a worker import? Every new request must be a bodyless GET for a public file — or go through one of the two notices."],
              ["Consent paths", "Can the review or Ask Claude start without a click on its notice? Is any new default on? Does the notice still say exactly what's sent?"],
              ["What's in a payload", "Does anything add a field to what's sent? The review's pass requests and Ask Claude's payload have exact shapes, checked on both sides."],
              ["Server state", "Does a Function now keep anything between requests beyond the daily counters?"],
              ["Functions' imports", "Anything new imported by functions/ must be pure or isomorphic."],
              ["Tests", "npm run check green; the smokes for the flows touched; a selfcheck for new pure logic, written first."],
              ["The away colour", "Used only for what leaves the device — nothing else may borrow it."],
              ["Docs", "ARCHITECTURE.md's folder map and sections, the privacy page, and this page and the guide still true — the guide's screenshots re-made with guide_shots.mjs if a screen changed."],
            ].map(([t, d], i) => (
              <li key={t} className="clay flex gap-3 p-4 text-sm">
                <span aria-hidden className="bead h-7 w-7 shrink-0 font-mono text-xs" style={{ background: "#ebe8df" }}>
                  {i + 1}
                </span>
                <div>
                  <p className="font-medium">{t}</p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-soft">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </DocSection>
      </DocBody>
    </main>
  );
}
