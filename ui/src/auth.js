const ZOHO_BASE = "https://accounts.zoho.com";
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL;

const KEYS = {
  ID_TOKEN:      "zoho_id_token",
  ACCESS_TOKEN:  "zoho_access_token",
  REFRESH_TOKEN: "zoho_refresh_token",
  EXPIRES_AT:    "zoho_expires_at",
};

// Zohoの認証ページへリダイレクト
export function startZohoLogin() {
  const params = new URLSearchParams({
    client_id:    import.meta.env.VITE_ZOHO_CLIENT_ID,
    redirect_uri: import.meta.env.VITE_REDIRECT_URI,
    response_type: "code",
    scope:        "openid email profile",
    access_type:  "offline",
  });
  window.location.href = `${ZOHO_BASE}/oauth/v2/auth?${params}`;
}

// 認証コード（3分で期限切れ）→ トークンに交換
export async function handleOAuthCallback(code) {
  const res = await fetch(`${API_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || "token_exchange_failed");
  saveTokens(data);
  return data;
}

function saveTokens({ id_token, access_token, refresh_token, expires_in }) {
  localStorage.setItem(KEYS.ID_TOKEN, id_token);
  localStorage.setItem(KEYS.ACCESS_TOKEN, access_token);
  // refresh_tokenは初回のみ発行されるため、あれば上書き保存
  if (refresh_token) localStorage.setItem(KEYS.REFRESH_TOKEN, refresh_token);
  // expires_inは秒数（通常3600）。60秒余裕を持って期限を設定
  const expiresAt = Date.now() + (Number(expires_in || 3600) - 60) * 1000;
  localStorage.setItem(KEYS.EXPIRES_AT, String(expiresAt));
}

// IDトークンを取得（期限切れなら自動更新）
export async function getIdToken() {
  const expiresAt = Number(localStorage.getItem(KEYS.EXPIRES_AT) || 0);

  // まだ有効期限内ならそのまま返す
  if (Date.now() < expiresAt) {
    return localStorage.getItem(KEYS.ID_TOKEN);
  }

  // 期限切れ → リフレッシュトークンで更新
  const refreshToken = localStorage.getItem(KEYS.REFRESH_TOKEN);
  if (!refreshToken) {
    signOut();
    throw new Error("no_refresh_token");
  }

  const res = await fetch(`${API_BASE_URL}/oauth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });
  const data = await res.json();

  if (!res.ok || data.error) {
    signOut();
    throw new Error("refresh_failed");
  }

  saveTokens(data);
  return data.id_token;
}

// ログイン済みかチェック
export function getSession() {
  const idToken = localStorage.getItem(KEYS.ID_TOKEN);
  const refreshToken = localStorage.getItem(KEYS.REFRESH_TOKEN);
  if (!idToken || !refreshToken) return Promise.reject(new Error("no_session"));
  return Promise.resolve(true);
}

export function signOut() {
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
}
