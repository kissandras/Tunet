import { clearOAuthTokens, loadTokens } from './oauthStorage';

export const HOME_ASSISTANT_API_UNAUTHORIZED_EVENT = 'tunet:api-auth-unauthorized';

let oauthAuthProvider = null;

export const getStoredAuthMethod = () => {
  try {
    return globalThis.localStorage?.getItem('ha_auth_method') || 'oauth';
  } catch {
    return 'oauth';
  }
};

const isOAuthAuthMethod = () => getStoredAuthMethod() === 'oauth';

const getOAuthAuth = () => oauthAuthProvider?.current ?? null;

const getStoredToken = () => {
  try {
    const authMethod = getStoredAuthMethod();
    if (authMethod === 'oauth') {
      const oauthToken = loadTokens()?.access_token;
      if (oauthToken) return oauthToken;
      return '';
    }

    return globalThis.localStorage?.getItem('ha_token') || globalThis.sessionStorage?.getItem('ha_token') || '';
  } catch {
    return '';
  }
};

const getCurrentOAuthAccessToken = () => {
  const auth = getOAuthAuth();
  if (typeof auth?.accessToken === 'string' && auth.accessToken) {
    return auth.accessToken;
  }

  return loadTokens()?.access_token || '';
};

const clearStoredTokenAuth = () => {
  try {
    globalThis.localStorage?.removeItem('ha_token');
    globalThis.sessionStorage?.removeItem('ha_token');
  } catch {
    // ignore storage errors
  }
};

const createUnauthorizedError = (message) => {
  const error = new Error(message);
  error.status = 401;
  error.body = { error: message };
  return error;
};

export function notifyHomeAssistantApiUnauthorized(message = 'Home Assistant authentication failed') {
  const authMethod = getStoredAuthMethod();

  if (authMethod === 'oauth') {
    clearOAuthTokens();
  } else {
    clearStoredTokenAuth();
  }

  if (typeof globalThis.window !== 'undefined') {
    globalThis.window.dispatchEvent(
      new globalThis.CustomEvent(HOME_ASSISTANT_API_UNAUTHORIZED_EVENT, {
        detail: {
          authMethod,
          message,
        },
      })
    );
  }

  return createUnauthorizedError(message);
}

export function setOAuthAuthProvider(provider) {
  oauthAuthProvider = provider ?? null;
}

export async function refreshOAuthAccessToken() {
  if (!isOAuthAuthMethod()) {
    return getStoredToken();
  }

  const auth = getOAuthAuth();
  if (typeof auth?.refreshAccessToken === 'function') {
    await auth.refreshAccessToken();
    if (typeof auth?.accessToken === 'string' && auth.accessToken) {
      return auth.accessToken;
    }
  }

  return getCurrentOAuthAccessToken();
}

const getStoredUrl = () => {
  try {
    return globalThis.localStorage?.getItem('ha_url') || '';
  } catch {
    return '';
  }
};

const getStoredFallbackUrl = () => {
  try {
    return globalThis.localStorage?.getItem('ha_fallback_url') || '';
  } catch {
    return '';
  }
};

export function getHomeAssistantRequestHeaders() {
  const headers = {};
  const haUrl = getStoredUrl();
  const fallbackUrl = getStoredFallbackUrl();
  const accessToken = isOAuthAuthMethod() ? getCurrentOAuthAccessToken() : getStoredToken();

  if (haUrl) {
    headers['x-ha-url'] = haUrl;
  }

  if (fallbackUrl) {
    headers['x-ha-fallback-url'] = fallbackUrl;
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

export async function getHomeAssistantRequestHeadersAsync({ forceRefreshOAuth = false } = {}) {
  const headers = {};
  const haUrl = getStoredUrl();
  const fallbackUrl = getStoredFallbackUrl();
  const accessToken = forceRefreshOAuth
    ? await refreshOAuthAccessToken()
    : isOAuthAuthMethod()
      ? getCurrentOAuthAccessToken()
      : getStoredToken();

  if (haUrl) {
    headers['x-ha-url'] = haUrl;
  }

  if (fallbackUrl) {
    headers['x-ha-fallback-url'] = fallbackUrl;
  }

  if (accessToken) {
    headers.Authorization = `Bearer ${accessToken}`;
  }

  return headers;
}

export function hasHomeAssistantRequestAuth() {
  const headers = getHomeAssistantRequestHeaders();
  return Boolean(headers['x-ha-url'] && headers.Authorization);
}

export function getValidatedHomeAssistantRequestHeaders() {
  const headers = getHomeAssistantRequestHeaders();

  if (!headers['x-ha-url']) {
    throw notifyHomeAssistantApiUnauthorized('Missing Home Assistant URL');
  }

  if (!headers.Authorization) {
    throw notifyHomeAssistantApiUnauthorized('Missing Home Assistant bearer token');
  }

  return headers;
}

export async function getValidatedHomeAssistantRequestHeadersAsync(options = {}) {
  const headers = await getHomeAssistantRequestHeadersAsync(options);

  if (!headers['x-ha-url']) {
    throw notifyHomeAssistantApiUnauthorized('Missing Home Assistant URL');
  }

  if (!headers.Authorization) {
    throw notifyHomeAssistantApiUnauthorized('Missing Home Assistant bearer token');
  }

  return headers;
}
