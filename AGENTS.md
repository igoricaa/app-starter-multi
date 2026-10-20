# App Starter (multi-client)

The app-kit starter for custom apps whose backend serves more than one client: an Effect `HttpApi` on Vercel over Neon Postgres with Drizzle, Better Auth with email codes, and a TanStack Start web app; mobile apps and other clients use the same API. Shape replaces this paragraph with what the app is, who uses it, and what makes it special.

## A note from Igor

I like simple systems and software that feels obvious. Don't preserve complexity because it already exists, and don't add machinery because it looks impressive. Understand the real constraint, then build the smallest thing that makes the correct behaviour unsurprising.

Measure twice, cut once, and YAGNI. Fight scope creep.

Treat this file as good defaults, not hard rules. If a rule fights the task in front of you, say so and ask before breaking it.

## The ways to hurt yourself

1. **Touching production.**
   - Never run a migration or a script against production's database, `vercel --prod`, or `vercel env pull` for production.
   - Production changes only by merging to `main`; Vercel's builds migrate and deploy it (`apps/api/scripts/vercel-build.sh`, `apps/web/scripts/vercel-build.sh`).
   - Never read, print or copy a production URL or key.
2. **Printing secrets.** Never echo, log or commit one. Generate a secret and pipe it straight in: `openssl rand -base64 32 | vercel env add BETTER_AUTH_SECRET preview --cwd apps/api`, from the main checkout (setup linked both app folders).
3. **Breaking clients you don't deploy.** Users keep the old web app open after a deploy, and mobile apps stay on old versions for months. So a contract in `packages/contracts` changes only additively: new endpoints, new optional fields. Removals and renames need a new endpoint, and the old one stays until no client calls it. A new literal, union member or tag in a response breaks old mobile clients' decode; add a field or a new endpoint instead.
4. **Narrowing data in one step.** It takes three PRs: widen the schema, backfill, then narrow, and only after the backfill has completed. Igor takes a backup first.
5. **Editing an applied migration.** Change `apps/api/src/schema.ts`, run `bun run --cwd apps/api db:generate`, and commit the new folder in `apps/api/drizzle/`.
6. **Migrating dev from a worktree.** Worktrees share the Neon `dev` branch through `apps/api/.env.local`. Builders test with `bun run --filter @app/api test`, which starts its own PostgreSQL; only `/build`'s integration check runs `bun run --cwd apps/api db:migrate` against dev.

## Hit every surface

The most common defect is a change that works on the path you tested and is missing everywhere else. Before calling work done, walk this list and say which entries applied:

- **Clients:** the web app and the mobile app, and any other client of the API. A change to an endpoint reaches every one of them.
- **Contracts:** `packages/contracts` describes what the API accepts and returns. Change it first, additively, and let the type errors show every caller.
- **Entry points:** every route, nav item and link that reaches the feature.
- **Roles and tenants:** who may see or do it, and what everyone else sees.
- **Reverse states:** a way in needs a way out and a way to see it.
- **Loading, empty and error states,** at 1440 and 390.
- **Email:** any message the change sends or should send.
- **Seed data:** a new kind of record needs seed rows, so previews show it.
- **Docs:** whether the change makes existing guidance wrong.

## Dev servers

- `bun run setup` installs dependencies and checks out Effect's source in `.repos/effect`. New worktrees run it from `t3.json`, and get both `.env.local` files and `.repos` linked from the main checkout.
- `bun run dev` runs the API on port 3001 (`nitro dev`) and the web app on 3000 (Vite), against the Neon `dev` branch in `apps/api/.env.local`. A busy port fails instead of moving.
- Builders never run dev servers. Only `/build`'s integration check runs `bun run dev`, in the batch's worktree.
- Stop what you started, by the PIDs you captured: the API's and the web's servers, not only `bun run dev`, which leaves them running when it is killed. Never kill by name or pattern.

## Test data

- `bun run --cwd apps/api seed` creates the seeded accounts (see `apps/api/src/auth.ts`). It refuses wherever `TEST_OTP_CODE` is unset, which includes production.
- Sign in as a seeded account with the code in `TEST_OTP_CODE`. It works only in dev and previews, and only for seeded addresses.
- Use the code without printing it: `TEST_OTP_CODE="$(grep ^TEST_OTP_CODE= apps/api/.env.local | cut -d= -f2-)" bunx playwright test`.
- Each branch's API previews share one Neon database branch, migrated and seeded on every deploy. Previews send no mail.

## Verifying

