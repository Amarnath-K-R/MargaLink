// Runnable check for journalUrl.ts. Run directly: node src/lib/journals/journalUrl.selfcheck.ts
import assert from "node:assert/strict";
import { journalHref, webLink } from "./journalUrl.ts";

assert.equal(journalHref("https://openalex.org/S123"), "/journal/S123");
// a journal's website comes from third-party data: only a web address becomes a link
assert.equal(webLink("https://www.jacc.org/"), "https://www.jacc.org/");
assert.equal(webLink("http://example.org/a?b=1"), "http://example.org/a?b=1");
for (const bad of ["javascript:alert(1)", " JavaScript:alert(1)", "data:text/html,x", "vbscript:x", "//evil.test", "/relative", "", null, undefined]) {
  assert.equal(webLink(bad), null, String(bad));
}
console.log("journalUrl.selfcheck: OK");
