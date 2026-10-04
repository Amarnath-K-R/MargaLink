import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, BookOpen, Coins, Compass, FileCheck2, LifeBuoy, PenLine, ScanSearch } from "lucide-react";
import PageHeader from "@/components/layout/PageHeader";
import { WELCOME_COINS } from "@/lib/accounts/coins";
import { BETA } from "@/lib/access/beta";
import ResetSiteData from "@/app/guide/_components/ResetSiteData";
import { Aside, DocBody, DocPart, DocSection, Keys, OptionTable, Shot, type TocItem } from "@/components/docs/Doc";
import { FiguresArt, JournalsArt, MatchArt, PrivacyArt, ReviewArt, WriteArt } from "@/components/docs/Art";

export const metadata: Metadata = {
  title: "Guide | MargaLink",
  description: "How to use every MargaLink tool (browse journals, match your paper, get it reviewed, make figures and write it), option by option, with screenshots.",
};

const TINT = { journals: "#efe3cf", match: "#cfe0e1", review: "#ecdcc0", figures: "#f1d2c2", write: "#dde6e6", start: "#ebe8df", coins: "#f3e4bd" };

const TOC: TocItem[] = [
  { id: "start", label: "Getting around", tint: TINT.start },
  { id: "journals", label: "Browse journals", tint: TINT.journals },
  { id: "match", label: "Match your paper", tint: TINT.match },
  { id: "review", label: "Get it reviewed", tint: TINT.review },
  { id: "figures", label: "Make figures", tint: TINT.figures },
  { id: "write", label: "Write your paper", tint: TINT.write },
  { id: "coins", label: "Accounts and M coins", tint: TINT.coins },
  { id: "help", label: "When something's off", tint: TINT.start },
];

const icon = (I: typeof BookOpen) => <I size={20} strokeWidth={1.8} />;

