// Runnable check for errorMessage.ts. Run directly:
//   node src/lib/errorMessage.selfcheck.ts
import assert from "node:assert/strict";
import { errorMessage } from "./errorMessage.ts";

assert.equal(errorMessage(new Error("boom")), "boom", "an Error's .message should pass through");
assert.equal(errorMessage("not an error"), "not an error", "default fallback is String(err)");
assert.equal(
  errorMessage("not an error", "custom fallback"),
  "custom fallback",
  "an explicit fallback should override String(err) for a non-Error throw"
);
assert.equal(
  errorMessage(new Error("boom"), "custom fallback"),
  "boom",
  "an explicit fallback should never override a real Error's message"
);

console.log("errorMessage.selfcheck: OK");
