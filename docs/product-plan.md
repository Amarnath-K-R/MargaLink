# Privacy First Journal Finder, Project Plan

Prepared on 18 September 2026. Scope: all research fields. Builder: one person, using Claude Code, about 10 or more hours per week.

> **Status, added later:** this is the plan written *before* implementation
> started, kept as-written on purpose — code comments and commit messages
> reference its section numbers (`plan §6.2`, `§13`, etc.), so renumbering
> it would silently break those references. The product, market, roadmap,
> income, and risk sections (§1, §2, §4.1–4.3, §5, §6, §7, §9–13) still
> describe the real product accurately. Only the *architecture* went
> stale as the system got built — three places are marked `> **Superseded:**`
> inline below. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for how
> the system actually works today.

## 1. Product in one paragraph

A researcher uploads a finished paper. The site suggests the best matching journals, with citation metrics, indexing status, fees and review speed. It then gives the formatting rules for the chosen journal, checks the paper against them, and offers an optional review of the paper before submission. The paper text stays on the user's device wherever that is technically possible.

## 2. What is possible, feature by feature

| Feature | Possible | Privacy level | How |
|---|---|---|---|
| Journal matching | Yes | Strong, text never leaves the browser | Browser reads the file and creates an embedding, only the embedding is sent |
| Metrics and indexing | Yes, with one limit | No user data involved | Open data sources, see section 4 |
| Formatting instructions | Yes | No user data involved | Public author guidelines, prepared in advance |
| Format check of the paper | Yes | Strong, runs in the browser | Rule based checks, such as word counts and section names |
| Review of the paper | Yes | Medium, needs consent | Needs a large language model, see section 5 |

The limit on metrics: the official Journal Impact Factor is owned by Clarivate. It cannot be shown or resold without a paid licence. The plan uses open alternatives instead.

## 3. Privacy design

This is the main selling point, so it must be true, simple and easy to explain.

### 3.1 Three rules

1. The paper file is never uploaded for matching or format checks.
2. Nothing from a paper is stored on the server, not even for logged in users.
3. Any feature that sends text out of the browser is opt in, with a plain language notice first.

### 3.2 How matching works without seeing the paper

1. The user selects a Word or PDF file.
2. JavaScript in the browser extracts the text. Use mammoth.js for Word files and pdf.js for PDF files.
3. A small embedding model runs in the browser through transformers.js. It turns the title and abstract into a list of a few hundred numbers.
4. Only that list of numbers is sent to the server.
5. The server compares it with the stored journal embeddings and returns the ranked list.

> **Superseded:** steps 4–5 describe a server-side ranker. The built system
> has no server in this path at all — the browser downloads the full
> (public, non-personal) journal index once and ranks locally. See
> `docs/ARCHITECTURE.md`. This is a stricter reading of the same privacy
> goal this section describes, not a different one.

Notes:
* The same embedding model must be used for the journals and for the user's paper. Pick one small model that runs well in a browser, around 25 to 130 MB, and keep it fixed.
* An embedding cannot be turned back into the original text in any practical way. Be honest in the privacy page, say that it carries the general topic of the paper, but not the words.
* Give a fallback for weak phones, the user pastes only the title and abstract, and the embedding is computed on your server in memory, with no logging.

### 3.3 Other privacy measures

* No third party trackers on the upload and results pages. Use a cookie free analytics tool, such as Plausible or Umami.
* Server logs must not record request bodies.
* Accounts should need only an email address. Payment details stay with the payment provider.
* Publish a short privacy page that explains the above in plain words, with a diagram.
* Open source the browser side code. This lets careful users verify the claim, and it builds trust faster than any statement.

### 3.4 Legal points

* The Digital Personal Data Protection Act applies to account data, such as names, emails and payment records. Collect consent, state the purpose, and offer deletion. Please check the current DPDP Rules and their compliance dates before launch.
* If you later serve users in Europe, GDPR will also apply.
* Add clear terms of use. State that the tool gives suggestions only, and that the user is responsible for the final choice of journal.

## 4. Journal database

### 4.1 Sources

| Source | What it gives | Notes |
|---|---|---|
| OpenAlex | Journal list, subjects, recent papers and abstracts, two year mean citedness, h index, open access status | Data is CC0. The full snapshot is free to download. The API gives about 1 US dollar of free use per day with a free key |
| DOAJ | Open access status, article processing charges, licence, review process, time to publication | Open data, check attribution terms |
| Crossref | Publisher details, ISSN checks, publication volume | Free API |
| NLM Catalog | MEDLINE and PubMed indexing status | Free |
| Scopus source list | Scopus coverage, CiteScore | Free to download, but check the terms for commercial reuse |
| Scimago (SJR) | SJR score and quartile | Free to view, check the terms for commercial reuse |
| Web of Science Master Journal List | Web of Science coverage | Free to search, scraping is restricted, so link out instead |

