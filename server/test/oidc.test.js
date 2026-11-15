import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { testApp, cookieFrom, mockFetch } from './helpers.js';

const ISSUER = 'https://auth.example.com';
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', use: 'sig', alg: 'RS256' };

function sign(payload, { key = privateKey, kid = 'k1' } = {}) {
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const head = enc({ alg: 'RS256', typ: 'JWT', kid });
  const body = enc(payload);
  const sig = crypto.sign('sha256', Buffer.from(`${head}.${body}`), key).toString('base64url');
  return `${head}.${body}.${sig}`;
}

// A pretend Tinyauth: discovery, keys and a token endpoint that hands back
// whatever claims the test sets, with the nonce from the authorize request.
function fakeProvider(claims = {}) {
  const state = { claims: { sub: 'u-123', preferred_username: 'sam', email: 'sam@example.com', name: 'Sam', ...claims }, nonce: null, tokenRequests: [], override: null };
  const json = (b, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
  const fetchImpl = mockFetch({
    [`${ISSUER}/.well-known/openid-configuration`]: () => json({
      issuer: ISSUER, authorization_endpoint: `${ISSUER}/authorize`, token_endpoint: `${ISSUER}/api/oidc/token`,
      jwks_uri: `${ISSUER}/.well-known/jwks.json`, userinfo_endpoint: `${ISSUER}/api/oidc/userinfo`,
    }),
    [`${ISSUER}/.well-known/jwks.json`]: () => json({ keys: [jwk] }),
    [`${ISSUER}/api/oidc/token`]: (u, opts) => {
      state.tokenRequests.push(opts);
      if (state.override) return state.override();
      const now = Math.floor(Date.now() / 1000);
      return json({ access_token: 'at', id_token: sign({ iss: ISSUER, aud: 'client-1', exp: now + 300, iat: now, nonce: state.nonce, ...state.claims }) });
    },
  });
  return { fetchImpl, state };
}

async function setup(provider = {}, claims = {}) {
  const fp = fakeProvider(claims);
  const { app } = await testApp({ fetchImpl: fp.fetchImpl, env: { ADMIN_USERNAME: 'boss', ADMIN_PASSWORD: 'password123' } });
  const login = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'boss', password: 'password123' } });
  const admin = cookieFrom(login);
  const res = await app.inject({
    method: 'POST', url: '/api/admin/oidc-providers', headers: { cookie: admin },
    payload: { name: 'Tinyauth', issuer: `${ISSUER}/`, clientId: 'client-1', clientSecret: 'shh-secret', ...provider },
  });
  assert.equal(res.statusCode, 201, res.body);
  return { app, admin, provider: res.json().provider, fp };
}

// Click the button, "sign in" at the provider, come back.
async function signIn(app, fp, providerId, tamper = (q) => q) {
  const start = await app.inject(`/api/auth/oidc/${providerId}/login`);
  assert.equal(start.statusCode, 302);
  const to = new URL(start.headers.location);
  fp.state.nonce = to.searchParams.get('nonce');
  const q = tamper({ code: 'the-code', state: to.searchParams.get('state') });
  const back = await app.inject({ url: `/api/auth/oidc/callback?${new URLSearchParams(q)}`, headers: { cookie: cookieFrom(start) } });
  return { start, to, back };
}

const sessionCookie = (res) => [res.headers['set-cookie']].flat().find((c) => c.startsWith('ws_session='))?.split(';')[0];

test('admin can add a provider; the secret is never sent back', async () => {
  const { app, admin, provider } = await setup();
  assert.equal(provider.issuer, ISSUER); // trailing slash trimmed
  assert.equal(provider.hasSecret, true);
  const list = (await app.inject({ url: '/api/admin/oidc-providers', headers: { cookie: admin } }));
  assert.ok(!list.body.includes('shh-secret'));
  assert.match(list.json().callbackUrl, /\/api\/auth\/oidc\/callback$/);
  // An empty secret on edit keeps the saved one.
  const edit = await app.inject({ method: 'PATCH', url: `/api/admin/oidc-providers/${provider.id}`, headers: { cookie: admin }, payload: { name: 'Home', clientSecret: '' } });
  assert.equal(edit.json().provider.hasSecret, true);
  assert.equal(edit.json().provider.name, 'Home');
  // Guests can't see the admin list but do see the button.
  assert.equal((await app.inject('/api/admin/oidc-providers')).statusCode, 401);
  assert.deepEqual((await app.inject('/api/config')).json().auth.oidc, [{ id: provider.id, name: 'Home' }]);
  await app.close();
});

test('a wrong issuer is caught when saving', async () => {
  const { app, admin } = await setup();
  const res = await app.inject({ method: 'POST', url: '/api/admin/oidc-providers', headers: { cookie: admin }, payload: { name: 'X', issuer: 'https://nope.example.com', clientId: 'c' } });
  assert.equal(res.statusCode, 502);
  assert.match(res.json().error, /Could not reach|answered 404/);
  await app.close();
});

