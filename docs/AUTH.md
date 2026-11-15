# Signing in

Weather Scout has three ways to sign in. They all work together.

| Way | Set up in | Good for |
| --- | --- | --- |
| Username + password | *Family & settings → People* | Everyone, no extra software |
| **Sign in with…** (OpenID Connect) | *Family & settings → Sign-in providers* | Tinyauth, Authelia, Authentik, Pocket ID, Google… |
| Forward-auth headers | `AUTH_TRUST_PROXY_HEADERS=true` + your reverse proxy | Tinyauth/Authelia in front of the whole app |

## Sign in with an OpenID Connect provider (recommended)

1. In your provider, make a client (an "app") for Weather Scout. Set its **redirect URL** to the
   one shown under *Family & settings → Sign-in providers*, which is
   `https://<your weather scout address>/api/auth/oidc/callback`.
   If you reach Weather Scout by more than one address, set `PUBLIC_URL` (*App → Email alerts*)
   so the redirect URL is always the same.
2. In Weather Scout, open *Family & settings → Sign-in providers → Add a provider* and fill in:
   - **Name on the sign-in button**, for example `Tinyauth`.
   - **Issuer URL**, for example `https://auth.example.com`. Weather Scout reads
     `<issuer>/.well-known/openid-configuration` when you save, so a typo is caught right away.
   - **Client ID** and **Client secret** from step 1. The secret is stored on the server and is
     never shown again; leave it empty when editing to keep it.
   - **Extra scopes** only if your provider needs them. `openid profile email` are always asked for.
3. Decide who gets in:
   - **Create an account for anyone who signs in with it** off (the default): only people you have
     linked can sign in. Under *People*, click **link** and type their username or email at the
     provider. Their first sign-in is remembered from then on.
   - On: anyone the provider lets in gets a new, non-admin profile. Only do this for a provider that
     only lets in people you trust (your own Tinyauth). Never for Google.
4. Link existing profiles. Either way works:
   - **The person links it themselves.** Signed in with their password, they open
     *Settings → 🔐 Sign-in accounts* and tap **Link Tinyauth**. After the trip to Tinyauth, that
     Tinyauth account signs in to their profile. They can unlink it there too, unless it is their
     only way in (no password and nothing else linked).
   - **An admin links it.** Under *People*, click **link** and type the person's username or email
     at the provider; it links on their next sign-in. Linked accounts are listed under it, each with
     an **unlink** button. Admins can unlink anyone.
   One provider account can only be linked to one profile.
5. Untick **Show on the sign-in page** to hide a provider's button without deleting it.

Sign-in uses the authorization code flow with PKCE. The ID token's signature, issuer, audience,
expiry and nonce are all checked before anyone is signed in.

## Forward-auth headers (Tinyauth in front of everything)

The proxy signs people in and passes `Remote-User`, `Remote-Email` and `Remote-Name`. Set
`AUTH_TRUST_PROXY_HEADERS=true` (Unraid: *Trust tinyauth headers*) and the SSO sign-out address in
*Family & settings → App*. Only do this when the app can be reached **only** through the proxy,
otherwise anyone could send a fake `Remote-User` header. See the Traefik example in
[ARCHITECTURE.md](ARCHITECTURE.md#sign-in-model).