Use the OpenAlex snapshot rather than the live API for the first build. It avoids daily limits and keeps the running cost near zero.

### 4.2 Metrics to show

* Two year mean citedness from OpenAlex. Describe it as "citations per paper over two years, similar in method to an impact factor". Do not call it Impact Factor.
* SJR quartile and CiteScore, only if their terms allow it. Otherwise link to the official page.
* Indexing badges: Scopus, MEDLINE, DOAJ, and a link for Web of Science.
* Fee in the original currency and in rupees.
* Typical time from submission to decision, where the journal reports it.

### 4.3 Trust signals, not a predatory list

Do not label any journal as predatory. That carries legal risk, and the old public lists are outdated. Show positive signals instead, such as DOAJ listing, major index coverage, COPE membership and a verifiable publisher. If a journal has none of these, show "not verified in major indexes", and let the user decide.

### 4.4 Building journal embeddings

1. Filter OpenAlex sources to active journals. Expect roughly 50,000 to 100,000.
2. For each journal, take the titles and abstracts of 100 to 200 recent papers. OpenAlex stores abstracts as an inverted index, so rebuild the text first.
3. Embed each paper with the chosen model, then average the vectors for the journal. Later, you can keep a few cluster centres per journal, which helps with broad journals.
4. Store the vectors in Postgres with the pgvector extension.

This is a one time batch job. It can run on your own computer over a few days. Refresh it every three to six months.

### 4.5 Scope advice

You chose all research fields. The matching engine handles that with no extra work. The extra work is in the details, such as formatting rules, which must be collected per journal. So build the database for all fields, but collect formatting rules for the top 2,000 to 3,000 journals first, and add more based on what users search for.

> **Superseded (numbers only):** the built index has 18,125 journals, not
> the 50,000–100,000 this section expected — OpenAlex's `is_core:true`
> filter (see `pipeline/fetch_sources.py`) is stricter than "all research
> fields" alone. The scope advice itself (all fields for matching,
> formatting rules for a smaller prioritized set) still holds.

## 5. Matching quality

With your statistics background, this part can become a real strength.

* **Test set:** take 5,000 recently published papers that were not used to build the journal vectors.
* **Measure:** how often the true journal appears in the top 5 and top 10 results. Also measure whether the top results are at least in the right field.
* **Improve:** combine the embedding score with simple signals, such as subject match and the journals cited in the paper's own reference list. The reference list signal is strong, and it can also be computed in the browser.
* **Publish the accuracy numbers on the site.** Competing tools rarely do this, and researchers respect it.

## 6. Formatting instructions and format check

### 6.1 Instructions

* For each journal, store the link to the official author guidelines, plus a structured summary. The summary holds article types, word limits, abstract format and length, reference style, figure and table limits, required statements and the cover letter rules.
* Create the summaries in advance with a language model, reading only the public guideline pages. No user data is involved. Spot check a sample by hand, and show the date of the last check.
* Always show the link to the official page, and say that the journal's own page is the final authority.

### 6.2 Format check, in the browser

Rule based checks, with no AI needed:
* Total word count and abstract word count against the limits.
* Presence of required sections, such as ethics statement, funding, conflicts of interest and data availability.
* Reference count and a basic test of the reference style.
* Number of figures and tables.
* Structured abstract headings, where required.

## 7. Paper review, the sensitive feature

A useful review needs a large language model, and these are too large to run in a browser. So the text must leave the device. There are three honest options.

| Option | Privacy | Cost | Comment |
|---|---|---|---|
| A. Commercial model API | By contract. Choose a provider whose API terms state no training on customer data, with short or zero retention | Pay per use, roughly a few rupees to ₹50 per paper, depending on model and length | Best quality, simplest to build. Recommended for the start |
| B. Open weights model on a rented GPU | Strong, the text stays on a server you control | High if always on. Lower with on demand GPU services | Consider this once there is paying demand |
| C. Checklist review without AI | Strong, runs in the browser | Near zero | Limited, but a good free tier |

Recommended path: launch with C as the free tier and A as the paid tier. State clearly which provider processes the text. Process in memory, store nothing, and show the result only in the user's session. Verify the provider's current data terms before launch, and link to them.

What the review should cover:
* Structure and clarity, section by section.
* Reporting checklist fit, such as CONSORT, STROBE, PRISMA, STARD and CARE, chosen by study type.
* Statistical reporting, such as missing confidence intervals, unclear tests, sample size justification and multiple comparison issues. This is your edge over general tools.
* Fit between the paper and the chosen journal's scope.
* Language and readability.

What it must not do:
* It must not predict the chance of acceptance.
* It must not be described as peer review. Call it a "before submission check".
* It must not rewrite the paper. Many journals ask authors to disclose AI use, so add a short note about that.

