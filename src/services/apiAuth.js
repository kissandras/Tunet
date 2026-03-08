import { loadTokens } from './oauthStorage';

const getStoredToken = () => {
  try {
    const authMethod = globalThis.localStorage?.getItem('ha_auth_method') || 'oauth';
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
  const accessToken = getStoredToken();

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
