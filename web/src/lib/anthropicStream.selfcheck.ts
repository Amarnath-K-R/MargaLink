// Runnable check for anthropicStream.ts — the SSE accumulation behind every
// review pass, against a stubbed streaming fetch. Run directly:
//   node src/lib/anthropicStream.selfcheck.ts
import assert from "node:assert/strict";
import { TruncatedOutputError, UpstreamError, callAnthropicTool } from "./anthropicStream.ts";

const ev = (type: string, data: Record<string, unknown>) => `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;
const TOOL_STREAM = [
  ev("message_start", { message: { id: "m" } }),
  ev("content_block_start", { index: 0, content_block: { type: "thinking" } }),
  ev("content_block_start", { index: 1, content_block: { type: "tool_use", name: "submit_extraction" } }),
  ev("content_block_delta", { index: 1, delta: { type: "input_json_delta", partial_json: '{"claims":[' } }),
  ev("content_block_delta", { index: 1, delta: { type: "input_json_delta", partial_json: "]}" } }),
  ev("message_delta", { delta: { stop_reason: "end_turn" } }),
];

let lastInit: RequestInit | undefined;
function stubFetch(chunks: string[], status = 200) {
  (globalThis as unknown as { fetch: typeof fetch }).fetch = (async (_url: string, init?: RequestInit) => {
    lastInit = init;
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (const ch of chunks) c.enqueue(new TextEncoder().encode(ch));
        c.close();
      },
    });
    return new Response(status === 200 ? stream : "upstream said no", { status });
  }) as typeof fetch;
}
const call = () => callAnthropicTool("key", { model: "m", messages: [] }, { toolName: "submit_extraction", timeoutMs: 5000 });

stubFetch([TOOL_STREAM.join("")]);
assert.deepEqual(await call(), { toolInput: { claims: [] }, stopReason: "end_turn" }, "normal stream assembles the tool input");
assert.equal(JSON.parse(lastInit!.body as string).stream, true, "stream:true is added to the body");
assert.ok(lastInit!.signal, "the upstream fetch carries a timeout signal");

stubFetch([TOOL_STREAM.join("").replace(/\n/g, "\r\n")]);
assert.deepEqual((await call()).toolInput, { claims: [] }, "CRLF separators are handled");

const joined = TOOL_STREAM.join("");
const cut = joined.indexOf('"partial_json"') + 5;
stubFetch([joined.slice(0, cut), joined.slice(cut)]);
assert.deepEqual((await call()).toolInput, { claims: [] }, "an event straddling two reads is reassembled");

stubFetch([TOOL_STREAM.slice(0, 4).join("") + ev("message_delta", { delta: { stop_reason: "max_tokens" } })]);
await assert.rejects(call, TruncatedOutputError, "max_tokens mid-JSON is a typed truncation error");

stubFetch([TOOL_STREAM.slice(0, 5).join("") + ev("message_delta", { delta: { stop_reason: "max_tokens" } })]);
await assert.rejects(call, TruncatedOutputError, "max_tokens with parseable JSON is still truncation");

stubFetch([ev("message_start", { message: {} }) + ev("error", { error: { type: "overloaded_error", message: "busy" } })]);
await assert.rejects(call, (e: unknown) => e instanceof UpstreamError && e.status === 502 && /busy/.test(e.message), "an error event is an UpstreamError 502");

stubFetch([], 529);
await assert.rejects(call, (e: unknown) => e instanceof UpstreamError && e.status === 529, "a non-2xx response carries its status");

const other =
  ev("content_block_start", { index: 1, content_block: { type: "tool_use", name: "other_tool" } }) +
  ev("content_block_delta", { index: 1, delta: { type: "input_json_delta", partial_json: '{"x":1}' } });
const renumbered = TOOL_STREAM.slice(2, 5).map((e) => e.replace('"index":1', '"index":2')).join("");
stubFetch([TOOL_STREAM[0] + other + renumbered + TOOL_STREAM[5]]);
assert.deepEqual((await call()).toolInput, { claims: [] }, "picks the tool_use block by name, not the first one");

stubFetch([TOOL_STREAM.join("").trimEnd()]);
assert.deepEqual((await call()).toolInput, { claims: [] }, "a final event without a trailing blank line is still processed");

stubFetch([": ping\n\n" + ev("ping", {}) + TOOL_STREAM.join("")]);
assert.deepEqual((await call()).toolInput, { claims: [] }, "comment lines and ping events are ignored");

stubFetch([TOOL_STREAM[0] + TOOL_STREAM[5]]);
assert.deepEqual(await call(), { toolInput: undefined, stopReason: "end_turn" }, "no tool_use → undefined, not a throw");

console.log("anthropicStream.selfcheck: OK");
