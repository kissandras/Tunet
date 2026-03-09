import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadTokensMock = vi.fn();
const clearOAuthTokensMock = vi.fn();

vi.mock('../services/oauthStorage', () => ({
  loadTokens: () => loadTokensMock(),
  clearOAuthTokens: () => clearOAuthTokensMock(),
}));

describe('getHomeAssistantRequestHeaders', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    loadTokensMock.mockReset();
    clearOAuthTokensMock.mockReset();
  });

  it('uses OAuth access tokens when OAuth auth is active', async () => {
    localStorage.setItem('ha_auth_method', 'oauth');
    localStorage.setItem('ha_url', 'https://ha.example');
    loadTokensMock.mockReturnValue({ access_token: 'oauth-token' });

    const { getHomeAssistantRequestHeaders } = await import('../services/apiAuth');
    expect(getHomeAssistantRequestHeaders()).toEqual({
      'x-ha-url': 'https://ha.example',
      Authorization: 'Bearer oauth-token',
    });
  });

  it('falls back to token auth stored in browser storage', async () => {
    localStorage.setItem('ha_auth_method', 'token');
    localStorage.setItem('ha_url', 'http://localhost:8123');
    localStorage.setItem('ha_fallback_url', 'http://192.168.1.20:8123');
    sessionStorage.setItem('ha_token', 'session-token');
    loadTokensMock.mockReturnValue(undefined);

    const { getHomeAssistantRequestHeaders } = await import('../services/apiAuth');
    expect(getHomeAssistantRequestHeaders()).toEqual({
      'x-ha-url': 'http://localhost:8123',
      'x-ha-fallback-url': 'http://192.168.1.20:8123',
      Authorization: 'Bearer session-token',
    });
  });

  it('does not fall back to OAuth tokens when token auth is active', async () => {
    localStorage.setItem('ha_auth_method', 'token');
    localStorage.setItem('ha_url', 'http://localhost:8123');
    loadTokensMock.mockReturnValue({ access_token: 'oauth-token' });

    const { getHomeAssistantRequestHeaders } = await import('../services/apiAuth');
    expect(getHomeAssistantRequestHeaders()).toEqual({
      'x-ha-url': 'http://localhost:8123',
    });
  });

  it('prefers the live OAuth auth access token over storage', async () => {
    localStorage.setItem('ha_auth_method', 'oauth');
    localStorage.setItem('ha_url', 'https://ha.example');
    loadTokensMock.mockReturnValue({ access_token: 'stale-token' });

    const { getHomeAssistantRequestHeaders, setOAuthAuthProvider } = await import(
      '../services/apiAuth'
    );

    setOAuthAuthProvider({ current: { accessToken: 'live-token' } });

    expect(getHomeAssistantRequestHeaders()).toEqual({
      'x-ha-url': 'https://ha.example',
      Authorization: 'Bearer live-token',
    });

    setOAuthAuthProvider(null);
  });

  it('refreshes OAuth access token when requested asynchronously', async () => {
    localStorage.setItem('ha_auth_method', 'oauth');
    localStorage.setItem('ha_url', 'https://ha.example');
    loadTokensMock.mockReturnValue({ access_token: 'stored-token' });
    const refreshAccessToken = vi.fn(async function refresh() {
      this.accessToken = 'refreshed-token';
    });

    const { getValidatedHomeAssistantRequestHeadersAsync, setOAuthAuthProvider } = await import(
      '../services/apiAuth'
    );

    setOAuthAuthProvider({ current: { accessToken: 'old-live-token', refreshAccessToken } });

    await expect(
      getValidatedHomeAssistantRequestHeadersAsync({ forceRefreshOAuth: true })
    ).resolves.toEqual({
      'x-ha-url': 'https://ha.example',
      Authorization: 'Bearer refreshed-token',
    });
    expect(refreshAccessToken).toHaveBeenCalledTimes(1);

    setOAuthAuthProvider(null);
  });
});