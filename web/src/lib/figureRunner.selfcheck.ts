// Runnable check for figureRunner.ts's isCodeSafeToRun() — the only pure,
// Node-testable piece of this file (warmUp/runFigureCode need a real
// browser Worker + Pyodide, covered by a manual gate instead, same as
// extract.ts's File-taking entry point). Run directly:
//   node src/lib/figureRunner.selfcheck.ts
import assert from "node:assert/strict";
import { isCodeSafeToRun } from "./figureRunner.ts";

const NORMAL_SNIPPET = `
fig, ax = plt.subplots()
ax.bar(df["group"], df["response_mean"])
ax.set_xlabel("Group")
ax.set_ylabel("Response")
`;
assert.equal(isCodeSafeToRun(NORMAL_SNIPPET), null, "an ordinary matplotlib snippet should pass");

const denied: Record<string, string> = {
  "import os": "import os",
  "import sys": "import sys",
  "import subprocess": "import subprocess",
  "import socket": "import socket",
  "import urllib.request": "import urllib.request",
  "requests.get('http://example.com')": "requests.get('http://example.com')",
  "import js": "import js",
  "open('/etc/passwd')": "open('/etc/passwd')",
  "__import__('os')": "__import__('os')",
};
for (const [label, snippet] of Object.entries(denied)) {
  assert.notEqual(isCodeSafeToRun(snippet), null, `"${label}" should be rejected`);
}

console.log("figureRunner.selfcheck: OK");
