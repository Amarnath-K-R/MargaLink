// Runnable check for rewrite.ts: what a Rewrite request may carry (exact
// keys, limits, the price the browser showed), how its words are counted,
// and every rule an answer must pass before anyone sees it.
//   node src/lib/writing/rewrite.selfcheck.ts
import assert from "node:assert/strict";
import { checkRewrite, parseRewriteRequest, rewriteWords, type RewriteRequest } from "./rewrite.ts";
import { rewritePrice } from "../accounts/coins.ts";

const P = (n: number) => `⟦${n}⟧`;
const req = (passage: string, more: Partial<RewriteRequest> = {}) => ({
  tool: "paraphrase",
  tone: null,
  format: "text",
  dialect: "us",
  passage,
  coins: rewritePrice(rewriteWords(passage)),
  ...more,
});
const ok = (body: unknown) => {
  const r = parseRewriteRequest(body);
  assert.ok(typeof r !== "string", `accepted: ${r}`);
  return r as RewriteRequest;
};
const refused = (body: unknown, why: string) => assert.equal(typeof parseRewriteRequest(body), "string", why);

// --- words: placeholders and LaTeX commands aren't words
assert.equal(rewriteWords(`We used \\emph{actigraphy} ${P(1)} in 2019.`), 5);
assert.equal(rewriteWords("Sleep, it's well-known, helps."), 4);
assert.equal(rewriteWords(`${P(1)} ${P(2)}`), 0);

// --- the request
const base = ok(req(`Sleep was shorter ${P(1)} after surgery.\n\nIt recovered ${P(2)} by day 90.`));
assert.equal(base.tool, "paraphrase");
ok(req("Make this sound surer.", { tool: "tone", tone: "confident" }));
ok(req("A \\textbf{bold} claim.", { format: "latex", dialect: "gb" }));
refused({ ...req("Text."), extra: 1 }, "an extra key");
const noCoins: Record<string, unknown> = req("Text.");
delete noCoins.coins;
refused(noCoins, "a missing key");
refused(req("Text.", { tool: "translate" as never }), "an unknown tool");
refused(req("Text.", { tone: "academic" as never }), "a tone for a tool without one");
refused(req("Text.", { tool: "tone" }), "Change tone needs a tone");
refused(req("Text.", { tool: "tone", tone: "angry" as never }), "an unknown tone");
refused(req("Text.", { format: "html" as never }), "an unknown format");
refused(req("Text.", { dialect: "off" as never }), "an unknown English");
refused(req(""), "nothing selected");
refused(req(`${P(1)}\n\n${P(2)}`), "only objects selected: nothing to rewrite");
refused(req(`A ${"x".repeat(20_000)}.`), "over 20,000 characters");
refused(req(Array.from({ length: 61 }, (_, i) => `Paragraph ${i}.`).join("\n\n")), "over 60 paragraphs");
refused(req("word ".repeat(2001)), "over 2,000 words");
ok(req(`${"word ".repeat(1990)}${"\\emph{} ".repeat(50)}`, { format: "latex" })); // commands aren't counted
refused(req(`First ${P(2)} then ${P(1)}.`), "placeholders out of order");
refused(req(`First ${P(1)} and ${P(1)}.`), "a placeholder twice");
refused(req(`A stray ⟦ bracket.`), "a stray bracket");
refused(req(Array.from({ length: 301 }, (_, i) => `w${P(i + 1)}`).join(" ")), "over 300 placeholders");
refused({ ...req("Text."), coins: 2 }, "a price that isn't the price");
refused({ ...req("Text."), coins: "1" }, "a price that isn't a number");
refused(null, "not an object");
refused([], "an array");

// --- the answer
const checked = (r: RewriteRequest, text: unknown, notes: unknown = []) => checkRewrite(r, { text, notes });
const good = (r: RewriteRequest, text: string, notes: string[] = []) => {
  const out = checked(r, text, notes);
  assert.ok(typeof out !== "string", `passes: ${out}`);
  return out as { text: string; notes: string[] };
};
const bad = (r: RewriteRequest, text: unknown, why: string, notes: unknown = []) => {
  const out = checked(r, text, notes);
  assert.equal(typeof out, "string", why);
  assert.ok(!(out as string).includes("—"), "the problem is said without an em dash");
};

good(base, `Sleep was briefer ${P(1)} following surgery.\n\nIt came back ${P(2)} by day 90.`);
bad(base, 42, "text that isn't text");
bad(base, "  ", "nothing");
bad(base, base.passage, "unchanged");
bad(base, `Sleep was briefer following surgery.\n\nIt came back ${P(2)} by day 90.`, "a placeholder lost");
bad(base, `Sleep was briefer ${P(2)} following surgery.\n\nIt came back ${P(1)} by day 90.`, "placeholders reordered");
bad(base, `Sleep was briefer ${P(1)} ${P(1)} following surgery.\n\nIt came back ${P(2)} by day 90.`, "a placeholder twice");
bad(base, `Sleep was briefer ${P(1)} following surgery.\n\nIt came back ${P(2)} by day 90 ${P(3)}.`, "a placeholder made up");
bad(base, `Sleep was briefer ${P(1)} following ⟧ surgery.\n\nIt came back ${P(2)} by day 90.`, "a stray bracket");
bad(base, `Sleep was briefer ${P(1)} following surgery. It came back ${P(2)} by day 90.`, "paragraphs joined");
bad(base, `Sleep was briefer ${P(1)}.\n\nFollowing surgery.\n\nIt came back ${P(2)} by day 90.`, "a paragraph added");

