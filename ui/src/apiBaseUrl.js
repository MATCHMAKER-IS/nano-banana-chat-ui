const LOCAL_DEFAULT_API_BASE_URL = "http://127.0.0.1:8787";

function trimTrailingSlash(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function isFeatureHost(hostname) {
  const host = String(hostname || "").toLowerCase();
  return host.includes("feature-non-engineer-ui") || host.startsWith("feature-");
}

export function resolveApiBaseUrl() {
  const host = window.location.hostname || "";
  const onFeature = isFeatureHost(host);

  const featureOverride = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL_FEATURE);
  const mainOverride = trimTrailingSlash(import.meta.env.VITE_API_BASE_URL_MAIN);
  if (onFeature && featureOverride) return featureOverride;
  if (!onFeature && mainOverride) return mainOverride;

  const raw = String(import.meta.env.VITE_API_BASE_URL || "").trim();
  const urls = raw
    .split(",")
    .map((v) => trimTrailingSlash(v))
    .filter(Boolean);

  if (urls.length >= 2) return onFeature ? urls[1] : urls[0];
  if (urls.length === 1) return urls[0];
  return LOCAL_DEFAULT_API_BASE_URL;
}

