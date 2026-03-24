import { createRemoteJWKSet, jwtVerify } from "jose";

const DEFAULT_MODEL = "gemini-3.1-flash-image-preview";
const GEMINI_TIMEOUT_MS = 85000;
const MAX_RETRY = 1;

// Cognitoの公開鍵をキャッシュ
let _jwks = null;
function getJwks() {
  if (!_jwks) {
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    const region = userPoolId?.split("_")[0] || "ap-northeast-1";
    const url = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
    _jwks = createRemoteJWKSet(new URL(url));
  }
  return _jwks;
}

async function verifyCognitoToken(authHeader) {
  if (!authHeader?.startsWith("Bearer ")) return null;
  const token = authHeader.slice(7);
  try {
    const { payload } = await jwtVerify(token, getJwks(), {
      issuer: `https://cognito-idp.${process.env.COGNITO_USER_POOL_ID?.split("_")[0] || "ap-northeast-1"}.amazonaws.com/${process.env.COGNITO_USER_POOL_ID}`,
      audience: process.env.COGNITO_CLIENT_ID,
    });
    return payload;
  } catch {
    return null;
  }
}

function getAllowedOrigins() {
  return String(process.env.ALLOWED_ORIGINS || "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

function isAllowedOrigin(origin) {
  const allowed = getAllowedOrigins();
  if (allowed.length === 0) return true;
  if (!origin) return false;
  if (allowed.includes("*")) return true;
  return allowed.includes(origin);
}

function resolveAllowOrigin(requestOrigin) {
  if (requestOrigin && isAllowedOrigin(requestOrigin)) return requestOrigin;
  return process.env.CORS_ALLOW_ORIGIN || "*";
}

function corsHeaders(requestOrigin) {
  return {
    "Access-Control-Allow-Origin": resolveAllowOrigin(requestOrigin),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Expose-Headers": "x-request-id, x-session-id",
  };
}

function jsonResponse(statusCode, body, requestOrigin) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify(body),
  };
}

function extractFirstImage(responseJson) {
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
          mimeType: inline.mimeType || inline.mime_type || "image/png",
        };
      }
    }
  }
  return null;
}

function extractFirstText(responseJson) {
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

function normalizePayload(input) {
  const prompt = String(input?.prompt || "").trim();
  const systemPrompt = String(input?.systemPrompt || "").trim();
  const imageBase64 = String(input?.imageBase64 || "").trim();
  const mimeType = String(input?.mimeType || input?.mime_type || "image/png").trim();
  const fileUri = String(input?.file_uri || "").trim();
  const responseMode = input?.responseMode === "binary" ? "binary" : "json";
  const model = String(input?.model || input?.modelId || input?.selectedModel || input?.imageModel || "").trim();
  return { prompt, systemPrompt, imageBase64, mimeType, fileUri, responseMode, model };
}

function resolveModel(model) {
  if (!model) return DEFAULT_MODEL;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,127}$/.test(model)) return null;
  return model;
}

async function fetchGeminiWithTimeout(endpoint, apiKey, body) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort("gemini_timeout"), GEMINI_TIMEOUT_MS);
  try {
    return await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function runGemini(endpoint, apiKey, body) {
  let upstreamRes = null;
  let fetchError = null;
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try {
      upstreamRes = await fetchGeminiWithTimeout(endpoint, apiKey, body);
      fetchError = null;
      if (upstreamRes.status === 524 && attempt < MAX_RETRY) continue;
      break;
    } catch (err) {
      fetchError = err;
      if (attempt >= MAX_RETRY) break;
    }
  }
  return { upstreamRes, fetchError };
}

