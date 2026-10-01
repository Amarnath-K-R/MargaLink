// The one place that talks to Anthropic's Messages API, for every review
// pass. Streaming even for short passes: a non-streaming request with
// adaptive thinking can run long enough that Anthropic's own edge times out
// (seen as a 524 from fetch()); with streaming, bytes flow so no idle
// timeout trips. Isomorphic (fetch/ReadableStream/TextDecoder only) so the
// selfcheck can drive it with a stubbed fetch, and functions/ can import it.
export class UpstreamError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export class TruncatedOutputError extends Error {}

type SseEvent = {
  type?: string;
  index?: number;
  content_block?: { type?: string; name?: string };
  delta?: { type?: string; partial_json?: string; stop_reason?: string };
  error?: unknown;
};

export async function callAnthropicTool(
  apiKey: string,
  body: Record<string, unknown>,
  opts: { toolName: string; timeoutMs: number }
): Promise<{ toolInput: unknown | undefined; stopReason: string | undefined }> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ ...body, stream: true }),
    signal: AbortSignal.timeout(opts.timeoutMs),
  });
  if (!res.ok || !res.body) throw new UpstreamError(res.status, await res.text().catch(() => ""));

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const blocks = new Map<number, { name: string; json: string }>();
  let stopReason: string | undefined;
  let buffer = "";

  const handle = (raw: string) => {
    const data = raw
      .split(/\r?\n/)
      .filter((l) => l.startsWith("data:"))
      .map((l) => l.slice(5).trim())
      .join("");
    if (!data) return;
    let evt: SseEvent;
    try {
      evt = JSON.parse(data);
    } catch {
      return; // a malformed chunk skips one event, never the whole request
    }
    if (evt.type === "error") throw new UpstreamError(502, JSON.stringify(evt.error));
    if (evt.type === "content_block_start" && evt.content_block?.type === "tool_use" && typeof evt.index === "number") {
      blocks.set(evt.index, { name: evt.content_block.name ?? "", json: "" });
    }
    if (evt.type === "content_block_delta" && evt.delta?.type === "input_json_delta" && typeof evt.index === "number") {
      const b = blocks.get(evt.index);
      if (b) b.json += evt.delta.partial_json ?? "";
    }
    if (evt.type === "message_delta" && evt.delta?.stop_reason) stopReason = evt.delta.stop_reason;
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split(/\r?\n\r?\n/);
    buffer = events.pop() ?? "";
    events.forEach(handle);
  }
  buffer += decoder.decode();
  if (buffer.trim()) handle(buffer);

  // Even when the JSON happens to parse, a max_tokens stop means a list was
  // cut short — silent data loss. Surface it so the caller can retry smaller.
  if (stopReason === "max_tokens") throw new TruncatedOutputError("model output hit max_tokens");
  const block = [...blocks.values()].find((b) => b.name === opts.toolName);
  if (!block || !block.json) return { toolInput: undefined, stopReason };
  return { toolInput: JSON.parse(block.json), stopReason };
}
