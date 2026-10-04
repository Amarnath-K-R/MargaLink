// Runnable check for matchQuery.ts. Run directly: node src/lib/match/matchQuery.selfcheck.ts
import assert from "node:assert/strict";
import { buildQuery, queryFromPasted, stripAffiliations } from "./matchQuery.ts";

const ABSTRACT =
  "Heart failure is a leading cause of hospital readmission worldwide, yet readmission rates have rarely been compared across health systems. We pooled data from forty cohorts across six continents and estimated thirty-day and one-year readmission rates after a first heart failure hospitalisation, adjusting for age, sex and comorbidity. Rates varied fourfold between regions.";

// 1. A real-looking title page: banner, title, authors, affiliations, email, abstract, keywords, body, references
const PAPER = `ORIGINAL RESEARCH ARTICLE
Global comparison of readmission rates for patients with heart failure
Amir Foroutan1, Jane Doe2*, Ravi Kumar1,3
1 Department of Cardiology, University of Somewhere, City, Country
2 School of Public Health, Some Institute, City
*Correspondence: jane.doe@example.org
Abstract
${ABSTRACT}
Keywords: heart failure; readmission; health systems
1. Introduction
Heart failure affects millions of people.
References
1. Smith J. Outcomes after discharge. N Engl J Med. 2019;380:1–2.
2. Lee K. Trends. Lancet 2020;395:10–12.
3. Roe B. Readmission. BMJ 2018;360:k1.`;
{
  const q = buildQuery({ fullText: PAPER });
  assert.equal(q.title, "Global comparison of readmission rates for patients with heart failure", "the banner and authors are skipped");
  assert.equal(q.source, "abstract");
  assert.ok(q.abstract?.startsWith("Heart failure is a leading cause"), String(q.abstract));
  assert.deepEqual(q.keywords, ["heart failure", "readmission", "health systems"]);
  assert.ok(q.queryText.startsWith(q.title) && q.queryText.includes("Rates varied fourfold"));
  assert.ok(!/University|@|Correspondence/.test(q.queryText), "no affiliations in the query");
  assert.ok(!("references" in q) && !q.queryText.includes("N Engl J Med"), "the reference list is never read");
}

// 2. No abstract heading (a preprint's first page): fall back, but never embed contact lines
{
  const noAbstract = `A study of sediment transport in braided rivers
Kim Lee1, Ana Silva2
1 Department of Geography, University of Nowhere
kim.lee@example.edu
We measured bedload in three braided rivers over two flood seasons and compared the fluxes with
predictions from standard transport formulae, finding systematic overprediction at low flows.`;
  const q = buildQuery({ fullText: noAbstract });
  assert.equal(q.source, "fallback");
  assert.equal(q.abstract, null);
  assert.ok(q.queryText.includes("bedload"), q.queryText);
  assert.ok(q.queryText.split("\n").every((l) => !/@|University/.test(l)), "fallback strips affiliation and email lines");
}

// 3. Pasted text
{
  const p = queryFromPasted(`My title here\n${ABSTRACT}`);
  assert.equal(p.title, "My title here");
  assert.ok(p.abstract?.startsWith("Heart failure"));
  assert.equal(p.source, "pasted");
  const one = queryFromPasted("  just one paragraph of abstract text  ");
  assert.equal(one.title, "");
  assert.equal(one.queryText, "just one paragraph of abstract text");
}

assert.equal(stripAffiliations("Title line\n1,2,*\nx@y.z\nKeep this"), "Title line\nKeep this");

// 8. a title with an institution word in it is still the title, and the author line never is
const HOSPITAL = `In-hospital mortality and readmission among patients with heart failure
Amir Foroutan1, Jane Doe2*, Ravi Kumar1,3
1 Department of Cardiology, University of Somewhere, City, Country
Abstract
${ABSTRACT}
`;
assert.equal(buildQuery({ fullText: HOSPITAL }).title, "In-hospital mortality and readmission among patients with heart failure");
// 9. no "Abstract" heading (a DOCX, one line per paragraph): the opening paragraph stays, even though it mentions a hospital
const OPENING = "We followed 2,140 patients admitted to hospital with acute heart failure across 12 centres and recorded every readmission within one year, along with the institutional factors that predicted it. Readmission was common and varied threefold between centres.";
const NOHEAD = `Readmission after acute heart failure in twelve centres
Amir Foroutan1, Jane Doe2*
1 Department of Cardiology, University of Somewhere, City, Country
*Correspondence: jane.doe@example.org
${OPENING}
Introduction
`;
const fb = buildQuery({ fullText: NOHEAD });
assert.equal(fb.source, "fallback");
assert.ok(fb.queryText.includes("admitted to hospital"), fb.queryText);
assert.ok(!fb.queryText.includes("Department of Cardiology") && !fb.queryText.includes("Foroutan") && !fb.queryText.includes("@"), fb.queryText);

// 10. A title broken after its colon, the subtitle on the next line (a real review's title page), with or without Word's blank lines
for (const gap of ["\n", "\n\n"]) {
  assert.equal(
    buildQuery({ fullText: `Listening Between Appointments:${gap}Wearable Technology from Sensor Validation to Clinical Intelligence${gap}Abstract${gap}${ABSTRACT}` }).title,
    "Listening Between Appointments: Wearable Technology from Sensor Validation to Clinical Intelligence",
  );
}

console.log("matchQuery.selfcheck: OK");
