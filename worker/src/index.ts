interface Env {
  GEMINI_API_KEY: string;
  PROXY_TOKEN?: string;
  CORS_ALLOW_ORIGIN?: string;
  ALLOWED_ORIGINS?: string;
}

const DEFAULT_MODEL = "gemini-3.1-flash-image-preview";
const GEMINI_TIMEOUT_MS = 85000;
const MAX_RETRY = 1;

type RequestPayload = {
  prompt?: string;
  systemPrompt?: string;
  imageBase64?: string;
  mimeType?: string;
  sessionId?: string;
  model?: string;
  modelId?: string;
  selectedModel?: string;
  imageModel?: string;
  file_uri?: string;
  mime_type?: string;
  responseMode?: "json" | "binary";
};

function getAllowedOrigins(env: Env): string[] {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function isAllowedOrigin(env: Env, origin: string | null): boolean {
  const allowed = getAllowedOrigins(env);
  if (allowed.length === 0) return true;
  if (!origin) return false;
  if (allowed.includes("*")) return true;
  return allowed.includes(origin);
}

function resolveAllowOrigin(env: Env, requestOrigin: string | null): string {
  if (requestOrigin && isAllowedOrigin(env, requestOrigin)) return requestOrigin;
  return env.CORS_ALLOW_ORIGIN || "*";
}

function corsHeaders(env: Env, requestOrigin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": resolveAllowOrigin(env, requestOrigin),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-proxy-token",
    "Access-Control-Expose-Headers": "x-request-id, x-session-id"
  };
}

function jsonResponse(env: Env, status: number, body: unknown, requestOrigin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...corsHeaders(env, requestOrigin)
    }
  });
}

function decodeBase64ToArrayBuffer(data: string): ArrayBuffer {
  const bin = atob(data);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

async function parseUpstreamResponse(res: Response): Promise<{ json: any | null; rawText: string; contentType: string }> {
  const contentType = res.headers.get("content-type") || "";
  const rawText = await res.text();

  if (!rawText) return { json: null, rawText: "", contentType };

  try {
    return { json: JSON.parse(rawText), rawText, contentType };
  } catch {
    return { json: null, rawText, contentType };
  }
}

function extractFirstImage(responseJson: any): { data: string; mimeType: string } | null {
  const candidates = responseJson?.candidates;
  if (!Array.isArray(candidates)) return null;

  for (const candidate of candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) continue;

    for (const part of parts) {
      const inline = part?.inlineData || part?.inline_data;
      if (inline?.data) {
        return {
          data: inline.data,
          mimeType: inline.mimeType || inline.mime_type || "image/png"
        };
      }
    }
  }

  return null;
}

function extractFirstText(responseJson: any): string | null {
  const candidates = responseJson?.candidates;
  if (!Array.isArray(candidates)) return null;

  for (const candidate of candidates) {
    const parts = candidate?.content?.parts;
    if (!Array.isArray(parts)) continue;

    for (const part of parts) {
      if (typeof part?.text === "string" && part.text.trim().length > 0) {
        return part.text;
      }
    }
  }

  return null;
}

function sanitizeForClient(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") {
    return value.length > 1200 ? `${value.slice(0, 1200)}...[truncated]` : value;
  }
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeForClient(v));
  }
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, rawVal] of Object.entries(value as Record<string, unknown>)) {
      const lowered = key.toLowerCase();
      if (
        lowered === "data" ||
        lowered === "inline_data" ||
        lowered === "inlinedata" ||
        lowered === "imagebase64" ||
        lowered === "editedimagebase64"
      ) {
        out[key] = "[redacted]";
        continue;
      }
      out[key] = sanitizeForClient(rawVal);
    }
    return out;
  }
  return value;
}

function normalizePayload(input: RequestPayload) {
  const prompt = String(input?.prompt || "").trim();
  const systemPrompt = String(input?.systemPrompt || "").trim();
  const imageBase64 = String(input?.imageBase64 || "").trim();
  const mimeType = String(input?.mimeType || input?.mime_type || "image/png").trim();
  const fileUri = String(input?.file_uri || "").trim();
  const responseMode = input?.responseMode === "binary" ? "binary" : "json";
  const model = String(input?.model || input?.modelId || input?.selectedModel || input?.imageModel || "").trim();

  return { prompt, systemPrompt, imageBase64, mimeType, fileUri, responseMode, model };
}

function resolveModel(model: string): string | null {
  if (!model) return DEFAULT_MODEL;
  // Keep the identifier strict to prevent malformed endpoint paths.
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,127}$/.test(model)) return null;
  return model;
}

