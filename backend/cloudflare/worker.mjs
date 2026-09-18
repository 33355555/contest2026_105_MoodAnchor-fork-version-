// Small, authenticated Coze proxy. No model credentials in source or APK.
const encoder = new TextEncoder();
const SESSION_MS = 24 * 60 * 60 * 1000;
class ApiError extends Error {
  constructor(status, code, detail) {
    super(detail);
    Object.assign(this, { status, code });
  }
}
const fail = (status, code, detail) => { throw new ApiError(status, code, detail); };
const json = (status, data) => new Response(JSON.stringify(data), {
  status,
  headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
});

async function boundedText(stream, maxBytes) {
  if (!stream) return "";
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = "", bytes = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) fail(413, "too_large", "请求或模型回复过长。");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

// Bind the upstream conversation to this client without a database. The App
// stores this opaque value in its existing conversation_id preference.
async function sessionKey(secret) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function sealSession(id, client, secret) {
  const payload = btoa(JSON.stringify({ id, client, expires: Date.now() + SESSION_MS }));
  const signature = await crypto.subtle.sign("HMAC", await sessionKey(secret), encoder.encode(payload));
  return payload + "." + btoa(String.fromCharCode(...new Uint8Array(signature)));
}
async function openSession(token, client, secret) {
  try {
    const [payload, signature, extra] = token.split(".");
    if (extra || !payload || !signature) throw new Error();
    const valid = await crypto.subtle.verify("HMAC", await sessionKey(secret),
      Uint8Array.from(atob(signature), c => c.charCodeAt(0)), encoder.encode(payload));
    const data = JSON.parse(atob(payload));
    if (!valid || data.client !== client || data.expires <= Date.now() || !/^\d+$/.test(data.id)) throw new Error();
    return data.id;
  } catch {
    fail(400, "invalid_session", "会话已过期或无效，请退出后重新进入对话。");
  }
}

export function parseCozeEvents(text) {
  let completed = false, conversationId = "";
  const parts = [];
  for (const frame of text.replace(/\r\n/g, "\n").split("\n\n")) {
    const lines = frame.split("\n");
    const event = lines.find(line => line.startsWith("event:"))?.slice(6).trim();
    const raw = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    if (!raw || raw === "[DONE]") continue;
    let data;
    try { data = JSON.parse(raw); } catch { fail(502, "invalid_model_response", "模型返回格式异常，请稍后重试。"); }
    if (event === "error" || ["conversation.chat.failed", "conversation.chat.requires_action", "conversation.chat.canceled"].includes(event)) {
      fail(502, "model_failed", "模型未完成回复，请检查服务额度、Bot 配置或稍后重试。");
    }
    if (data.conversation_id) conversationId = String(data.conversation_id);
    if (event === "conversation.message.delta" && data.role === "assistant" && data.type === "answer" && typeof data.content === "string") parts.push(data.content);
    if (event === "conversation.chat.completed") completed = true;
  }
  const reply = parts.join("").trim();
  if (!completed || !reply || !/^\d+$/.test(conversationId)) fail(502, "incomplete_reply", "模型回复为空或中断，请稍后重试。");
  return { reply, conversationId };
}

