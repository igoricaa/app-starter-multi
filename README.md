# app-starter-multi

app-kit's starter for custom apps whose backend serves more than one client: an Effect `HttpApi` on Vercel over Neon Postgres with Drizzle, Better Auth with email codes (cookies for the web, bearer tokens for mobile), and a TanStack Start web app with shadcn/ui on Base UI.

New apps are created from this template by `/app-setup`, the user-level skill in [igoricaa/app-kit](https://github.com/igoricaa/app-kit). It also wires the app's services.

## Inside

- `packages/contracts`: the API's contract, which every client imports.
- `apps/api`: the backend, its own Vercel project. The account endpoints are the reference slice, with tests on real PostgreSQL, over HTTP too.
- `apps/web`: the web app, another Vercel project. It reaches the API through its own `/api/*` proxy, and each preview talks to the API preview of its branch.
- Sign-in with email codes, a seeded test account, and one Playwright test of the flow through the web app.
- CI: `verify` on every PR and on `main`; `e2e` against each web preview, once its API preview reports the same commit (a commit a newer push superseded is skipped); `cleanup` deletes a closed PR's Neon branch.
- Production: a push with only docs changes since the last production deployment skips both production builds (each app's `vercel.json`).
- The kit's agent files: `AGENTS.md`, the skills in `.agents/skills/`, `docs/agents/` and `.coderabbit.yaml`.

## Links

- [`AGENTS.md`](AGENTS.md): how to work here. Read it first.
- [`docs/internals/api.md`](docs/internals/api.md): the contracts, the proxy, auth and pairing.
- [`docs/internals/effect-services.md`](docs/internals/effect-services.md): Effect, database and auth rules.

PRs labelled `coderabbit` get a CodeRabbit review; `/build` adds the label to important, high-stakes or bigger PRs.