// gaps between objects: empty stays empty, words stay words
const cites = ok(req(`Shown before ${P(1)}${P(2)} in adults.`));
good(cites, `Reported earlier ${P(1)}${P(2)} in adults.`);
bad(cites, `Reported earlier ${P(1)} and ${P(2)} in adults.`, "words put between two objects that touched");
bad(ok(req(`Before ${P(1)} between ${P(2)} after.`)), `Prior ${P(1)} ${P(2)} later.`, "the words between two objects removed");

// numbers: none made up, none repeated more often than in the passage
const nums = ok(req("Of 412 adults, 31 of 118 were readmitted within 30 days."));
good(nums, "31 of 118 were readmitted within 30 days, among 412 adults.");
good(nums, "Of 412 adults, 31 of 118 returned to hospital within a month."); // dropping one is allowed
bad(nums, "Of 412 adults, 31 of 118 (26%) were readmitted within 30 days.", "a new number");
bad(nums, "Of 412 adults, 31 of 118 were readmitted within 30 days, 30 days after surgery.", "a number repeated");
bad(nums, "Of 412.5 adults, 31 of 118 were readmitted within 30 days.", "a number changed");

// LaTeX: commands, braces, $ and % as they were
const tex = ok(req("We saw a \\textbf{large} effect, 5\\% of cases, and \\emph{fewer} wakings.", { format: "latex" }));
good(tex, "We observed a \\textbf{large} effect in 5\\% of cases, and \\emph{fewer} wakings.");
bad(tex, "We observed a large effect in 5\\% of cases, and \\emph{fewer} wakings.", "a command dropped");
bad(tex, "We observed a \\textbf{large} effect in 5\\% of cases, and \\emph{fewer} \\textit{wakings}.", "a command added");
bad(tex, "We observed a \\textbf{large effect in 5\\% of cases, and \\emph{fewer} wakings.", "braces unbalanced");
bad(tex, "We observed a \\textbf{large} effect in 5\\% of cases, and \\emph{fewer} wakings {}.", "braces added");
bad(tex, "We observed a \\textbf{large} effect in 5\\% of cases, and \\emph{fewer} wakings $.", "a dollar sign added");
bad(tex, "We observed a \\textbf{large} effect in 5\\% of cases % a comment\n, and \\emph{fewer} wakings.", "a percent sign added");

// Shorten is shorter, Expand longer but not without end; every tool within 2.5 times + 20 words
const ten = "Sleep after cardiac surgery was short and broken for many weeks.";
good(ok(req(ten, { tool: "shorten" })), "Sleep after cardiac surgery stayed short for weeks.");
bad(ok(req(ten, { tool: "shorten" })), "Sleep after cardiac surgery was short and broken for many, many long weeks.", "Shorten made it longer");
good(ok(req(ten, { tool: "expand" })), `${ten} Patients woke often, and their nights stayed fragmented for weeks.`);
bad(ok(req(ten, { tool: "expand" })), "Sleep after surgery was short.", "Expand made it shorter");
bad(ok(req(ten, { tool: "expand" })), `${ten} ${"More words here. ".repeat(15)}`, "Expand ran on");
bad(base, `${base.passage.replace("shorter", "briefer")} ${"Words. ".repeat(60)}`.replace("\n\n", " filler.\n\n"), "a paraphrase ran on");

// notes: Clarity only, at most 3, each short; written as the site writes
const clarity = ok(req(ten, { tool: "clarity" }));
const withNotes = good(clarity, "After cardiac surgery, sleep stayed short and broken for weeks.", ["Moved the setting first.", "Cut “many” — it was vague."]);
assert.deepEqual(withNotes.notes, ["Moved the setting first.", "Cut “many”, it was vague."]);
bad(clarity, "After cardiac surgery, sleep stayed short and broken for weeks.", "four notes", ["a", "b", "c", "d"]);
bad(clarity, "After cardiac surgery, sleep stayed short and broken for weeks.", "a long note", ["x".repeat(241)]);
bad(clarity, "After cardiac surgery, sleep stayed short and broken for weeks.", "notes that aren't text", [1]);
bad(base, `Sleep was briefer ${P(1)} following surgery.\n\nIt came back ${P(2)} by day 90.`, "notes from a tool without them", ["Changed words."]);

// Word text: a line break inside a paragraph is a space (Word's own breaks travel as placeholders)
assert.equal(good(base, `Sleep was briefer ${P(1)}\nfollowing surgery.\n\nIt came back ${P(2)} by day 90.`).text, `Sleep was briefer ${P(1)} following surgery.\n\nIt came back ${P(2)} by day 90.`);
// ... while LaTeX keeps its lines
assert.equal(good(tex, "We observed a \\textbf{large} effect\nin 5\\% of cases, and \\emph{fewer} wakings.").text, "We observed a \\textbf{large} effect\nin 5\\% of cases, and \\emph{fewer} wakings.");

console.log("rewrite.selfcheck: OK");
