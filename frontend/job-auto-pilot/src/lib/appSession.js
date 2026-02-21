const APP_TOKEN_KEY = "jobautopilot.app_token";
const FETCH_GUARD_KEY = "__jobAutopilotFetchWrapped";

function looksLikeJwt(value) {
  return /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
    String(value || "").trim()
  );
}

function safeLocalStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeLocalStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function safeLocalStorageRemove(key) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function getAppToken() {
  const raw = safeLocalStorageGet(APP_TOKEN_KEY);
  const token = String(raw || "").trim();
  if (!token) return "";

  const lower = token.toLowerCase();
  if (lower === "null" || lower === "undefined" || !looksLikeJwt(token)) {
    safeLocalStorageRemove(APP_TOKEN_KEY);
    return "";
  }

  return token;
}

export function setAppToken(token) {
  const value = String(token || "").trim();
  if (!value || !looksLikeJwt(value)) {
    safeLocalStorageRemove(APP_TOKEN_KEY);
    return;
  }
  safeLocalStorageSet(APP_TOKEN_KEY, value);
}

export function clearAppToken() {
  safeLocalStorageRemove(APP_TOKEN_KEY);
}

function isApiRequest(url) {
  try {
    const parsed = new URL(url, window.location.origin);
    return (
      parsed.origin === window.location.origin &&
      parsed.pathname.startsWith("/api/")
    );
  } catch {
    return false;
  }
}

function withAuthHeader(input, init, token) {
  const nextInit = { ...(init || {}) };
  const headers = new Headers(nextInit.headers || undefined);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  nextInit.headers = headers;
  return nextInit;
}

export function installAppTokenFetchInterceptor() {
  if (typeof window === "undefined") return;
  if (window[FETCH_GUARD_KEY]) return;

  const originalFetch = window.fetch.bind(window);
  window[FETCH_GUARD_KEY] = true;

  window.fetch = async (input, init) => {
    const token = getAppToken();
    if (!token) return originalFetch(input, init);

    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.toString()
        : input?.url || "";

    if (!isApiRequest(url)) return originalFetch(input, init);

    if (input instanceof Request) {
      const requestInit = withAuthHeader(input, init, token);
      const authRequest = new Request(input, requestInit);
      return originalFetch(authRequest);
    }

    const requestInit = withAuthHeader(input, init, token);
    return originalFetch(input, requestInit);
  };
}