async function fetchGeminiWithTimeout(endpoint: string, apiKey: string, body: unknown): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("gemini_timeout"), GEMINI_TIMEOUT_MS);

  try {
    return await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runGemini(endpoint: string, apiKey: string, body: unknown) {
  let upstreamRes: Response | null = null;
  let fetchError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRY; attempt += 1) {
    try {
      upstreamRes = await fetchGeminiWithTimeout(endpoint, apiKey, body);
      fetchError = null;

      if (upstreamRes.status === 524 && attempt < MAX_RETRY) {
        continue;
      }

      break;
    } catch (err) {
      fetchError = err;
      if (attempt >= MAX_RETRY) break;
    }
  }

  return { upstreamRes, fetchError };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestOrigin = request.headers.get("origin");
    const respond = (status: number, body: unknown) => jsonResponse(env, status, body, requestOrigin);

    if (request.method === "OPTIONS") {
      if (!isAllowedOrigin(env, requestOrigin)) {
        return respond(403, { error: "forbidden_origin" });
      }
      return new Response(null, { status: 204, headers: corsHeaders(env, requestOrigin) });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/api/edit" || request.method !== "POST") {
      return respond(404, { error: "not_found" });
    }

    if (!isAllowedOrigin(env, requestOrigin)) {
      return respond(403, { error: "forbidden_origin" });
    }

    if (env.PROXY_TOKEN) {
      const token = request.headers.get("x-proxy-token");
      if (token !== env.PROXY_TOKEN) {
        return respond(401, { error: "unauthorized" });
      }
    }

    if (!env.GEMINI_API_KEY) {
      return respond(500, { error: "missing_gemini_api_key" });
    }

    let payload: RequestPayload;
    try {
      payload = (await request.json()) as RequestPayload;
    } catch {
      return respond(400, { error: "invalid_json" });
    }

    const requestId = crypto.randomUUID();
    const sessionId = String(payload?.sessionId || crypto.randomUUID());
    const { prompt, systemPrompt, imageBase64, mimeType, fileUri, responseMode, model } = normalizePayload(payload);
    const selectedModel = resolveModel(model);

    if (!prompt) {
      return respond(400, { error: "prompt_required", requestId, sessionId });
    }
    if (!selectedModel) {
      return respond(400, { error: "invalid_model", requestId, sessionId });
    }

    if (!imageBase64 && !fileUri) {
      return respond(400, {
        error: "image_required",
        detail: "Set imageBase64 (UI) or file_uri (legacy Dify mode)",
        requestId,
        sessionId
      });
    }

    const parts: any[] = [{ text: prompt }];
    if (imageBase64) {
      parts.push({
        inlineData: {
          mimeType,
          data: imageBase64
        }
      });
    } else {
      parts.push({
        file_data: {
          mime_type: mimeType,
          file_uri: fileUri
        }
      });
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`;

    const bodyTextAndImage: Record<string, unknown> = {
      contents: [{ role: "user", parts }],
      generationConfig: { responseModalities: ["TEXT", "IMAGE"] }
    };
    if (systemPrompt) {
      bodyTextAndImage.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const first = await runGemini(endpoint, env.GEMINI_API_KEY, bodyTextAndImage);

    if (!first.upstreamRes) {
      return respond(504, {
        error: "gemini_timeout",
        requestId,
        sessionId,
        detail: "Gemini APIの応答がタイムアウトしました。画像サイズを小さくして再試行してください。",
        reason: String((first.fetchError as Error)?.message || first.fetchError || "unknown")
      });
    }

    const upstream = await parseUpstreamResponse(first.upstreamRes);

    if (!first.upstreamRes.ok) {
      const isTimeout = first.upstreamRes.status === 524;
      return respond(isTimeout ? 504 : first.upstreamRes.status, {
        error: isTimeout ? "gemini_timeout" : "gemini_request_failed",
        requestId,
        sessionId,
        status: first.upstreamRes.status,
        contentType: upstream.contentType,
        details: upstream.json ? sanitizeForClient(upstream.json) : sanitizeForClient(upstream.rawText),
        hint: isTimeout ? "画像サイズや指示を軽くして再送してください。" : undefined
      });
    }

    let json = upstream.json;
    let image = json ? extractFirstImage(json) : null;
    let text = json ? extractFirstText(json) : null;

    if (!image) {
      const bodyImageOnly: Record<string, unknown> = {
        contents: [{ role: "user", parts }],
        generationConfig: { responseModalities: ["IMAGE"] }
      };
      if (systemPrompt) {
        bodyImageOnly.systemInstruction = { parts: [{ text: systemPrompt }] };
      }

      const second = await runGemini(endpoint, env.GEMINI_API_KEY, bodyImageOnly);
      if (second.upstreamRes && second.upstreamRes.ok) {
        const upstream2 = await parseUpstreamResponse(second.upstreamRes);
        if (upstream2.json) {
          json = upstream2.json;
          image = extractFirstImage(json);
          text = extractFirstText(json) || text;
        }
      }
    }

    if (!json) {
      return respond(502, {
        error: "upstream_parse_error",
        requestId,
        sessionId,
        status: first.upstreamRes.status,
        contentType: upstream.contentType,
        raw: sanitizeForClient(upstream.rawText)
      });
    }

    if (!image) {
      const finishReasons = Array.isArray(json?.candidates)
        ? json.candidates.map((c: any) => c?.finishReason || c?.finish_reason || "unknown")
        : [];

      return respond(502, {
        error: "no_image_part",
        requestId,
        sessionId,
        text,
        finishReasons,
        hint: "安全判定やモデル都合で画像が返らない場合があります。指示を短くし、人物保持・編集意図を明確にして再試行してください。"
      });
    }

    if (responseMode === "binary") {
      return new Response(decodeBase64ToArrayBuffer(image.data), {
        status: 200,
        headers: {
          "Content-Type": image.mimeType,
          "Content-Disposition": "attachment; filename=edited.png",
          "Cache-Control": "no-store",
          "x-request-id": requestId,
          "x-session-id": sessionId,
          ...corsHeaders(env, requestOrigin)
        }
      });
    }

    return respond(200, {
      requestId,
      sessionId,
      model: selectedModel,
      text,
      editedImageBase64: image.data,
      mimeType: image.mimeType
    });
  }
};