export default function GuidePage() {
  return (
    <main className="mx-auto w-full max-w-7xl px-6 pt-3 pb-24">
      <PageHeader
        width="4xl"
        page="guide"
        title="How to use MargaLink."
        subtitle={
          <p className="mt-3 max-w-2xl text-lg text-ink-soft">
            Every tool, every option, on the real screens. Start anywhere; each section stands on its own. Building or reviewing MargaLink instead?{" "}
            <Link href="/architecture" className="text-accent hover:underline">
              Read how it&apos;s built
            </Link>
            .
          </p>
        }
      />

      <DocBody toc={TOC}>
        {/* ---------------------------------------------------------------- */}
        <DocSection
          id="start"
          title="Getting around"
          tint={TINT.start}
          icon={icon(Compass)}
          art={<PrivacyArt />}
          lead="Home, five tools, this guide and your M coins share one tray at the top of every page. Almost everything the tools do happens in your browser, on your device."
        >
          <Shot
            name="tray"
            alt="The tray at the top of every page: the MargaLink mark, the five tools, Guide and your M coins"
            notes={[
              <>
                <strong>The MargaLink mark</strong>: back to the landing page.
              </>,
              <>
                <strong>Home</strong>: your dashboard: start writing, open this guide, and see what&apos;s new. The landing page&apos;s Dashboard button
                comes here too.
              </>,
              <>
                <strong>The tools</strong>: Journals, Match, Review, Figures, Write. Each has its own colour bead, used on its page too.
              </>,
              <>
                <strong>Where you are</strong>: the current tool is pressed into the tray.
              </>,
              <>
                <strong>Write</strong>: the workspace, where the other tools also open as windows.
              </>,
              <>
                <strong>Guide</strong>: this page.
              </>,
              <>
                <strong>Your M coins</strong>, once you&apos;re signed in: the balance, and a click to your account. Signed out, it says{" "}
                <em>Sign in</em>; only the AI review, Ask Claude and Rewrite need an account. Privacy, the terms and the other site links are at the
                bottom of your dashboard.
              </>,
            ]}
          />
          <Aside title="What stays on your device">
            <p>
              Reading your paper, matching it to journals, the format and journal-rules checks, drawing figures from your spreadsheet, writing and
              compiling LaTeX, editing Word documents and checking their spelling and grammar all run in your browser. What it downloads is public (the journal index, the matching model, the TeX engine, the figure
              engine), and none of those requests carries anything of yours.
            </p>
          </Aside>
          <Aside tone="away" title="The three things that can leave it, only when you confirm">
            <p>
              <strong>The AI review</strong> sends your paper&apos;s text to Claude, in short requests, after a notice that says exactly that. It needs an
              account and costs M coins; the price is on the button, and any part of a review that doesn&apos;t come back is refunded.
            </p>
            <p>
              <strong>Ask Claude</strong> in the figure studio sends a description of your data: column names and types, the row count, your request;
              never a value from a cell. Group labels go only if you tick a box. 1 M coin a request, refunded if it fails.
            </p>
            <p>
              <strong>Rewrite</strong> in the writing workspace sends only the passage you select, once you&apos;ve turned it on for that paper.
              Citations, equations and pictures in it stay here. 1 M coin per 500 words, refunded if it fails.
            </p>
            <p>Anywhere in MargaLink, this colour marks something that would leave your device.</p>
          </Aside>
        </DocSection>

        {/* ---------------------------------------------------------------- */}
        <DocSection
          id="journals"
          title="Browse journals"
          tint={TINT.journals}
          icon={icon(BookOpen)}
          art={<JournalsArt />}
          lead="Every journal in the index, searchable by name and field, with what it costs to publish there and how long it takes."
        >
          <Shot
            name="journals-search"
            alt="The journal browser: a search box and a field filter above a grid of journal cards"
            notes={[
              <>
                <strong>Search by name</strong>: the list narrows as you type.
              </>,
              <>
                <strong>Field</strong>: keep one field (Medicine, Engineering…).
              </>,
              <>
                <strong>A journal</strong>: opens its page; journals without a page of their own open their details right in the card.
              </>,
              <>
                <strong>Chips</strong>: open access (listed in DOAJ), MEDLINE-indexed, the article processing fee, the typical weeks to publish.
              </>,
            ]}
            caption="The first 100 matches are shown; narrow the search to see the rest."
          />
          <Shot
            name="journal-page"
            alt="A journal's page: two buttons and its details on a paper sheet"
            notes={[
              <>
                <strong>Write a paper for this journal</strong>: starts a project in the workspace from the template its publisher uses.
              </>,
              <>
                <strong>All journals</strong>: back to the browser.
              </>,
              <>
                <strong>Its details</strong>: field, the topics of its recent papers, open access, MEDLINE, fees (with DOAJ&apos;s own figure when it
                differs), time to publish, licence, ISSN, last year it published, country.
              </>,
              <>
                <strong>Official links</strong>: the journal&apos;s own page and its peer-review policy. They are the final authority; the details here
                come from OpenAlex and DOAJ.
              </>,
            ]}
          />
        </DocSection>

        {/* ---------------------------------------------------------------- */}
        <DocSection
          id="match"
          title="Match your paper"
          tint={TINT.match}
          icon={icon(ScanSearch)}
          art={<MatchArt />}
          lead="Give it a draft and get the journals whose recent papers are closest to yours, ranked in this tab. The paper never leaves it."
        >
          <Shot
            name="match-input"
            alt="The match page's input: two ways in, a drop area, and the steps run on the device"
            notes={[
              <>
                <strong>Two ways in</strong>: upload a file, or paste the title (first line) and abstract; pasting is the light path for a phone or a
                draft that isn&apos;t a file yet.
              </>,
              <>
                <strong>Drop a PDF or DOCX</strong>, or click to choose one.
              </>,
              <>
                <strong>On this device</strong>: every step as it runs: reading the file, finding references, reading the title and abstract, loading the
                matching model (once, then cached), making the paper&apos;s vector, estimating its topics, ranking the journals.
              </>,
            ]}
          />
          <Shot
            name="match-read"
            alt="What the matcher read: the title, the abstract, the references and the topics"
            notes={[
              <>
                <strong>Title and abstract</strong> as they were read. More shows the rest.
              </>,
              <>
                <strong>References</strong>: how many were found and how many name a journal in the index. Journals you cite count toward the ranking.
              </>,
              <>
                <strong>Reads as</strong>: the research topics your paper most resembles, with their share.
              </>,
              <>
                <strong>Not right?</strong> Paste your title and abstract to match on those instead; your file&apos;s reference list still counts.
              </>,
            ]}
          />
          <Shot name="match-filters" alt="The filters: field, fee, speed, open access, MEDLINE" />
          <OptionTable
            title="Filters: they re-rank the list instantly, on the device"
            rows={[
              { name: "Field", what: "Only journals in one field.", def: "All fields" },
              { name: "Fee", what: "Any fee · Free only · Under $1,500 · Under $3,000 · Under $5,000 (the article processing charge).", def: "Any fee" },
              { name: "Speed", what: "Any speed · Under 8 · 16 · 26 weeks: the journal's typical time from submission to publication.", def: "Any speed" },
              { name: "Open access (DOAJ) only", what: "Only journals listed in the Directory of Open Access Journals.", def: "Off" },
              { name: "MEDLINE-indexed only", what: "Only journals indexed in MEDLINE.", def: "Off" },
            ]}
          />
          <Shot
            name="match-result"
            alt="One result: its rank, name, fit, chips, actions and the reasons it was suggested"
            notes={[
              <>
                <strong>Rank</strong>: best first; the top three are tinted.
              </>,
              <>
                <strong>The journal</strong>: opens its page, or its details in place.
              </>,
              <>
                <strong>Fit</strong>: how close the match is next to real published pairings: &ldquo;Fit 78&rdquo; is as close as 78% of real papers are
                to the journal they appeared in. <strong>Strong</strong>, <strong>possible</strong> or <strong>weak</strong>.
              </>,
              <>
                <strong>Chips</strong>: field, open access, MEDLINE, fee, speed.
              </>,
              <>
                <strong>Why this journal</strong>: shows or hides the reasons.
              </>,
              <>
                <strong>Write for this journal</strong>: a new workspace project in its publisher&apos;s template.
              </>,
              <>
                <strong>The reasons</strong>: the topics you share with its recent papers (yours against its), how often your references cite it, and the
                cluster of its papers yours sits closest to.
              </>,
            ]}
            caption="For the journals with hand-verified guidelines, a result also offers Check against its rules (the structural check, inline) and AI review available (the Review page)."
          />
          <Shot
            name="match-format"
            alt="The format check: word count, abstract, statements, references, figures and tables"
            notes={[
              <>
                <strong>Word count</strong> of the whole text.
              </>,
              <>
                <strong>Abstract</strong>: found or not, its length, and whether it&apos;s structured.
              </>,
              <>
                <strong>Statements</strong>: ethics, funding, conflicts of interest, data availability: a tick if a statement was found.
              </>,
            ]}
            caption="Also: an approximate reference count and how many figures and tables are referenced. It's a rule-based read of your text; confirm against the journal you choose."
          />
        </DocSection>

        {/* ---------------------------------------------------------------- */}
        <DocSection
          id="review"
          title="Get it reviewed"
          tint={TINT.review}
          icon={icon(FileCheck2)}
          art={<ReviewArt />}
          lead="Check your paper against one journal's own guidelines (free, on your device), then, if you want, get a review by Claude that checks your paper's numbers against each other."
        >
          <DocPart title="1 · Attach your paper">
            <p>A PDF or DOCX. It&apos;s read in this tab; nothing is sent until you confirm the notice in step 3.</p>
          </DocPart>
          <Shot
            name="review-attach"
            alt="Step 1: the drop area, and the paper loaded"
            notes={[<>Drop the file here, or click to choose it.</>, <>A tick and the file&apos;s name once it&apos;s read.</>]}
          />
          <DocPart title="2 · Choose a journal">
            <p>
              The journals whose guidelines have been verified by hand: JAMA, PLoS ONE, Cureus, BMC Public Health, IEEE Access, Frontiers in Psychology,
              Nature Communications and Scientific Reports. For suggestions across the whole index, use Match.
            </p>
          </DocPart>
          <Shot
            name="review-journal"
            alt="Step 2: the journal cards, one chosen, and the structural check below"
            notes={[
              <>
                <strong>The chosen journal</strong>: pressed in.
              </>,
              <>Any other card switches to it.</>,
              <>
                <strong>Structural check</strong>: your word count against the limit for its main article type, the reference style it asks for (numbered
                or author–year) where it sets one, and its required statements. Dated, and linked to the journal&apos;s own guidelines.
              </>,
            ]}
          />
          <DocPart title="3 · Get it reviewed">
            <p>Choose how deep, check the outline, then ask. The notice tells you exactly what would be sent before anything is.</p>
          </DocPart>
          <Shot
            name="review-depth"
            alt="Step 3: the three depths, the detected outline opened, and the review button"
            notes={[
              <>
                <strong>Quick</strong>
              </>,
              <>
                <strong>Standard</strong> (the default)
              </>,
              <>
                <strong>Thorough</strong>
              </>,
              <>
                <strong>A section&apos;s type</strong>: fix what was detected, or choose <strong>Don&apos;t send</strong>.
              </>,
              <>
                <strong>Missing a heading?</strong> Type it exactly as it appears in the paper and add it.
              </>,
              <>
                <strong>Get a … review by Claude</strong>: opens the notice; nothing is sent yet.
              </>,
            ]}
          />
          <OptionTable
            title="Depth"
            rows={[
              { name: "Quick", what: "The abstract, results and discussion reviewed, with the whole paper as context; the major problems, fast." },
              { name: "Standard", what: "Every section except the references and supplementary material, then a second look at the major findings and problems across the paper.", def: "Default" },
              { name: "Thorough", what: "Standard, plus the supplementary material, each subsection on its own, minor points and suggestions, and the reporting checklist for your study type." },
            ]}
          />
          <OptionTable
            title="The detected outline: it decides what is sent, and stays on your device"
            rows={[
              { name: "Section types", what: "Abstract, Introduction, Methods, Results, Discussion / conclusion, Main text, Supplementary, References, Front matter / other." },
              { name: "Don't send", what: "The section is left out of every request; it never leaves your device." },
              { name: "Merge into previous", what: "Joins a section to the one before it (a heading that was really a sub-heading)." },
              { name: "Add heading", what: "Splits the text at a heading the reader missed; type it exactly as it appears." },
              { name: "Undo all edits", what: "Back to the outline as detected." },
            ]}
          />
          <Shot
            name="review-consent"
            alt="The notice before a review: what would be sent, and the send and cancel buttons"
            notes={[
              <>Marked in the colour for something that leaves your device.</>,
              <>
                <strong>What happens</strong>: your text goes to Claude in a stated number of requests, each carrying the paper and doing one part: a section each, then the final report. Author names and email addresses are stripped first (best effort).
              </>,
              <>
                <strong>The price</strong>: what this review costs in M coins, and your balance. Any part that doesn&apos;t come back (a section, the reporting checklist or the final report) is refunded about two hours after it starts; resuming or retrying costs nothing more.
              </>,
              <>
                <strong>Send it and review</strong>: the only way a review starts, and only once you tick the box agreeing to send the text. Cancel
                sends nothing.
              </>,
            ]}
          />
          <Aside tone="away" title="What a review sends, and what happens to it">
            <p>
              The text of the sections you didn&apos;t mark <strong>Don&apos;t send</strong>, with every request, to Anthropic&apos;s Claude API, which may hold it in memory for a few minutes to reuse between the requests. Anthropic doesn&apos;t train
              on API data and deletes it within 30 days, keeping it longer only to enforce its Usage Policy or where the law requires; MargaLink stores
              none of it. Papers over 400,000 characters are refused before the notice, never cut short.
            </p>
          </Aside>
          <DocPart title="Using AI review responsibly">
            <ul className="list-disc space-y-1.5 pl-5">
              <li>Use it only for your own manuscripts, or with your co-authors&apos; agreement.</li>
              <li>Never use it for a manuscript or grant you received as a peer reviewer or editor: funders and journals forbid sending those to AI tools.</li>
              <li>Leave out identifiable data about study participants or patients.</li>
              <li>Check your target journal&apos;s AI policy, and disclose AI assistance where it asks.</li>
            </ul>
            <p>If your journal wants a disclosure, you can adapt this:</p>
            <blockquote className="clay-well rounded-xl p-4 text-sm">
              The authors used MargaLink&apos;s AI review, which uses Claude by Anthropic, to check the manuscript against the journal&apos;s guidelines
              before submission. The authors reviewed all suggestions and take full responsibility for the content.
            </blockquote>
          </DocPart>
          <DocPart title="While it runs">
            <p>
              Each section&apos;s review appears as it comes back; the overview and <strong>Fix these first</strong> come last. <strong>Cancel</strong> stops it without using a review; <strong>Resume review</strong> picks up
              where it stopped. If a section couldn&apos;t be checked, the rest still finishes and <strong>Retry failed sections</strong> re-runs just
              those.
            </p>
          </DocPart>
          <Shot
            name="review-result"
            alt="The review's overview: what the paper does, its strengths and weaknesses, the journal fit, and what to fix first"
            notes={[
              <>
                <strong>Overview</strong>: what the paper does, its strengths and main weaknesses, and the journal fit.
              </>,
              <>
                <strong>Fix these first</strong>: the findings that matter most, in order; each one takes you to it.
              </>,
              <>
                <strong>Download</strong>, <strong>Print or save as PDF</strong>, <strong>Copy</strong>: keep the report. It&apos;s also kept in this browser until you forget it.
              </>,
            ]}
          />
          <Shot
            name="review-result-more"
            alt="The review section by section, with the coverage"
            notes={[
              <>
                <strong>Section by section</strong>: each section&apos;s verdict, then its findings, each with the passages it rests on (every quote checked against your paper), why it matters and what to do.
              </>,
              <>Major findings get a second look; a doubtful one is put as a question.</>,
              <>
                <strong>Coverage</strong>: which sections were reviewed, any that couldn&apos;t be, and findings set aside on a second look.
              </>,
            ]}
            caption="It's a second opinion from a language model: consider it, but don't treat it as a guarantee."
          />
        </DocSection>

        {/* ---------------------------------------------------------------- */}
        <DocSection
          id="figures"
          title="Make figures"
          tint={TINT.figures}
          icon={icon(BarChart3)}
          art={<FiguresArt />}
          lead="Turn a spreadsheet into a journal-ready figure, from a template or a sentence, adjusted by hand, drawn on your device and exported at the journal's width."
        >
          <DocPart title="1 · Attach your data">
            <p>A CSV, TSV, TXT or XLSX file. It&apos;s read in this tab and its values never leave it. A workbook with several sheets asks which one.</p>
          </DocPart>
          <Shot
            name="figures-prep"
            alt="Step 2: how the spreadsheet was read: header row, number formats, missing values, column types and a preview"
            notes={[
              <>
                <strong>Columns separated by</strong> (CSV files): comma, semicolon or tab, guessed from how the rows split.
              </>,
              <>
                <strong>Header is on row</strong>: guessed past any title or note lines above the table.
              </>,
              <>
                <strong>Decimal mark</strong>: dot (1.5) or comma (1,5).
              </>,
              <>
                <strong>Thousands separator</strong>: none, comma, dot, space or apostrophe (never the same as the decimal mark).
              </>,
              <>
                <strong>Dates written</strong>: day first (31/12/2024) or month first (12/31/2024); guessed when a date gives it away.
              </>,
              <>
                <strong>Missing-value markers</strong>: what counts as an empty cell (NA, N/A, NULL, #N/A, -…).
              </>,
              <>
                <strong>Stack columns (wide → long)</strong>: turn week1, week2, week3 into one measure plus a column saying which, with names you choose.
              </>,
              <>
                <strong>A column&apos;s type</strong>: categorical, numeric or date; &ldquo;(auto)&rdquo; is the guess. Cells that aren&apos;t numbers in a
                numeric column are left empty, and counted.
              </>,
              <>
                <strong>Preview</strong>: the first rows, exactly as the figure will read them.
              </>,
            ]}
          />
          <Shot
            name="figures-describe"
            alt="Step 3: describe the figure to Claude"
            notes={[
              <>
                <strong>Describe the figure</strong> you want, in your own words.
              </>,
              <>
                <strong>Also send group labels</strong>: lets you name groups (&ldquo;compare against Placebo&rdquo;); only columns with at most 30
                distinct values. Off unless you tick it.
              </>,
              <>
                <strong>Ask Claude for a figure</strong>: Claude returns a figure description, applied to your data here.
              </>,
              <>
                <strong>Ask for a custom tweak (code)</strong>: for what the settings can&apos;t do: a small Python function you read first, run only
                when you click <em>Run this tweak</em>, with network access switched off.
              </>,
              <>
                <strong>Exactly what would be sent</strong>: the request itself, before you send it.
              </>,
            ]}
          />
          <Aside tone="away" title="What Ask Claude sends">
            <p>
              Column names and their types, the row count, your request, and the current figure with every text you typed blanked. Group labels only when
              ticked, and listed in the notice each time. Never a cell value, never a sample row, never an error message from your data. Each request
              costs 1 M coin and is refunded if it fails; templates, editing and exports are free, unlimited and send nothing.
            </p>
          </Aside>
          <Shot
            name="figures-gallery"
            alt="Templates: thumbnails of starting points, one chosen"
            notes={[<>The template in use.</>, <>Any other starts over from it, bound to your columns by type. No request is made.</>]}
            caption="Bar with error bars · Box plot · Scatter with regression · Dose-response line · Histogram · Grouped bar · Stacked bar · Violin with brackets · Strip plot · Correlation matrix · Forest plot · Kaplan-Meier survival · Two-panel figure · Four-panel grid."
          />
          <DocPart title="4 · Adjust the whole figure">
            <p>These apply to every panel.</p>
          </DocPart>
          <Shot
            name="figures-style"
            alt="The figure's style, size, palette and grid, and the panel tabs"
            notes={[
              <>
                <strong>Journal style</strong>
              </>,
              <>
                <strong>Size</strong>
              </>,
              <>
                <strong>Rows</strong> and columns of panels
              </>,
              <>
                <strong>Panel letters</strong> and a shared legend
              </>,
              <>
                <strong>A panel</strong>: choose which one you&apos;re editing
              </>,
              <>
                <strong>Add panel</strong> (Remove panel appears once there are two)
              </>,
            ]}
          />
          <OptionTable
            rows={[
              {
                name: "Journal style",
                what: "Nature (7 pt sans, a b c) · Science (7 pt sans, A B C) · Medical journals (8 pt sans) · IEEE (8 pt serif) · Minimal (9 pt, slides).",
                def: "Nature",
              },
              { name: "Size", what: "Single column (89 mm) · Double column (183 mm) · Custom (a width in mm).", def: "Single column" },
              { name: "Height (mm)", what: "Auto, or a fixed height.", def: "Auto" },
              { name: "Palette", what: "okabe-ito (colour-blind safe) · tol-bright · tol-muted · viridis · grey · custom (pick each colour).", def: "okabe-ito" },
              { name: "Rows · Columns", what: "The grid the panels sit in." },
              { name: "Panel letters", what: "Label panels a, b, c (or A, B, C, by style)." },
              { name: "One shared legend", what: "A single legend for all panels instead of one each." },
            ]}
          />
          <DocPart title="4 · Adjust one panel">
            <p>Choose the chart type and which column plays which part; the sections under it open for the finer controls.</p>
          </DocPart>
          <Shot
            name="figures-panel"
            alt="A panel's chart type, columns and title"
            notes={[
              <>
                <strong>Chart type</strong>: Bar, Box, Violin, Strip, Scatter, Line, Histogram, Heatmap, Forest, Survival (KM).
              </>,
              <>
                <strong>x</strong>
              </>,
              <>
                <strong>y</strong> (and an optional group; forest and survival plots ask for their own columns: estimate and interval, time and event)
              </>,
              <>
                <strong>Panel title</strong>
              </>,
            ]}
          />
          <Shot
            name="figures-panel-sections"
            alt="A panel's sections: axes, summary, group order, overlays, statistics, annotations, options"
            notes={[<>Axes</>, <>Statistics</>, <>Annotations</>]}
          />
          <OptionTable
            title="A panel's sections"
            rows={[
              { name: "Axes", what: "For x and y: label, unit, minimum and maximum, tick format (auto · plain · percent · scientific · thousands) and log scale." },
              { name: "Summary", what: "For bars and lines: the statistic (mean · median · sum · count) and the error bars (none · SD · SEM · 95% CI · from a column)." },
              { name: "Group order", what: "As in the data · alphabetical · by value, rising or falling · your own order (move groups up and down)." },
              { name: "Overlays", what: "Individual points · mean marker · median marker · regression line · n under each group, with their opacity." },
              {
                name: "Statistics",
                what: "The test: automatic (Welch) · Student's t · Welch's t · Mann–Whitney U · Wilcoxon (paired) · one-way ANOVA · Kruskal–Wallis · Pearson r · Spearman ρ · log-rank. Which comparisons: all pairs · each against the first · against a reference group · pairs you choose. How p shows: stars · p · both. Computed on your device; the first test loads a 14 MB statistics library, once.",
              },
              { name: "Annotations", what: "Text, an arrow, a horizontal or vertical line, a horizontal or vertical band, placed by value." },
              { name: "Panel options", what: "Legend on or off; for survival plots a numbers-at-risk table and censoring ticks; how many grid columns the panel spans." },
            ]}
          />
          <Shot
            name="figures-preview"
            alt="The figure and the export tray"
            notes={[
              <>
                <strong>Your figure</strong>: redrawn on every change. If a change can&apos;t be drawn, the last good one stays with the reason under it.
              </>,
              <>Drawn on this device; previews and exports make no request.</>,
              <>
                <strong>Formats</strong>: PNG, TIFF, SVG, PDF; tick any.
              </>,
              <>
                <strong>Resolution</strong>: 300 or 600 dpi for PNG and TIFF.
              </>,
              <>
                <strong>Export</strong>: download links for each format, at the journal width.
              </>,
              <>
                <strong>Add to a paper</strong>: puts the figure into a LaTeX project&apos;s figures folder and gives you the LaTeX to place it. (A Word
                document takes figures from its own Figures window.)
              </>,
            ]}
          />
          <DocPart title="Recipes">
            <p>
              <strong>Save recipe</strong> keeps the figure&apos;s settings (never its data) as a small file; <strong>Load recipe</strong> redraws it
              later, or on updated numbers. A recipe with a custom tweak shows you the code again before it runs.
            </p>
          </DocPart>
        </DocSection>

        {/* ---------------------------------------------------------------- */}
        <DocSection
          id="write"
          title="Write your paper"
          tint={TINT.write}
          icon={icon(PenLine)}
          art={<WriteArt />}
          lead="LaTeX or Word, in your browser and your journal's template, with every other tool a window away."
        >
          <Shot
            name="write-list"
            alt="The project list and the templates to start from"
            notes={[
              <>
                <strong>A project</strong>: opens it full screen.
              </>,
              <>
                <strong>Download backup</strong>: the whole project as a zip.
              </>,
              <>
                <strong>A template that compiles here</strong>: Plain article, Elsevier (elsarticle), IEEE Transactions (IEEEtran), ACM (acmart).
              </>,
              <>Another one.</>,
              <>
                <strong>Other publishers</strong>: they share templates only on their own sites: download the zip there, then import it.
              </>,
              <>
                <strong>Import a .zip, .tex or Word file</strong>: a publisher&apos;s template, an Overleaf download, a MargaLink backup, a single .tex file
                (it becomes main.tex; add its figures and .bib after), or a Word document or template (it opens in the Word editor, below).
              </>,
            ]}
            caption="Coming from a journal's page or a match result, the matching template is suggested and pressed in."
          />
          <Aside title="Where your projects live">
            <p>
              In this browser&apos;s own storage, on this device, never on a server. Clearing the browser&apos;s site data deletes them, so download a
              backup before you do, or to move to another computer (import the zip there).
            </p>
          </Aside>
          <Shot
            name="write-workspace"
            alt="The workspace: the tray, files, the formatting bar, the source, the PDF sheet and the status line"
            notes={[
              <>
                <strong>All projects</strong>
              </>,
              <>
                <strong>The project&apos;s name</strong>: click to rename.
              </>,
              <>
                <strong>Target journal</strong>: the journal you&apos;re writing for; opens the Journal window.
              </>,
              <>
                <strong>Tools</strong>: Match, Review, Figures, Checks, each in a window over your paper.
              </>,
              <>
                <strong>View</strong>: the files panel on or off; the source only, both side by side, or the PDF only.
              </>,
              <>
                <strong>Compile</strong>: <Keys>⌘+S</Keys> in the editor does the same.
              </>,
              <>
                <strong>Commands</strong>: <Keys>⌘+K</Keys>: every action, searchable.
              </>,
              <>
                <strong>Files and Outline</strong>
              </>,
              <>
                <strong>The formatting bar</strong>
              </>,
              <>
                <strong>The source</strong>: drag the handle between it and the PDF to resize.
              </>,
              <>
                <strong>The PDF</strong>: here after the first compile; this card shows once, on a new project.
              </>,
              <>
                <strong>The status line</strong>
              </>,
            ]}
          />
          <DocPart title="The source">
            <p>
              The bar over the source writes the LaTeX for you. Each button wraps what you&apos;ve selected, or inserts a placeholder and selects it so you
              can type over it.
            </p>
          </DocPart>
          <Shot
            name="write-formatbar"
            alt="The formatting bar with the citation list open"
            notes={[
              <>
                <strong>Bold</strong> (<Keys>⌘+B</Keys>), italic (<Keys>⌘+I</Keys>)
              </>,
              <>
                <strong>Section heading</strong>: section, subsection, subsubsection, paragraph
              </>,
              <>
                <strong>Lists</strong>: bulleted, numbered
              </>,
              <>
                <strong>Maths</strong>: inline, a numbered equation; and a footnote
              </>,
              <>
                <strong>Cite</strong>: your .bib files&apos; entries, with titles
              </>,
              <>Filter them; Enter picks the first</>,
              <>
                <strong>Ref</strong>: your \label{"{…}"}s
              </>,
              <>
                <strong>Figure</strong>: the images in figures/, or open the Figures window
              </>,
              <>
                <strong>Table</strong>: hover a grid to size it
              </>,
              <>
                <strong>Comment</strong> the selected lines on or off (<Keys>⌘+/</Keys>)
              </>,
            ]}
          />
          <Shot
            name="write-suggest"
            alt="Typing \cite{ shows the project's references"
            notes={[<>Typing \cite{"{"}…</>, <>…suggests your references, with their titles.</>]}
            caption={
              <>
                The same inside \ref{"{"}, \eqref{"{"} and the like (your labels), after \begin{"{"} (environments; the matching \end is written for
                you), and after a backslash (common commands; <Keys>Tab</Keys> moves through their fields). <Keys>Ctrl+Space</Keys> shows suggestions
                any time.
              </>
            }
          />
          <div className="grid gap-8 md:grid-cols-2">
            <Shot
              name="write-outline"
              alt="The Outline tab"
              notes={[<>Outline: your headings, following \input files.</>, <>Click one to jump to it.</>, <>Where the project is kept, and a backup.</>]}
            />
            <Shot
              name="write-files"
              alt="Naming a new file in place"
              notes={[<>New file: named in place; a path makes a folder.</>, <>Upload files, or drop them on the list; images go to figures/.</>, <>Download backup.</>]}
              caption="The pencil renames a file; the bin asks on the row before deleting. ★ marks the main file."
            />
          </div>
          <DocPart title="Compiling">
            <p>
              <strong>Compile</strong> runs TeX Live in your browser. The first compile downloads the engine and its packages (about 140 MB, more for some
              templates) and your browser keeps them, so later compiles take a second or two. Errors are listed under the source with their file and
              line (click one to go there) and marked in the gutter. A missing package is retried once with everything available.
            </p>
          </DocPart>
          <Shot
            name="write-status"
            alt="The status line"
            notes={[
              <>
                <strong>Compile status</strong>, and the errors and warnings count
              </>,
              <>
                <strong>Words</strong>: the whole paper (the main file and what it \inputs), against your target journal&apos;s limit when it has one
              </>,
              <>
                <strong>Saved</strong>: every edit is saved in this browser within a second
              </>,
              <>
                <strong>Spelling</strong>: misspellings and grammar are underlined in your text, checked in this browser; hover one for its fixes,
                Add to dictionary or Ignore (F8 goes to the next). The words you add are listed here to take out again; choose the paper&apos;s
                English here, or turn it off
              </>,
              <>
                <strong>Engine</strong>: pdfLaTeX or XeLaTeX (for Unicode fonts)
              </>,
              <>
                <strong>Auto-compile</strong>: compiles 2 seconds after you stop typing; off by default
              </>,
              <>
                <strong>?</strong>: every keyboard shortcut
              </>,
            ]}
          />
          <DocPart title="The windows">
            <p>The other tools open over your paper and keep their results when closed: close one, keep writing, reopen it where you left off.</p>
          </DocPart>
          <OptionTable
            rows={[
              { name: "Match", what: "Ranks journals for the compiled PDF (or the Word document). Set as target journal makes one yours; AI review available opens Review for it." },
              {
                name: "Review",
                what: "The review above, on the compiled PDF (or the Word document), against your target journal when it's one of the verified ones. Each quoted passage has Jump to source, which finds it in your LaTeX, or selects it in your Word document.",
                away: true,
              },
              {
                name: "Figures",
                what: "The whole figure studio. Insert into paper saves the figure (PDF) and its recipe in figures/ and places it at the cursor; opening the recipe later offers Edit in the figure studio. In a Word document, the figure goes in at the cursor as a picture, at the size it was drawn.",
              },
              { name: "Checks", what: "The format check and your target journal's rules, on the compiled PDF (or the Word document), re-run whenever the draft changes." },
              { name: "Journal", what: "Your target journal: its details, its rules, its LaTeX template. Search to change it, or clear it." },
            ]}
          />
          <div className="grid gap-8 md:grid-cols-2">
            <Shot name="write-window" alt="The Journal window over the workspace" notes={[<>Search journals</>, <>Choose one as your target</>, <>Close, or press Esc</>]} />
            <Shot name="write-palette" alt="The command palette" notes={[<>Type to find a command</>, <>Arrow keys and Enter run it</>]} caption="Views, auto-compile, backups, the engine, inserting: all of it is here." />
          </div>
          <Shot name="write-shortcuts" alt="The keyboard shortcuts window" caption="Everything on the keyboard, from the ? on the status line." />
          <DocPart id="word" title="Word documents">
            <p>
              Import a .docx (your own paper, or a journal&apos;s Word template; a .dotx opens as a new document) and it opens in a Word editor instead of
              LaTeX: the template&apos;s styles, headers, numbering and page setup stay as they are, and what you download is a Word document to submit. An
              old .doc, or a file with macros, is refused with what to do instead.
            </p>
          </DocPart>
          <Shot
            name="write-word"
            alt="A Word document open in the workspace"
            notes={[
              <>
                <strong>All projects</strong>
              </>,
              <>
                <strong>Tools</strong>: the same windows. Match, Review and Checks read the document as last saved.
              </>,
              <>
                <strong>Download .docx</strong>: the document, with your edits, to submit.
              </>,
              <>
                <strong>The editor&apos;s own bar</strong>: paragraph styles, bold, italic, underline, pictures, tables and symbols; the rest under ⋯.
              </>,
              <>
                <strong>The page</strong>, laid out as Word lays it out: click and type.
              </>,
              <>
                <strong>Saved</strong>: every edit is saved in this browser two seconds after you stop typing, and before any window opens.
              </>,
              <>
                <strong>Spelling</strong>: underlined in your text, checked in this browser. Click into a marked word for its fixes (Alt+Enter
                reaches them from the keyboard); the paper&apos;s English is chosen here.
              </>,
            ]}
            caption="Tracked changes and comments already in the document are shown and kept; there is no suggesting mode here."
          />
          <OptionTable
            rows={[
              { name: "Kept as they were", what: "Styles, numbering, the theme and fonts, headers and footers, citation-manager fields (Zotero, Mendeley and the like), cross-references, tables of contents, footnotes, comments, tracked changes, equations and content controls." },
              { name: "Not yet", what: "Templates for Word in the Journal window (those are LaTeX only), and starting a blank Word document: import one." },
              {
                name: "Known rough edges",
                what: "A two-column page that also holds a floating box (a frame or a wrapped picture) can show its words overlapping: only the display, the document is fine. Equations from Word's old equation editor show as a blank picture box and are kept. A comment attached across table cells can lose its place.",
              },
            ]}
          />
          <DocPart id="rewrite" title="Rewrite">
            <p>
              Select a passage, then choose <strong>Rewrite</strong> in the formatting bar (LaTeX), or in the editor&apos;s own bar or right-click menu
              (Word); Commands has it too. The menu shows the selection&apos;s price before you pick a tool. The first time in a paper, a notice says
              what&apos;s sent: tick its box and <strong>Turn on for this paper</strong>. The rewrite comes back as a word diff, removed words struck
              through and added ones underlined, in the paper&apos;s English.
            </p>
          </DocPart>
          <Shot
            name="write-rewrite"
            alt="The Rewrite menu over a selected sentence"
            notes={[
              <>
                <strong>The price</strong> of the selection, before anything is sent: 1 M coin per 500 words.
              </>,
              <>
                <strong>Paraphrase</strong>, and the tools below it.
              </>,
              <>
                <strong>Change tone</strong>: academic, concise, confident or plain.
              </>,
              <>
                <strong>Clarity and flow</strong>: a clearer version, with up to 3 notes.
              </>,
            ]}
          />
          <OptionTable
            rows={[
              { name: "Paraphrase", what: "The same meaning in different words, at about the same length." },
              { name: "Change tone", what: "Academic, concise, confident or plain." },
              { name: "Shorten", what: "About two thirds of the words, asked to keep every claim and number." },
              { name: "Expand", what: "Develops what's already there, making the reasoning explicit. It's asked to add no facts, and a rewrite with a new number or citation is refused." },
              { name: "Clarity and flow", what: "A clearer version, with up to 3 notes on the main changes or what still needs work." },
              {
                name: "Replace · Try again · Discard",
                what: "Replace puts the rewrite in as one undo step. Try again asks for another and costs the same again. If the text changed while you waited, the rewrite isn't put in: copy it and place it yourself.",
              },
            ]}
          />
          <Aside tone="away" title="What Rewrite sends">
            <p>
              Only the passage you select, the tool, and the paper&apos;s English, to Anthropic&apos;s Claude API, through our server, which keeps none of
              it. Citations, references, labels, equations, drawings and pictures stay here, and so do LaTeX comments and a Word document&apos;s
              footnote marks: Claude sees a numbered marker in
              their place. It costs 1 M coin per 500 words selected (at least 1, up to 2,000 words at a time, 1,000 to expand); a rewrite that fails, or that our checks
              refuse, is refunded at once. It&apos;s turned on once per paper, in this browser (never in a backup), and turned off with Commands
              (<Keys>⌘+K</Keys>), &ldquo;Turn off Rewrite for this paper&rdquo;. Rewrites are generated by AI and can shift your meaning: read each one before you
              replace your text, and disclose AI assistance where your journal asks.
            </p>
          </Aside>
        </DocSection>

        {/* ---------------------------------------------------------------- */}
        <DocSection
          id="coins"
          title="Accounts and M coins"
          tint={TINT.coins}
          icon={icon(Coins)}
          lead={
            <>
              Only the AI review, Ask Claude and Rewrite need an account, because each run costs money. They&apos;re paid in M coins; everything else stays
              free, with no account.{BETA.on && " While the closed beta runs, every tool needs an invited account."}
            </>
          }
        >
          <DocPart title="Signing in">
            <p>
              From the tray&apos;s <strong>Sign in</strong>, from a review or figure button, or from the sign-in page. Google opens in a small window
              {BETA.on ? "" : " and an email link opens in a new tab"}, so a paper you&apos;ve loaded stays exactly where it is; the page notices
              you&apos;ve signed in when you come back to it. A new account starts with {WELCOME_COINS} M coins.
              {BETA.on && " During the beta, only invited addresses can sign in, with Google; the invitation's address is the one to use."}
            </p>
          </DocPart>
          <Shot
            name="coins-signin"
            narrow
            alt={BETA.on ? "Signing in during the beta: who it's open to, and Continue with Google" : "Signing in: Continue with Google, or an emailed link"}
            notes={[
              ...(BETA.on
                ? [
                    <>
                      <strong>Open to invited beta testers</strong>: anyone else is told MargaLink is coming soon, and nothing about them is stored.
                    </>,
                  ]
                : []),
              <>
                <strong>Continue with Google</strong>, once you&apos;ve ticked the two boxes above it (you&apos;re 18 or older; you agree to the terms
                and have read the privacy notice): shares your verified email address and Google&apos;s id for your account, nothing else.
              </>,
              ...(BETA.on
                ? []
                : [
                    <>
                      <strong>Your email address</strong>, for a one-time link instead. It works once, within 15 minutes.
                    </>,
                    <>
                      <strong>Send the link</strong>. Opening it asks you to confirm before signing in, so an email scanner can&apos;t use it up.
                    </>,
                  ]),
              <>
                <strong>What an account stores</strong>: the list, on the privacy page.
              </>,
            ]}
          />
          <DocPart title="What things cost">
            <p>
              A review&apos;s price depends on its depth and on how much text it sends, counting only the sections it actually reviews. You see it on
              the button and in the notice, before anything is sent. A rewrite costs 1 M coin per 500 words you select, shown on the Rewrite menu;
              Try again costs the same again.
            </p>
          </DocPart>
          <Shot
            name="coins-costs"
            alt="The price table: review depth against length, then Ask Claude at 1 M coin and Rewrite at 1 M coin per 500 words"
            notes={[
              <>
                <strong>Depth</strong>: quick, standard or thorough, as chosen on the review page.
              </>,
              <>
                <strong>Length</strong>: the characters sent, in steps of 50,000.
              </>,
              <>Sections you mark &ldquo;Don&apos;t send&rdquo; don&apos;t count; every other section is sent, at every depth. Resuming or retrying is free.</>,
              <>
                <strong>Ask Claude</strong>: 1 M coin a request.
              </>,
              <>
                <strong>Rewrite</strong>: 1 M coin per 500 words you select.
              </>,
            ]}
          />
          <Aside title="Coins come back on their own">
            <p>
              A review&apos;s price is shared among its parts: its sections, by length, and the reporting checklist and the final report; any part that doesn&apos;t come back is
              refunded about two hours after the review started. An Ask Claude request or a rewrite that fails is refunded at once. Your history on the account
              page shows each refund.
            </p>
          </Aside>
          <DocPart title="Buying coins">
            <p>
              Packs never expire. Paddle, our merchant of record, runs the checkout over the page, takes the payment and sends the receipt; we never
              see your card. The coins arrive a few seconds after you pay.
            </p>
          </DocPart>
          <Shot
            name="coins-packs"
            alt="The three coin packs, each with its price and a Buy button"
            notes={[<>How many M coins.</>, <>The price, with the Indian price beneath; checkout shows the final amount in your currency.</>, <>Opens the checkout.</>]}
          />
          <Shot
            name="coins-pro"
            alt="Pro: 100 M coins a month, monthly or yearly"
            notes={[
              <>
                <strong>Pro</strong> adds 100 M coins every month. Unspent Pro coins carry over, up to 100.
              </>,
              <>Monthly.</>,
              <>Yearly, two months free: the coins still arrive month by month.</>,
            ]}
          />
          <DocPart title="Your account">
            <p>
              Click your balance in the tray. You can see every coin in and out, sign out here or on every browser, manage Pro in Paddle&apos;s
              portal, download everything we hold about you, and delete your account, which also cancels Pro.
            </p>
          </DocPart>
          <Shot
            name="coins-account"
            narrow
            alt="The account page: the balance and the coin history"
            notes={[<>Your balance.</>, <>Each charge, with its date.</>, <>A refund, made automatically.</>, <>More coins.</>]}
          />
        </DocSection>

        <DocSection id="help" title="When something's off" tint={TINT.start} icon={icon(LifeBuoy)}>
          <div className="grid gap-4 md:grid-cols-2">
            {[
              ["The first compile is slow", "It downloads TeX once (about 140 MB). Later compiles reuse it and take a second or two."],
              ["\"Missing package\"", "The compile is retried with every package available. If it still fails, the package isn't in this TeX Live; the error names it."],
              ["A tool window says \"Compile first\"", "Match, Review and Checks read the PDF you compiled. Compile once, and they'll read the latest one."],
              ["\"Couldn't find that passage in the source\"", "Jump to source searches your LaTeX (or Word document) for words the reviewer quoted; heavy markup or maths can hide them. The quote is still right."],
              ["My review stopped", "Resume review picks up where it stopped. A section that failed can be retried alone; it doesn't use another review."],
              ["A match looks wrong", "Check What we read. If the title or abstract wasn't found, paste them and match again."],
              ["Moving to another computer", "Download backup on the project, then Import a .zip, .tex or Word file on the other computer."],
              ["Where's my project?", "In this browser, on this device. Another browser or a private window doesn't see it."],
            ].map(([q, a]) => (
              <div key={q} className="clay p-5">
                <p className="font-serif text-lg font-medium">{q}</p>
                <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">{a}</p>
              </div>
            ))}
          </div>
          <DocPart id="reset" title="Clearing what this site keeps in your browser">
            <p>
              Your projects, settings, cached downloads and whether you&apos;ve seen the introduction live in this browser. This clears all of it;
              signing out is separate, on your account page.
            </p>
            <ResetSiteData />
          </DocPart>
          <p className="text-sm text-ink-soft">
            Still stuck? The{" "}
            <Link href="/privacy" className="text-accent hover:underline">
              privacy page
            </Link>{" "}
            has the details of what runs where; the{" "}
            <Link href="/architecture" className="text-accent hover:underline">
              architecture tour
            </Link>{" "}
            explains how each tool works inside.
          </p>
        </DocSection>
      </DocBody>
    </main>
  );
}