test('hidden providers have no button', async () => {
  const { app } = await setup({ showOnLogin: false });
  assert.deepEqual((await app.inject('/api/config')).json().auth.oidc, []);
  await app.close();
});

test('sign-in sends PKCE and the client secret, and links through the SSO link', async () => {
  const { app, admin, provider, fp } = await setup();
  // Without a link and with auto-create off, nobody gets in.
  let r = await signIn(app, fp, provider.id);
  assert.match(r.back.headers.location, /^\/\?signin_error=.*No%20Weather%20Scout%20profile/);
  assert.equal(sessionCookie(r.back), undefined);

  // Link Sam's Tinyauth username to an existing profile.
  const made = await app.inject({ method: 'POST', url: '/api/admin/users', headers: { cookie: admin }, payload: { username: 'sammy', password: 'password123', ssoSubject: 'sam' } });
  const samId = made.json().user.id;
  r = await signIn(app, fp, provider.id);
  assert.equal(r.to.origin + r.to.pathname, `${ISSUER}/authorize`);
  assert.equal(r.to.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(r.to.searchParams.get('scope'), 'openid profile email');
  assert.equal(r.back.headers.location, '/');
  const tokenReq = fp.state.tokenRequests.at(-1);
  assert.match(tokenReq.headers.authorization, /^Basic /);
  assert.match(tokenReq.body, /code_verifier=/);
  const me = await app.inject({ url: '/api/auth/me', headers: { cookie: sessionCookie(r.back) } });
  assert.equal(me.json().user.id, samId);

  // Next time it is remembered by the provider's subject, even if the username changes.
  fp.state.claims.preferred_username = 'samuel';
  r = await signIn(app, fp, provider.id);
  assert.equal((await app.inject({ url: '/api/auth/me', headers: { cookie: sessionCookie(r.back) } })).json().user.id, samId);
  const users = (await app.inject({ url: '/api/admin/users', headers: { cookie: admin } })).json().users;
  assert.deepEqual(users.find((u) => u.id === samId).linked.map((l) => [l.name, l.label]), [['Tinyauth', 'samuel']]);
  await app.close();
});

test('auto-create makes a regular profile on first sign-in', async () => {
  const { app, provider, fp } = await setup({ autoCreate: true }, { sub: 'new-1', preferred_username: 'kiddo', name: 'Kiddo K' });
  const r = await signIn(app, fp, provider.id);
  const me = (await app.inject({ url: '/api/auth/me', headers: { cookie: sessionCookie(r.back) } })).json().user;
  assert.equal(me.username, 'kiddo');
  assert.equal(me.displayName, 'Kiddo K');
  assert.equal(me.isAdmin, false);
  assert.equal(me.ssoSubject, 'kiddo');
  await app.close();
});

test('bad state, bad nonce, wrong audience and a forged signature are all refused', async () => {
  const { app, provider, fp } = await setup({ autoCreate: true });
  const fails = async (tamper, pattern) => {
    const r = await signIn(app, fp, provider.id, tamper);
    assert.match(decodeURIComponent(r.back.headers.location), pattern);
    assert.equal(sessionCookie(r.back), undefined);
  };
  await fails((q) => ({ ...q, state: 'other' }), /did not match/);
  fp.state.claims.nonce = 'stale';
  await fails((q) => q, /did not match this sign-in/);
  delete fp.state.claims.nonce;
  fp.state.claims.aud = 'someone-else';
  await fails((q) => q, /different client ID/);
  delete fp.state.claims.aud;
  const { privateKey: evil } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  fp.state.override = () => new Response(JSON.stringify({ id_token: sign({ iss: ISSUER, aud: 'client-1', exp: Math.floor(Date.now() / 1000) + 300, nonce: fp.state.nonce, sub: 'x' }, { key: evil }) }), { headers: { 'content-type': 'application/json' } });
  await fails((q) => q, /signature/);
  fp.state.override = () => new Response(JSON.stringify({ error: 'invalid_client' }), { status: 401, headers: { 'content-type': 'application/json' } });
  await fails((q) => q, /invalid_client/);
  // No flow cookie at all (someone else's link).
  const back = await app.inject(`/api/auth/oidc/callback?code=x&state=y`);
  assert.match(decodeURIComponent(back.headers.location), /took too long|another browser/);
  await app.close();
});

test('provider sign-in works when the server requires sign-in', async () => {
  const fp = fakeProvider();
  const { app } = await testApp({ fetchImpl: fp.fetchImpl, env: { AUTH_REQUIRED: 'true' } });
  assert.equal((await app.inject('/api/auth/oidc/99/login')).statusCode, 302);
  assert.equal((await app.inject('/api/auth/oidc/callback')).statusCode, 302);
  await app.close();
});

// Start "Link Tinyauth" from a signed-in profile and come back.
async function linkFrom(app, fp, providerId, cookie, tamper = (q) => q) {
  const start = await app.inject({ url: `/api/auth/oidc/${providerId}/link`, headers: { cookie } });
  assert.equal(start.statusCode, 302);
  const to = new URL(start.headers.location);
  fp.state.nonce = to.searchParams.get('nonce');
  const q = tamper({ code: 'the-code', state: to.searchParams.get('state') });
  return app.inject({ url: `/api/auth/oidc/callback?${new URLSearchParams(q)}`, headers: { cookie: `${cookie}; ${cookieFrom(start)}` } });
}

test('a signed-in person links their own Tinyauth account, then signs in with it', async () => {
  const { app, admin, provider, fp } = await setup();
  await app.inject({ method: 'POST', url: '/api/admin/users', headers: { cookie: admin }, payload: { username: 'mom', password: 'password123' } });
  const mom = cookieFrom(await app.inject({ method: 'POST', url: '/api/auth/login', payload: { username: 'mom', password: 'password123' } }));
  // Not linked yet: sign-in with Tinyauth is turned away.
  assert.match((await signIn(app, fp, provider.id)).back.headers.location, /signin_error/);

  const back = await linkFrom(app, fp, provider.id, mom);
  assert.equal(back.headers.location, '/?accounts_linked=Tinyauth');
  assert.equal(sessionCookie(back), undefined); // still the same session
  const mine = (await app.inject({ url: '/api/me/identities', headers: { cookie: mom } })).json();
  assert.deepEqual(mine.linked.map((l) => [l.name, l.label]), [['Tinyauth', 'sam']]);
  assert.deepEqual(mine.providers, [{ id: provider.id, name: 'Tinyauth' }]);

  const r = await signIn(app, fp, provider.id);
  assert.equal((await app.inject({ url: '/api/auth/me', headers: { cookie: sessionCookie(r.back) } })).json().user.username, 'mom');

  // Someone else can't take the same Tinyauth account.
  const boss = await linkFrom(app, fp, provider.id, admin);
  assert.match(decodeURIComponent(boss.headers.location), /accounts_error=That Tinyauth account is already linked to mom/);

  // Mom has a password, so she can unlink it herself.
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/me/identities/${provider.id}`, headers: { cookie: mom } })).statusCode, 200);
  assert.deepEqual((await app.inject({ url: '/api/me/identities', headers: { cookie: mom } })).json().linked, []);
  await app.close();
});

test('linking needs a signed-in session that lasts the whole trip', async () => {
  const { app, admin, provider, fp } = await setup();
  const guest = await app.inject(`/api/auth/oidc/${provider.id}/link`);
  assert.match(decodeURIComponent(guest.headers.location), /signin_error=Sign in first/);
  // Started signed in, came back signed out.
  const start = await app.inject({ url: `/api/auth/oidc/${provider.id}/link`, headers: { cookie: admin } });
  const to = new URL(start.headers.location);
  fp.state.nonce = to.searchParams.get('nonce');
  const back = await app.inject({ url: `/api/auth/oidc/callback?code=c&state=${to.searchParams.get('state')}`, headers: { cookie: cookieFrom(start) } });
  assert.match(decodeURIComponent(back.headers.location), /accounts_error=You were signed out/);
  await app.close();
});

test('people cannot unlink their last way in, but an admin can unlink anyone', async () => {
  const { app, admin, provider, fp } = await setup({ autoCreate: true }, { sub: 'kid-1', preferred_username: 'kiddo' });
  const r = await signIn(app, fp, provider.id);
  const kid = sessionCookie(r.back);
  const kidId = (await app.inject({ url: '/api/auth/me', headers: { cookie: kid } })).json().user.id;
  const self = await app.inject({ method: 'DELETE', url: `/api/me/identities/${provider.id}`, headers: { cookie: kid } });
  assert.equal(self.statusCode, 400);
  assert.match(self.json().error, /only way to sign in/);
  // Admin-only route.
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/admin/users/${kidId}/identities/${provider.id}`, headers: { cookie: kid } })).statusCode, 403);
  let users = (await app.inject({ url: '/api/admin/users', headers: { cookie: admin } })).json().users;
  assert.equal(users.find((u) => u.id === kidId).linked.length, 1);
  assert.equal((await app.inject({ method: 'DELETE', url: `/api/admin/users/${kidId}/identities/${provider.id}`, headers: { cookie: admin } })).statusCode, 200);
  users = (await app.inject({ url: '/api/admin/users', headers: { cookie: admin } })).json().users;
  assert.deepEqual(users.find((u) => u.id === kidId).linked, []);
  await app.close();
});