- **Smallest proof:** format the files you touched with `bunx oxfmt <files>`; run the tests that cover the change, plus type-aware lint and typecheck. CI runs the full suite.
- **Tests need PostgreSQL 18** (`brew install postgresql@18`). They start a throwaway cluster, and each test layer gets a fresh copy of the migrated database.
- **Backend changes** ship with focused tests at the service boundary: who may call it, whose data it touches, and the error codes. Copy `apps/api/src/AccountService.test.ts`. A new endpoint or auth path also gets a case in `apps/api/src/http.test.ts`.
- **Test meaningful behaviour.** No static-render tests, no tests that mirror the implementation, no snapshots.
- **End-to-end:** one Playwright test (sign-in, through the web app). Add one only for a flow whose breaking would really hurt.
- **No browsers** unless `/build`'s integration check or Igor asks.

## Pull requests

- Conventional commit titles in plain language, with the Linear key: `feat(account): edit display name (APP-12)`.
- The body follows `/build`.
- Merging deploys production. CI green means verify, the Vercel build and the preview e2e for the head SHA; confirm e2e itself passed (`gh pr checks <n> --json name,bucket --jq '.[] | select(.name == "e2e") | .bucket'` prints `pass`).

## Documentation

Most changes need no doc change. Agents can read the code.
- **`docs/internals/`** is for constraints that span files and traps that are hard to see in the source. Before adding a paragraph, ask what a maintainer would get wrong without it.
- **Rewrite or delete** text that a change makes untrue. Never append a second account.
- **`GLOSSARY.md`** holds terms only.
- **`docs/adr/`** is for decisions that are hard to reverse, surprising, and a real trade-off.
- **`docs/decisions.md`** holds product rules in force, one line each, added only on Igor's yes.

## Plans and work artifacts

- Never commit plans, research notes, reports, handovers or scratch files.
- Specs and tickets live in Linear (`docs/agents/issue-tracker.md`). A merged PR is the implementation record.
- Research is saved only when Igor says so.

## How it works

Read `docs/internals/api.md` for the contracts, the proxy, auth and pairing.

- **Three packages:** `packages/contracts` (the `HttpApi` definition, its models and errors), `apps/api` (the backend, its own Vercel project) and `apps/web` (the UI, another Vercel project). Only the API touches the database.
- **Data:** web routes load data on the server with `ensureQueryData`, calling the API through the typed client in `apps/web/src/lib/api.ts`. An endpoint handler makes one Effect service call; services query Postgres with Drizzle.
- **Auth:** Better Auth runs inside the API at `/auth/*`, with its own connection pool.
  - The browser reaches it through the web app's `/api/*` proxy, so its session cookie is first-party; mobile clients call the API directly with a bearer token.
  - The web's root route reads the session on the server, so signed-in pages render with data; `_authed` redirects signed-out visitors on the server.
- **Database:** Neon, through Vercel's Neon integration on the API project. The API uses the pooled `DATABASE_URL`; migrations need the direct `DATABASE_URL_UNPOOLED`.
- **Deploys:** each push builds both projects.
  - The API's build (`apps/api/scripts/vercel-build.sh`) refuses a production build from any branch but `main`, `TEST_OTP_CODE` in production, `RESEND_API_KEY` on a preview, and a preview whose database isn't plainly another Neon endpoint than production's (`apps/api/scripts/database-host.ts`). It migrates under an advisory lock, so concurrent deploys apply migrations one at a time; previews are then seeded; then it builds.
  - The web's build refuses production from any branch but `main`.
  - An API preview gets its branch's own Neon database branch, copied from `dev` (the Neon project's default branch, so previews hold no production data) and deleted when its PR closes (`.github/workflows/cleanup.yml`). Production uses `main`. A web preview talks to the API preview of the same branch.

## Where code lives

