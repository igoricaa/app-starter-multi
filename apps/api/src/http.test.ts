import { assert, layer } from "@effect/vitest";
import { Account } from "@app/contracts";
import { eq, sql } from "drizzle-orm";
import { Effect, Layer, Schema } from "effect";
import { HttpRouter } from "effect/http";
import { apiUrl, issueCode, proxySecret, signIn, testApp } from "../tests/app";
import { Db } from "./Db";
import { routes } from "./http";
import { session } from "./schema";

const app = testApp();

// The API's HTTP handler, as Vercel serves it, on this test's services.
const serve = Effect.gen(function* () {
  const services = yield* Effect.context<Layer.Success<typeof app>>();
  const { handler, dispose } = HttpRouter.toWebHandler(
    routes.pipe(Layer.provide(Layer.succeedContext(services))),
    { disableLogger: true },
  );
  yield* Effect.addFinalizer(() => Effect.promise(dispose));
  return (path: string, init: RequestInit = {}) =>
    Effect.promise(() => handler(new Request(`${apiUrl}${path}`, init)));
});

const body = (response: Response) => Effect.promise((): Promise<unknown> => response.json());

const json = (body: object, headers: Record<string, string> = {}) => ({
  method: "POST",
  headers: { "content-type": "application/json", ...headers },
  body: JSON.stringify(body),
});

// A mobile client's sign-in: no cookies, the token from `set-auth-token`.
const signInMobile = (email: string, headers: Record<string, string> = {}) =>
  Effect.gen(function* () {
    const request = yield* serve;
    const otp = yield* issueCode(email);
    const response = yield* request("/auth/sign-in/email-otp", json({ email, otp }, headers));
    assert.strictEqual(response.status, 200);
    const { user } = (yield* body(response)) as { user: { id: string } };
    const token = response.headers.get("set-auth-token");
    assert.isString(token);
    return { id: user.id, auth: { authorization: `Bearer ${token}` } };
  });

layer(app)("the API over HTTP", (it) => {
  it.effect("a bearer token reads the account; without one the API answers 401", () =>
    Effect.gen(function* () {
      const request = yield* serve;
      const dana = yield* signInMobile("dana@example.test");

      const mine = yield* request(`/accounts/${dana.id}`, { headers: dana.auth });
      assert.strictEqual(mine.status, 200);
      assert.deepStrictEqual(yield* body(mine), {
        id: dana.id,
        email: "dana@example.test",
        displayName: "dana",
      });

      const signedOut = yield* request(`/accounts/${dana.id}`);
      assert.strictEqual(signedOut.status, 401);
      assert.deepStrictEqual(yield* body(signedOut), { _tag: "Unauthenticated" });
    }),
  );

  it.effect("user B can't read or change user A's account by id", () =>
    Effect.gen(function* () {
      const request = yield* serve;
      const alice = yield* signInMobile("alice@example.test");
      const bob = yield* signInMobile("bob@example.test");
      const rename = (displayName: string, headers: Record<string, string>) =>
        request(`/accounts/${alice.id}`, {
          ...json({ displayName }, headers),
          method: "PATCH",
        });
      assert.strictEqual((yield* rename("Alice", alice.auth)).status, 204);

      assert.strictEqual(
        (yield* request(`/accounts/${alice.id}`, { headers: bob.auth })).status,
        404,
      );
      assert.strictEqual((yield* rename("Mallory", bob.auth)).status, 404);

      const after = yield* request(`/accounts/${alice.id}`, { headers: alice.auth });
      assert.strictEqual(
        Schema.decodeUnknownSync(Account)(yield* body(after)).displayName,
        "Alice",
      );
    }),
  );

  it.effect("a request the contract can't decode answers InvalidRequest, without diagnostics", () =>
    Effect.gen(function* () {
      const request = yield* serve;
      const gil = yield* signInMobile("gil@example.test");
      const malformedId = yield* request("/accounts/not-an-id", { headers: gil.auth });
      const noName = yield* request(`/accounts/${gil.id}`, {
        ...json({}, gil.auth),
        method: "PATCH",
      });
      for (const response of [malformedId, noName]) {
        assert.strictEqual(response.status, 400);
        assert.deepStrictEqual(yield* body(response), { _tag: "InvalidRequest" });
      }
    }),
  );

  it.effect("only the session endpoint extends an aging session, and resends its cookie", () =>
    Effect.gen(function* () {
      const request = yield* serve;
      const db = yield* Db;
      const signedIn = yield* signIn("hal@example.test");
      const cookie = signedIn.headers.getSetCookie()[0]!.split(";")[0]!;
      const { user } = (yield* body(signedIn)) as { user: { id: string } };
      // Signed in two days ago: due for a refresh.
      yield* db
        .update(session)
        .set({ expiresAt: sql`now() + interval '5 days'` })
        .where(eq(session.userId, user.id))
        .pipe(Effect.orDie);
      const expiry = db
        .select({ at: session.expiresAt })
        .from(session)
        .where(eq(session.userId, user.id))
        .pipe(
          Effect.orDie,
          Effect.map(([row]) => row!.at.getTime()),
        );
      const aged = yield* expiry;

      const read = yield* request(`/accounts/${user.id}`, { headers: { cookie } });
      assert.strictEqual(read.status, 200);
      assert.deepStrictEqual(read.headers.getSetCookie(), []);
      assert.strictEqual(yield* expiry, aged);

      const checked = yield* request("/auth/get-session", { headers: { cookie } });
      assert.match(checked.headers.getSetCookie()[0] ?? "", /session_token=.*Max-Age=604800/);
      assert.isAbove(yield* expiry, aged + 24 * 60 * 60 * 1000);
    }),
  );

  it.effect("believes a visitor's IP only from the web app's proxy", () =>
    Effect.gen(function* () {
      const db = yield* Db;
      const ipOf = (userId: string) =>
        db
          .select({ ip: session.ipAddress })
          .from(session)
          .where(eq(session.userId, userId))
          .pipe(
            Effect.orDie,
            Effect.map(([row]) => row?.ip),
          );

      const forged = yield* signInMobile("eve@example.test", { "x-client-ip": "203.0.113.7" });
      const proxied = yield* signInMobile("fay@example.test", {
        "x-client-ip": "203.0.113.8",
        "x-proxy-secret": proxySecret,
      });

      assert.notStrictEqual(yield* ipOf(forged.id), "203.0.113.7");
      assert.strictEqual(yield* ipOf(proxied.id), "203.0.113.8");
    }),
  );
});
