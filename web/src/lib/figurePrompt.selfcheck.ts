// Runnable check for figurePrompt.ts. Run directly:
//   node src/lib/figurePrompt.selfcheck.ts
import assert from "node:assert/strict";
import { SYSTEM_PROMPT, buildFigurePrompt, extractPythonCode } from "./figurePrompt.ts";
import { CHART_TYPES, type FigurePayload } from "./figureSchema.ts";

// --- SYSTEM_PROMPT: the hard rules must actually be present ---
assert.ok(SYSTEM_PROMPT.includes("no seaborn"), "the system prompt must forbid seaborn");
assert.ok(SYSTEM_PROMPT.includes("untrusted"), "the system prompt must flag the style note as untrusted");
assert.ok(SYSTEM_PROMPT.includes("do not call plt.show()"), "the system prompt must forbid plt.show()/savefig()");

// --- buildFigurePrompt: every column, its dtype, the chart type, and the roles must appear ---
const PAYLOAD: FigurePayload = {
  columns: [
    { name: "group", dtype: "categorical" },
    { name: "response_mean", dtype: "numeric" },
  ],
  rowCount: 42,
  chartType: "bar-error",
  roles: { x: "group", y: "response_mean" },
  note: "use a muted palette",
};
const prompt = buildFigurePrompt(PAYLOAD);
assert.ok(prompt.includes("group"), "the prompt must mention every column name");
assert.ok(prompt.includes("response_mean"), "the prompt must mention every column name");
assert.ok(prompt.includes("categorical"), "the prompt must mention each column's dtype");
assert.ok(prompt.includes("numeric"), "the prompt must mention each column's dtype");
assert.ok(prompt.includes("bar-error"), "the prompt must mention the chart type");
assert.ok(prompt.includes("42"), "the prompt must mention the row count");
assert.ok(prompt.includes("x: group"), "the prompt must state the x role's column");
assert.ok(prompt.includes("y: response_mean"), "the prompt must state the y role's column");
assert.ok(prompt.includes("use a muted palette"), "a present note must appear in the prompt");
assert.ok(prompt.includes('"""'), "a present note must be delimited");

const noNote = buildFigurePrompt({ ...PAYLOAD, note: "" });
assert.ok(!noNote.includes("STYLE NOTE"), "an empty note should not add a style-note block at all");

const emptyRoles = buildFigurePrompt({ ...PAYLOAD, roles: {} });
assert.ok(emptyRoles.includes("(none specified)"), "no roles specified should say so plainly, not render an empty list");

for (const chartType of CHART_TYPES) {
  assert.ok(
    buildFigurePrompt({ ...PAYLOAD, chartType }).includes(chartType),
    `every chart type (${chartType}) should appear verbatim when selected`
  );
}

// --- extractPythonCode ---
assert.equal(
  extractPythonCode("```python\nprint('hi')\n```"),
  "print('hi')",
  "a python-tagged fenced block should extract cleanly"
);
assert.equal(extractPythonCode("```\nprint('hi')\n```"), "print('hi')", "a bare fenced block should extract cleanly");
assert.equal(extractPythonCode("print('hi')"), "print('hi')", "unfenced code should pass through trimmed");
assert.equal(
  extractPythonCode("Here's the code:\n```python\nprint('hi')\n```"),
  "print('hi')",
  "leading prose before a fenced block should be discarded"
);
assert.equal(extractPythonCode("  print('hi')  \n"), "print('hi')", "surrounding whitespace should be trimmed");

console.log("figurePrompt.selfcheck: OK");