- `packages/contracts/src/`: the API's contract, imported by every client. `effect` is its only dependency.
- `apps/api/src/`: the backend.
  - Read `.repos/effect/LLMS.md` and `docs/internals/effect-services.md` before writing Effect code.
  - `http.ts` implements the contract and mounts Better Auth; `server.ts` (Nitro's entry) turns it into the one web handler.
  - `schema.ts` is the database schema; `drizzle/` holds the generated migrations.
- **The reference slice:** `packages/contracts/src/api.ts` (the account group), `apps/api/src/AccountService.ts` and its test, its handlers in `apps/api/src/http.ts`, and `apps/web/src/routes/_authed/account.tsx`. Copy its shape for new features.
- `apps/api/scripts/`: the Vercel build and its guard, migrations and seed. `apps/api/tests/`: the test database and layers.
- `apps/web/src/routes/`: pages (file routes); `_authed/` needs a session; `api/$.ts` is the proxy.
- `apps/web/src/components/ui/`: shadcn components (Base UI). They own their look.
- `apps/web/src/lib/`: the API client, the auth client and the browser side of errors. `apps/web/src/server/upstream.ts` finds the paired API and builds the proxy's requests to it.
- `scripts/setup.ts`; `tests/e2e/` holds the one Playwright test.

## Taste

- **Every endpoint** is declared in the contract with its success and error schemas; its handler makes one service call. Logic lives in services.
- **Errors a client may see** are `Schema.TaggedError`s in `packages/contracts/src/errors.ts`, declared on the endpoint. Anything else is a defect: logged, answered with a bare 500.
- **Identity** comes from `CurrentUser`, never from input.
- **Ownership and tenancy** go in the query itself: one `update … where id and owner … returning` statement, never a read then a write. Another user's record answers `NotFound`.
- **External services:** an Effect service, provided in `apps/api/src/http.ts`.
- **Validation** uses Effect Schema. No Zod unless a dependency forces it.
- **UI components own their look.** Pick a `variant` or `size`; never restyle one with `className`. Layout goes on a wrapping element. `@shadcn/lint` enforces it. See `docs/internals/web-ui.md` once the UI foundation writes it.
- Inferred types over annotations. `any` is the enemy.
- **Comments** describe how a thing is used, mostly on functions. Never narrate lines. A lint or type suppression carries its reason.

<!-- app-kit:start (kit-owned; refresh replaces this block) -->
## Sessions

Igor starts every session, and each one ends by naming the next command.
- **Setup:** `/app-setup`.
- **Shape,** one unbroken session:
  1. `/grill-with-docs`. Terms go in `GLOSSARY.md`; an ADR only when a decision is hard to reverse, surprising and a real trade-off.
  2. **One screen for Igor to approve:** the technical approach and the spec outline (data model sketch, key libraries, departures from the kit's defaults, scope in and out, main flows, key decisions, risky parts, test seams), and a `Design:` line: Paper first, or straight to code.
  3. `/to-spec`, written into a Linear parent issue. Its seam check is answered "as outlined".
  4. **The spec challenge,** by stakes (see Routing). Its findings update the spec.
  5. A one-screen overview: what the challenge changed, and any questions.
  6. **Paper first:** stop here. Igor runs `/design`, then `/to-tickets <spec>`, because screen tickets name their frames.
  7. `/to-tickets`.
  8. Before `/build`, commit `GLOSSARY.md`, ADRs and `docs/decisions.md` straight to `main` (docs only), so builders' worktrees see them.
- **Build:** `/build`, a fresh session per batch. Merging deploys production.
- **Tiny tweaks** (copy, spacing, a label) go straight to `main`, with no PR and no review.

## Routing

Every dispatch pins its model and effort. Never Haiku. At most 6 Opus agents at high or xhigh at once, and 10 agents in total, nested included. Codex models (Sol, Astra) run through T3 `delegate_task`. If T3 is unreachable, stop and say so; never swap a model silently.

| Work | Model | Effort |
|---|---|---|
| Discovery and spec session | Opus 5.5 | xhigh |
| Spec challenge: new app or high-stakes / other specs / small features | Astra + Opus 5.5 / Astra / none | xhigh |
| Build coordinator (`/build`) | Opus 5.5 | high |
| Backend builder (and pieces with both backend and UI) | Opus 5.5 | medium; high for really complex work |
| Design session (`/design`), UI foundation | Opus 5.5 | high |
| Screens and views | Sonnet 5.5 | medium |
| Ordinary review | Sol | high |
| Important review: changed or removed arguments or returns of existing functions, APIs other apps consume, substantial behaviour, integrations | Sol | xhigh |
| High-stakes review: money, authorization and tenancy, migrations and deletion, concurrency, billing webhooks | Sol + Opus 5.5 | xhigh |
| UI review in the browser, once per batch | Opus 5.5 | high |
| Research | Sol | medium |
| Hard debugging | Sol (diagnose) → Opus 5.5 (fix) | xhigh → high |

Consequence decides the review tier, never size or a "UI" label. A one-line permission change is high-stakes.
<!-- app-kit:end -->

## Agent skills

### Issue tracker

Linear (MCP `<server>`), team `TEAM_KEY`, project `PROJECT_NAME`. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context. See `docs/agents/domain.md`.
