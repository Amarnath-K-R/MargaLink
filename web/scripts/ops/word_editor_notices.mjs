// Writes public/licenses/word-editor.txt: the licences and notices of the Word
// editor (Folio, Apache-2.0, with Eigenpal's MIT notice) and the fonts it
// bundles (SIL OFL 1.1), copied verbatim from the installed packages, which
// these licences ask to travel with the code and fonts we serve. Re-run after
// upgrading @stll/folio-react:  node scripts/ops/word_editor_notices.mjs
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = (pkg) => new URL(`../../node_modules/${pkg}`, import.meta.url).pathname; // not resolve(): packages' exports hide package.json
const react = dir("@stll/folio-react");
const fonts = Object.keys(JSON.parse(readFileSync(join(react, "package.json"), "utf8")).dependencies ?? {}).filter((d) => d.startsWith("@fontsource/"));
const part = (title, file) => `${"=".repeat(78)}\n${title}\n${"=".repeat(78)}\n\n${readFileSync(file, "utf8").trim()}\n`;
const text = [
  "Third-party licences for MargaLink's Word editor (/write, Word documents).\n",
  part("@stll/folio-react and @stll/folio-core: Apache License 2.0", join(react, "LICENSE")),
  part("@stll/folio-react and @stll/folio-core: NOTICE", join(react, "NOTICE.md")),
  ...fonts.map((f) => part(`${f}: SIL Open Font License 1.1`, join(dir(f), "LICENSE"))),
].join("\n");
const out = new URL("../../public/licenses/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "word-editor.txt"), text);
console.log(`wrote public/licenses/word-editor.txt (${fonts.length} fonts)`);
