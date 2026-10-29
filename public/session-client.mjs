const KEY = 'open-view.ui-session.v1';
const TOKEN = /^[a-f0-9]{64}$/;

/** The UI capability is attached only to this origin's API, never to application traffic. */
export function createSessionClient({ baseUrl, storage, fetchImpl = globalThis.fetch, now = Date.now }) {
  const origin = new URL(baseUrl).origin;
  let session = null;
  const clear = () => { session = null; try { storage?.removeItem(KEY); } catch {} };
  const valid = value => value?.origin === origin && TOKEN.test(value.accessToken)
    && Number.isFinite(value.expiresAt) && now() < value.expiresAt;
  try { const saved = JSON.parse(storage?.getItem(KEY) || 'null'); if (valid(saved)) session = saved; else clear(); } catch { clear(); }
  const endpoint = value => {
    const url = new URL(value, origin);
    if (url.origin !== origin || !url.pathname.startsWith('/api/') || url.username || url.password || url.hash) {
      throw new Error('UI credentials cannot be sent outside the Open View API');
    }
    return url.href;
  };
  return {
    async bootstrap(capability) {
      if (!TOKEN.test(capability)) throw new Error('Invalid login link');
      const response = await fetchImpl(endpoint('/api/session'), {
        method: 'POST', headers: { Authorization: `Bearer ${capability}` },
        credentials: 'omit', mode: 'same-origin', redirect: 'error', cache: 'no-store',
      });
      if (!response.ok) throw new Error('로그인 링크가 만료되었거나 이미 사용되었습니다. 터미널에서 auth를 입력하세요.');
      const result = await response.json();
      const next = { origin, accessToken: result.accessToken, expiresAt: result.expiresAt };
      if (!valid(next)) throw new Error('Invalid session response');
      session = next;
      try { storage?.setItem(KEY, JSON.stringify(next)); } catch { /* Memory-only mode when storage is disabled. */ }
    },
    async request(value, init = {}) {
      const url = endpoint(value); // Check before touching credentials or transport.
      if (!valid(session)) clear();
      const headers = new Headers(init.headers);
      headers.delete('Authorization');
      if (session) headers.set('Authorization', `Bearer ${session.accessToken}`);
      const response = await fetchImpl(url, { ...init, headers,
        credentials: 'omit', mode: 'same-origin', redirect: 'error', cache: 'no-store',
      });
      if (response.status === 401) clear();
      return response;
    },
    async logout() {
      try { await this.request('/api/session', { method: 'DELETE' }); } finally { clear(); }
    },
    hasSession() { if (!valid(session)) clear(); return session !== null; },
  };
}
