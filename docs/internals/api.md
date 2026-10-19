# The API and its clients

## Contracts

`packages/contracts` is the API's definition: an Effect `HttpApi` (`effect/http-api`, marked unstable in effect 4.0.5, so `effect` is pinned exactly), with its models and errors. Every client derives a typed client from it with `HttpApiClient.make(Api, …)`; the API implements it with `HttpApiBuilder.group`. Errors travel as `{"_tag": …}` with the status declared on the class; a TypeScript client decodes them back into the classes.

## Hosting

The API is a Nitro app whose only code is its server entry, `apps/api/server.ts`: Effect's `HttpRouter.toWebHandler` answers every request. Nitro was already in the stack for TanStack Start; it bundles the workspace's TypeScript, serves `nitro dev` on port 3001, and its Vercel preset builds one Vercel Function. Routes: `/health` (the deployed commit), `/accounts/:id`, and Better Auth at `/auth/*`.

## The web app's two ways in

- **Browser:** `/api/*` on the web's own origin (`apps/web/src/routes/api/$.ts`) forwards to the API's `/*`. The session cookie is set and sent for the web's origin only, so it is first-party. The proxy refuses cross-site browser requests, and drops the `set-auth-token` header so the token stays in the HttpOnly cookie.
- **SSR:** loaders call the API directly (`apps/web/src/lib/api.ts`), forwarding the visitor's cookie.

Both send `x-client-ip` with `API_PROXY_SECRET`, a secret the two projects share. Better Auth limits sign-in attempts per IP; without it, every browser would share the web server's IP. The API believes the claim only with the secret, so a direct caller can't choose its IP.

## Auth: cookies and bearer tokens

- **Cookies (web).** Better Auth's `baseURL` is the API's own origin (`API_URL`, or `VERCEL_URL` on Vercel). Its cookies carry no `Domain`, so the browser keeps them for the web's origin. Browser requests through the proxy carry the web's `Origin`, which Better Auth trusts through `SITE_URL`.
- **Bearer (mobile).** A sign-in answers with a `set-auth-token` header. The app stores it and sends `Authorization: Bearer <token>`; with no cookie, no origin check applies.
- **Session lifetime.** A session lasts 7 days and is extended, at most daily, only by `GET /auth/get-session`, the one endpoint that can send the refreshed cookie back. API endpoints read sessions without extending them. The web calls it on every navigation and passes its `Set-Cookie` on, during SSR as well as through the proxy. A mobile app calls it with its bearer token when it opens; the token stays the same.

## Pairing

- **Locally,** the web reads `API_URL` (`http://localhost:3001`).
- **On Vercel,** `relatedProjects` in `apps/web/vercel.json` names the API project, and Vercel fills `VERCEL_RELATED_PROJECTS`, at build and at run time. A web preview talks to the API's branch URL for the same Git branch; production talks to the API's production domain. A missing entry is an error, never a fallback to production.
- The API project must deploy every push: with "skip unaffected projects" on, a web-only change would have no API preview on its branch.
- API previews stay behind Vercel's Deployment Protection: they hold seeded accounts with a known code. The web's server (the proxy and SSR) sends the API project's protection bypass, `API_BYPASS_SECRET` in the web's Preview env; a mobile build against a preview sends it too. Production's API is public, for mobile apps.
- CI's e2e runs on the web preview's `deployment_status`, after `<web preview>/api/health` (through the proxy, so through the pairing) reports the same commit.
- Vercel names the two GitHub deployment environments `Preview – <project>`. The e2e workflow runs only for the one ending in `-web`, so the projects are named `<app>-web` and `<app>-api`.