export const handler = async (event) => {
  const method = event.requestContext?.http?.method || event.httpMethod || "GET";
  const path = event.rawPath || event.path || "/";
  const headers = event.headers || {};
  const requestOrigin = headers["origin"] || headers["Origin"] || null;

  const respond = (statusCode, body) => jsonResponse(statusCode, body, requestOrigin);

  // OPTIONSプリフライトはLambda Function URLが処理
  if (method === "OPTIONS") {
    return { statusCode: 204, headers: {}, body: "" };
  }

  if (path !== "/api/edit" || method !== "POST") {
    return respond(404, { error: "not_found" });
  }

  if (!isAllowedOrigin(requestOrigin)) {
    return respond(403, { error: "forbidden_origin" });
  }

  // Cognito JWT認証
  const authHeader = headers["authorization"] || headers["Authorization"] || "";
  const cognitoPayload = await verifyCognitoToken(authHeader);
  if (!cognitoPayload) {
    return respond(401, { error: "unauthorized", hint: "ログインしてください。" });
  }

  // APIキー確認
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return respond(500, { error: "missing_gemini_api_key" });
  }

  // リクエストボディのパース
  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch {
    return respond(400, { error: "invalid_json" });
  }

  const requestId = crypto.randomUUID();
  const sessionId = String(payload?.sessionId || crypto.randomUUID());
  const { prompt, systemPrompt, imageBase64, mimeType, fileUri, responseMode, model } = normalizePayload(payload);
  const selectedModel = resolveModel(model);

  if (!prompt) return respond(400, { error: "prompt_required", requestId, sessionId });
  if (!selectedModel) return respond(400, { error: "invalid_model", requestId, sessionId });
  if (!imageBase64 && !fileUri) {
    return respond(400, { error: "image_required", requestId, sessionId });
  }

  const parts = [{ text: prompt }];
  if (imageBase64) {
    parts.push({ inlineData: { mimeType, data: imageBase64 } });
  } else {
    parts.push({ file_data: { mime_type: mimeType, file_uri: fileUri } });
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent`;

  const bodyTextAndImage = {
    contents: [{ role: "user", parts }],
    generationConfig: { responseModalities: ["TEXT", "IMAGE"] },
  };
  if (systemPrompt) {
    bodyTextAndImage.systemInstruction = { parts: [{ text: systemPrompt }] };
  }

  const first = await runGemini(endpoint, apiKey, bodyTextAndImage);

  if (!first.upstreamRes) {
    return respond(504, {
      error: "gemini_timeout",
      requestId,
      sessionId,
      detail: "Gemini APIの応答がタイムアウトしました。画像サイズを小さくして再試行してください。",
      reason: String(first.fetchError?.message || first.fetchError || "unknown"),
    });
  }

  const rawText = await first.upstreamRes.text();
  let upstreamJson = null;
  try { upstreamJson = JSON.parse(rawText); } catch {}

  if (!first.upstreamRes.ok) {
    const isTimeout = first.upstreamRes.status === 524;
    return respond(isTimeout ? 504 : first.upstreamRes.status, {
      error: isTimeout ? "gemini_timeout" : "gemini_request_failed",
      requestId,
      sessionId,
      status: first.upstreamRes.status,
      hint: isTimeout
        ? "画像サイズや指示を軽くして再送してください。"
        : "モデルが応答できませんでした。選択中のモデルが不安定な可能性があります。別のモデルに切り替えてお試しください。",
    });
  }

  let json = upstreamJson;
  let image = json ? extractFirstImage(json) : null;
  let text = json ? extractFirstText(json) : null;

  if (!image) {
    const bodyImageOnly = {
      contents: [{ role: "user", parts }],
      generationConfig: { responseModalities: ["IMAGE"] },
    };
    if (systemPrompt) {
      bodyImageOnly.systemInstruction = { parts: [{ text: systemPrompt }] };
    }
    const second = await runGemini(endpoint, apiKey, bodyImageOnly);
    if (second.upstreamRes?.ok) {
      const raw2 = await second.upstreamRes.text();
      try {
        const json2 = JSON.parse(raw2);
        image = extractFirstImage(json2);
        text = extractFirstText(json2) || text;
        if (image) json = json2;
      } catch {}
    }
  }

  if (!json) {
    return respond(502, { error: "upstream_parse_error", requestId, sessionId });
  }

  if (!image) {
    const finishReasons = Array.isArray(json?.candidates)
      ? json.candidates.map((c) => c?.finishReason || "unknown")
      : [];
    return respond(502, {
      error: "no_image_part",
      requestId,
      sessionId,
      text,
      finishReasons,
      hint: "画像が生成されませんでした。選択中のモデルが不安定な可能性があります。別のモデルに切り替えるか、指示を変えて再試行してください。",
    });
  }

  return respond(200, {
    requestId,
    sessionId,
    model: selectedModel,
    text,
    editedImageBase64: image.data,
    mimeType: image.mimeType,
  });
};
