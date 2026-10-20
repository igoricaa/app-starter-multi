# Effect services

The account page is the reference slice. New features copy its shape:

- `packages/contracts/src/api.ts`: the `account` group. Each endpoint declares its path, its params and payload schemas, its success schema and its errors; the group carries the `RequestValidation` and `Authentication` middleware.
- `apps/api/src/AccountService.ts`: a `Context.Service` and its `layer`. Methods read `CurrentUser`; an id argument names a record, never the caller.
- `apps/api/src/http.ts`: the group's handlers, one service call each.
- `apps/api/src/AccountService.test.ts`: a signed-out caller is refused, a second user passing the first one's id gets `NotFound` and changes nothing, an invalid input returns its code. `http.test.ts` proves the same over HTTP, with a bearer token.
- `apps/web/src/routes/_authed/account.tsx`: a loader with `ensureQueryData` through `callApi`, the error code shown on its field.

A method that takes a record's id puts the owner in the same query, so another user's record is never read or written, and a concurrent change can't slip between a check and the write. Someone else's record and a missing one both answer `NotFound`, so ids reveal nothing:

```ts
const rename = Effect.fn("NoteService.rename")(function* (id: string, title: string) {
  const me = yield* CurrentUser;
  const [note] = yield* db
    .update(notes)
    .set({ title })
    .where(and(eq(notes.id, id), eq(notes.ownerId, me.id)))
    .returning({ id: notes.id })
    .pipe(Effect.orDie);
  if (!note) return yield* new NotFound();
});
```

## Rules lint and types don't cover

- **Handlers** make one service call and nothing else. Logic lives in services, so tests, scripts and future transports reach it too.
- **Running Effects.** `apps/api/server.ts` turns the routes into the one web handler (`HttpRouter.toWebHandler`); it is the only runtime. Scripts (`apps/api/scripts/seed.ts`) are their own entry points.
- **Errors.** A failure a client may see is a `Schema.TaggedError` in `packages/contracts/src/errors.ts`, with its HTTP status, declared on the endpoint and listed in `ApiFailure`: its tag is the code, its message is shown. A request the contract can't decode answers `InvalidRequest` without the diagnostics. Anything else (database errors via `Effect.orDie`, defects) is logged and answered with a bare 500. The web reads errors with `readError` from `apps/web/src/lib/api.ts`.
- **Identity.** `CurrentUser` comes from the `Authentication` middleware, which reads the session cookie or bearer token in the request (`signedInUser` in `apps/api/src/auth.ts`), never from input.
- **Database.** `Db` is Drizzle on `@effect/sql-pg`: a query is an Effect. Writes that must land together go in `db.transaction((tx) => …)`. Better Auth keeps its own Promise-based client.
- **Schema changes.** Edit `apps/api/src/schema.ts`, run `bun run --cwd apps/api db:generate`, commit `apps/api/drizzle/`. Vercel's build migrates; a preview refuses to touch production's database. When a change could be a rename, drizzle-kit asks; without a terminal it exits with code 2 and prints the `--hints` JSON to re-run with.
- **Environment.** The API reads its variables through Effect `Config` in `apps/api/src/config.ts`. The web's server reads `API_URL`, `API_PROXY_SECRET`, `API_BYPASS_SECRET` and `VERCEL_RELATED_PROJECTS` in `apps/web/src/server/upstream.ts`; browser values are `VITE_` variables via `import.meta.env`.
- **Auth.** `apps/api/src/auth.ts` holds Better Auth (email codes only, plus the `bearer` plugin) and the fixed test code for seeded accounts. Its code limits run in a before-hook, keyed by address, so a refused request never stores or replaces a code: 3 codes per address per 10 minutes, 10 code checks per address per 10 minutes, and 100 sign-in codes per hour for addresses with no account yet that Better Auth accepts (its own `z.email()`). Codes are stored encrypted with `BETTER_AUTH_SECRET`, because previews copy a database branch and a hashed 6-digit code reverses instantly. Better Auth's own `/update-user` and the email-code endpoints the flow doesn't use are disabled; sign-up keeps a name only if it is a valid display name, and no image.
- **Tests** use `@effect/vitest` on real PostgreSQL: `apps/api/tests/app.ts` gives the API's layers on a fresh copy of the migrated template, `signIn` signs in through Better Auth, and `http.test.ts` serves the real routes.
- **`bun run dev` deletes `apps/web/src/routeTree.gen.ts` first.** With nitro `3.0.260903-beta`, `vite dev` started over an existing route tree answers every page with a 500 (`transport invoke timed out` in nitro's dev worker). Remove the `rm` once a nitro release starts cleanly with the file present.