export async function handle(request, env, upstreamFetch = fetch) {
  try {
    const url = new URL(request.url);
    if (url.pathname === "/health" && request.method === "GET") {
      return json(200, { ok: true, service: "moodanchor-cloudflare", enabled: env.DEMO_ENABLED === "true", note: "仅检查 Worker 存活，不代表 Coze 额度或连接正常。" });
    }
    if (url.pathname !== "/chat") return json(404, { error: "not_found" });
    if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
    if (env.DEMO_ENABLED !== "true") fail(503, "demo_disabled", "在线演示尚未启用或已暂停。");
    if (!env.COZE_API_KEY || !env.COZE_BOT_ID || !env.DEMO_ACCESS_TOKEN || !env.CHAT_LIMITER) fail(503, "not_configured", "演示服务配置尚未完成。");
    if (request.headers.get("Authorization") !== `Bearer ${env.DEMO_ACCESS_TOKEN}`) fail(401, "unauthorized", "评审访问码无效，请检查服务设置。");
    // A shared demo-code bucket prevents bypass by inventing new client IDs.
    // This is approximate PER-LOCATION throttling, not a global spending cap.
    if (!(await env.CHAT_LIMITER.limit({ key: "moodanchor-demo" })).success) fail(429, "rate_limited", "演示请求过于频繁，请稍后再试。");
    if (!request.headers.get("Content-Type")?.toLowerCase().startsWith("application/json")) fail(415, "invalid_content_type", "请求必须为 JSON。");
    let body;
    try { body = JSON.parse(await boundedText(request.body, 16384)); }
    catch (error) { if (error instanceof ApiError) throw error; fail(400, "invalid_json", "请求格式错误。"); }
    if (!body || typeof body !== "object" || Array.isArray(body)) fail(400, "invalid_request", "请求格式错误。");
    const { message, client_id: client } = body;
    if (typeof message !== "string" || !message.trim() || message.length > 4000) fail(400, "invalid_message", "请输入 1–4000 字符的消息。");
    if (typeof client !== "string" || !/^[A-Za-z0-9_-]{8,80}$/.test(client)) fail(400, "invalid_client", "客户端标识无效。");
    if (body.provider && body.provider !== "coze") fail(400, "invalid_provider", "此演示仅支持 Coze。");
    if (body.new_conversation !== undefined && typeof body.new_conversation !== "boolean") fail(400, "invalid_request", "新会话标记必须为布尔值。");
    if (body.conversation_id !== undefined && (typeof body.conversation_id !== "string" || body.conversation_id.length > 2048)) fail(400, "invalid_session", "会话标识无效。");
    const endpoint = new URL("https://api.coze.cn/v3/chat");
    if (!body.new_conversation && body.conversation_id) endpoint.searchParams.set("conversation_id", await openSession(body.conversation_id, client, env.COZE_API_KEY));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 75000);
    const disconnect = () => controller.abort();
    request.signal.addEventListener("abort", disconnect, { once: true });
    try {
      if (request.signal.aborted) controller.abort();
      const response = await upstreamFetch(endpoint, {
        method: "POST", redirect: "error", signal: controller.signal,
        headers: { "Authorization": `Bearer ${env.COZE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ bot_id: env.COZE_BOT_ID, user_id: "moodanchor-" + client, stream: true, auto_save_history: true,
          additional_messages: [{ role: "user", content: message.trim(), content_type: "text" }] }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        if (response.status === 429) fail(429, "model_rate_limited", "模型服务限流或额度受限，请稍后重试或联系维护者。");
        fail(502, "model_http_error", "模型服务请求失败，请维护者检查密钥、Bot 发布状态及额度。");
      }
      if (!response.headers.get("Content-Type")?.includes("text/event-stream")) {
        await response.body?.cancel();
        fail(502, "invalid_model_response", "模型未返回有效对话流，请检查服务配置与额度。");
      }
      const result = parseCozeEvents(await boundedText(response.body, 1024 * 1024));
      return json(200, { reply: result.reply, provider: "coze", bot_id: env.COZE_BOT_ID,
        conversation_id: await sealSession(result.conversationId, client, env.COZE_API_KEY) });
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (controller.signal.aborted) fail(504, "model_timeout", "模型响应超时或连接中断，请稍后再试。");
      fail(502, "model_unreachable", "暂时无法连接模型服务，请稍后重试。");
    } finally {
      clearTimeout(timeout);
      request.signal.removeEventListener("abort", disconnect);
    }
  } catch (error) {
    // Never echo upstream bodies, authorization headers, or chat content.
    if (error instanceof ApiError) return json(error.status, { error: error.code, detail: error.message });
    return json(500, { error: "server_error", detail: "服务暂时异常，请稍后重试。" });
  }
}

export default { fetch: (request, env) => handle(request, env) };
