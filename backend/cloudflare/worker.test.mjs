import test from "node:test";
import assert from "node:assert/strict";
import worker, { handle, parseCozeEvents } from "./worker.mjs";

const env = () => ({ DEMO_ENABLED: "true", COZE_API_KEY: "test-only-key", COZE_BOT_ID: "1234", DEMO_ACCESS_TOKEN: "test-access-code", CHAT_LIMITER: { limit: async () => ({ success: true }) } });
const frame = (event, data) => `event: ${event}\r\ndata: ${JSON.stringify(data)}\r\n\r\n`;
const stream = () => frame("conversation.chat.created", { conversation_id: "98765" })
  + frame("conversation.message.delta", { role: "assistant", type: "verbose", content: "hidden" })
  + frame("conversation.message.delta", { role: "assistant", type: "answer", content: "你好" })
  + frame("conversation.message.delta", { role: "assistant", type: "answer", content: "，我在。" })
  + frame("conversation.chat.completed", { conversation_id: "98765" }) + "event: done\r\ndata: [DONE]\r\n\r\n";
const success = () => new Response(stream(), { headers: { "Content-Type": "text/event-stream" } });
const request = (body = {}, token = "test-access-code") => new Request("https://demo.test/chat", {
  method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
  body: JSON.stringify({ message: "你好", client_id: "test-client-001", provider: "coze", ...body }),
});
const forbiddenFetch = () => { throw new Error("Unexpected model call"); };

test("health works with real Worker ctx and reveals no credentials", async () => {
  const response = await worker.fetch(new Request("https://demo.test/health"), env(), {});
  assert.equal(response.status, 200);
  assert.doesNotMatch(await response.text(), /test-only-key|test-access-code/);
});
test("disabled and unconfigured service fail closed", async () => {
  assert.equal((await handle(request(), { ...env(), DEMO_ENABLED: "false" }, forbiddenFetch)).status, 503);
  assert.equal((await handle(request(), { ...env(), DEMO_ACCESS_TOKEN: "" }, forbiddenFetch)).status, 503);
});
test("unauthorized callers never invoke model", async () => {
  assert.equal((await handle(request({}, "wrong"), env(), forbiddenFetch)).status, 401);
});
test("rate limited caller never invokes model", async () => {
  assert.equal((await handle(request(), { ...env(), CHAT_LIMITER: { limit: async () => ({ success: false }) } }, forbiddenFetch)).status, 429);
});
test("input validation", async () => {
  for (const body of [{ message: "" }, { message: "x".repeat(4001) }, { client_id: "bad" }, { provider: "qwen" }, { new_conversation: "false" }, { conversation_id: 12 }]) {
    assert.equal((await handle(request(body), env(), forbiddenFetch)).status, 400);
  }
  assert.equal((await handle(request({ extra: "x".repeat(17000) }), env(), forbiddenFetch)).status, 413);
  assert.equal((await handle(new Request("https://demo.test/chat", { method: "POST", headers: { "Authorization": "Bearer test-access-code", "Content-Type": "application/json" }, body: "{" }), env(), forbiddenFetch)).status, 400);
});
test("answer-only SSE parser rejects truncated and failed replies", () => {
  assert.equal(parseCozeEvents(stream()).reply, "你好，我在。");
  assert.throws(() => parseCozeEvents(stream().replace("conversation.chat.completed", "unknown")));
  assert.throws(() => parseCozeEvents(stream() + frame("conversation.chat.failed", { last_error: { msg: "secret" } })));
});
test("successful request, continuation, reset and session isolation", async () => {
  const config = env();
  let url, payload;
  const model = async (target, init) => {
    url = new URL(target); payload = JSON.parse(init.body);
    assert.equal(init.headers.Authorization, "Bearer test-only-key");
    return success();
  };
  const response = await handle(request(), config, model);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.reply, "你好，我在。");
  assert.equal(payload.user_id, "moodanchor-test-client-001");
  assert.equal(url.search, "");
  assert.equal((await handle(request({ conversation_id: data.conversation_id }), config, model)).status, 200);
  assert.equal(url.searchParams.get("conversation_id"), "98765");
  assert.equal((await handle(request({ conversation_id: data.conversation_id, client_id: "different-client" }), config, forbiddenFetch)).status, 400);
  assert.equal((await handle(request({ conversation_id: data.conversation_id + "tampered" }), config, forbiddenFetch)).status, 400);
  assert.equal((await handle(request({ conversation_id: data.conversation_id, new_conversation: true }), config, model)).status, 200);
  assert.equal(url.search, "");
});
test("upstream errors never echo secrets or fake a reply", async () => {
  for (const status of [401, 403, 429, 500]) {
    const response = await handle(request(), env(), async () => new Response("private-provider-detail", { status }));
    assert.equal(response.status, status === 429 ? 429 : 502);
    assert.doesNotMatch(await response.text(), /private-provider-detail|test-only-key|"reply"/);
  }
  assert.equal((await handle(request(), env(), async () => { throw new Error("network-private-detail"); })).status, 502);
  assert.equal((await handle(request(), env(), async () => new Response('{"code":1}', { headers: { "Content-Type": "application/json" } }))).status, 502);
});