## 8. Technology

| Part | Choice | Reason |
|---|---|---|
| Website | Next.js with TypeScript | Works well with Claude Code, good for search engine traffic |
| Database | Postgres with pgvector, Supabase free tier to start | One store for journal data and vectors |
| Browser side processing | mammoth.js, pdf.js, transformers.js | Keeps the paper on the device |
| Data pipeline | Python scripts | One time batch jobs for OpenAlex, DOAJ and embeddings |
| Hosting | Vercel or Cloudflare Pages | Free tier is enough to start |
| Payments | Razorpay | UPI support, simple for Indian users |
| Analytics | Plausible or Umami | No cookies, fits the privacy claim |

> **Superseded:** no database of any kind — the "Database" row above never
> got built; the journal index is a static quantized file the browser
> downloads (see `docs/ARCHITECTURE.md`). Hosting is Cloudflare Pages
> specifically, not "Vercel or." Payments and analytics remain unbuilt, not
> superseded — still accurate as a plan for later.

Working with Claude Code:
* Keep a CLAUDE.md file in the project. Put the three privacy rules from section 3.1 in it, so every change respects them.
* Build one small piece at a time, and ask for tests with each piece.
* Add an automated test that fails if any network request from the upload page contains paper text.
* Keep the data pipeline and the website in separate folders.

## 9. Roadmap, about 14 weeks

**Weeks 1 to 3, data**
* Download the OpenAlex sources and recent works. Filter to active journals.
* Merge DOAJ, NLM and Crossref data by ISSN.
* Choose the embedding model after a small comparison test.
* Build journal vectors and load them into Postgres.

**Weeks 4 to 5, matching engine**
* Build the search endpoint, vector in, ranked journals out.
* Build the test set and measure top 5 and top 10 accuracy.
* Add the reference list signal and measure again.

**Weeks 6 to 8, website, first public version**
* Upload page with processing in the browser.
* Results page with filters for field, index, fee, open access and speed.
* One public page per journal, for search engine traffic.
* Privacy page with the diagram.
* Soft launch inside Amrita, collect feedback.

**Weeks 9 to 10, formatting**
* Collect guideline summaries for the top 2,000 to 3,000 journals.
* Build the format check in the browser.

**Weeks 11 to 12, review and payments**
* Free checklist review in the browser.
* Paid AI review with the consent screen.
* Razorpay integration and simple accounts.

**Weeks 13 to 14, launch**
* Fix issues from the soft launch.
* Public launch through research groups, LinkedIn, and university WhatsApp and Telegram groups.
* Write three or four helpful articles, such as "how to choose a journal", to bring search traffic.

## 10. Income model

Ads and privacy do not fit well together, because ad networks track users. So keep ads away from the tool itself.

* **Free:** matching, metrics, formatting instructions, checklist review, limited to a few papers per month.
* **Paid, ₹199 to ₹499 per paper or ₹999 per year:** AI review, full format check report, cover letter draft, unlimited matching, saved shortlists.
* **Institution plans:** a yearly licence for departments or universities. Amrita could be the first reference customer.
* **Ads:** only on the public journal pages, if at all, using a network with contextual ads that do not track users.
* **Referrals:** language editing and statistics services, clearly marked as partners.

A realistic early goal is 50 to 100 paying users in the first six months. Income grows mainly through word of mouth among PhD students and through institution plans.

## 11. Costs

| Item | Cost |
|---|---|
| Domain | About ₹800 to ₹1,200 per year |
| Hosting and database | Free tiers at first, then about ₹2,000 to ₹4,000 per month with growth |
| Claude Code subscription | Your existing plan |
| AI review | Pay per use, covered by the paid tier price |
| Mobile app, later and optional | Google Play 25 US dollars once, Apple 99 US dollars per year |

## 12. Risks

| Risk | Response |
|---|---|
| Free competitors exist, such as JANE and publisher tools | Compete on privacy, neutrality across publishers, published accuracy, and the full workflow from matching to review |
| Metric licence problems | Use OpenAlex metrics by default, link out for the rest |
| Wrong or outdated formatting rules | Show the last checked date and the official link, add a "report an error" button |
| Legal complaints from journals | Never use the word predatory, show only verifiable signals |
| Browser model too heavy for some phones | Paste abstract fallback, processed in memory on the server |
| Employment terms | Check Amrita's rules on outside work and intellectual property before launch |
| Review quality concerns | Present it as guidance, keep a human readable checklist behind every comment |

## 13. First three tasks for this week

1. Register the free OpenAlex key, and download the sources file from the snapshot.
2. Ask Claude Code to write a script that filters active journals and reports counts by field.
3. Test two or three small embedding models on 200 papers from your own field, and compare top 10 accuracy.
