import { assert, describe, it } from "@effect/vitest";
import { count, desc, eq } from "drizzle-orm";
import { Cause, Effect, Exit } from "effect";
import { issueCode, postAuth, signIn, testApp } from "../tests/app";
import { seed, seededAccounts } from "./auth";
import { Db } from "./Db";
import { otpAttempt, user, verification } from "./schema";

const FIXED_CODE = "424242";
const seeded = seededAccounts[0]!.email;

const sendCode = (email: string, type = "sign-in") =>
  Effect.map(postAuth("/email-otp/send-verification-otp", { email, type }), (r) => r.status);
const guess = (email: string, otp: string) =>
  Effect.map(postAuth("/sign-in/email-otp", { email, otp }), (r) => r.status);
// The stored `code:attempts` value.
const storedCode = (email: string) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const [row] = yield* db
      .select({ value: verification.value })
      .from(verification)
      .where(eq(verification.identifier, `sign-in-otp-${email}`))
      .orderBy(desc(verification.createdAt))
      .limit(1)
      .pipe(Effect.orDie);
    return row?.value;
  });
const nameOf = (email: string) =>
  Effect.gen(function* () {
    const db = yield* Db;
    const [row] = yield* db.select({ name: user.name }).from(user).where(eq(user.email, email));
    return row?.name;
  }).pipe(Effect.orDie);

describe("fixed OTP", () => {
  it.effect("signs in a seeded account when TEST_OTP_CODE is set; the seed re-runs safely", () =>
    Effect.gen(function* () {
      yield* seed;
      yield* seed;
      const response = yield* signIn(seeded.toUpperCase(), FIXED_CODE);
      assert.strictEqual(response.status, 200);
    }).pipe(Effect.provide(testApp({ TEST_OTP_CODE: FIXED_CODE }))),
  );

  it.effect("is refused without TEST_OTP_CODE, where the seed also refuses", () =>
    Effect.gen(function* () {
      const refusal = yield* Effect.exit(seed);
      assert.isTrue(Exit.isFailure(refusal) && /TEST_OTP_CODE/.test(Cause.pretty(refusal.cause)));
      const response = yield* signIn(seeded, FIXED_CODE);
      assert.strictEqual(response.status, 400);
    }).pipe(Effect.provide(testApp())),
  );

  it.effect("is refused for an unseeded address", () =>
    Effect.gen(function* () {
      const response = yield* signIn("someone@example.test", FIXED_CODE);
      assert.strictEqual(response.status, 400);
    }).pipe(Effect.provide(testApp({ TEST_OTP_CODE: FIXED_CODE }))),
  );
});

describe("code limits", () => {
  it.effect("a throttled request stores no new code, so guessing can't continue", () =>
    Effect.gen(function* () {
      const victim = "victim@example.test";
      for (let i = 0; i < 3; i++) assert.strictEqual(yield* sendCode(victim), 200);
      // The same as a sent code, but known here: stored codes are hashed.
      const code = yield* issueCode(victim);
      for (let i = 0; i < 3; i++) assert.strictEqual(yield* guess(victim, "000000"), 400);
      const spent = yield* storedCode(victim);
      assert.match(spent!, /:3$/);
      assert.notInclude(spent!, code);

      assert.strictEqual(yield* sendCode(victim.toUpperCase()), 429);
      assert.strictEqual(yield* storedCode(victim), spent);
      assert.strictEqual(yield* guess(victim, code), 403);
    }).pipe(Effect.provide(testApp())),
  );

  it.effect("checks are limited per address, even with the right code", () =>
    Effect.gen(function* () {
      const target = "target@example.test";
      for (let i = 0; i < 10; i++) assert.strictEqual(yield* guess(target, "000000"), 400);
      const response = yield* signIn(target);
      assert.strictEqual(response.status, 429);
    }).pipe(Effect.provide(testApp())),
  );

  it.effect("only new addresses count toward the global cap", () =>
    Effect.gen(function* () {
      const existing = "existing@example.test";
      assert.strictEqual((yield* signIn(existing)).status, 200);
      const db = yield* Db;
      yield* db
        .insert(otpAttempt)
        .values(
          Array.from({ length: 100 }, (_, i) => ({
            kind: "send" as const,
            email: `new${i}@example.test`,
            newAddress: true,
          })),
        )
        .pipe(Effect.orDie);

      assert.strictEqual(yield* sendCode("one-more@example.test"), 429);
      assert.strictEqual(yield* sendCode(existing), 200);
    }).pipe(Effect.provide(testApp())),
  );

  it.effect(
    "only sign-in codes for addresses Better Auth accepts count toward the global cap",
    () =>
      Effect.gen(function* () {
        const db = yield* Db;
        const counted = db
          .select({ n: count() })
          .from(otpAttempt)
          .where(eq(otpAttempt.newAddress, true))
          .pipe(
            Effect.orDie,
            Effect.map(([row]) => row!.n),
          );
        yield* sendCode("not-an-address");
        yield* sendCode("two..dots@example.test");
        yield* sendCode("verify@example.test", "email-verification");
        assert.strictEqual(yield* counted, 0);
        yield* sendCode("new@example.test");
        assert.strictEqual(yield* counted, 1);
      }).pipe(Effect.provide(testApp())),
  );
});

describe("accounts", () => {
  it.effect("sign-up keeps a valid name, replaces an unbounded one, and takes no image", () =>
    Effect.gen(function* () {
      yield* signIn("dana@example.test", undefined, "  Dana  ");
      yield* signIn("huge@example.test", undefined, "x".repeat(100_000));
      yield* signIn("nameless@example.test");
      assert.strictEqual(yield* nameOf("dana@example.test"), "Dana");
      assert.strictEqual(yield* nameOf("huge@example.test"), "huge");
      assert.strictEqual(yield* nameOf("nameless@example.test"), "nameless");

      const pictured = "pic@example.test";
      const otp = yield* issueCode(pictured);
      yield* postAuth("/sign-in/email-otp", {
        email: pictured,
        otp,
        image: "https://x.test/a.png",
      });
      const db = yield* Db;
      const [row] = yield* db
        .select({ image: user.image })
        .from(user)
        .where(eq(user.email, pictured))
        .pipe(Effect.orDie);
      assert.strictEqual(row?.image, null);
    }).pipe(Effect.provide(testApp())),
  );

  it.effect("Better Auth's own user update is closed", () =>
    Effect.gen(function* () {
      const response = yield* postAuth("/update-user", { name: "Mallory" });
      assert.strictEqual(response.status, 404);
    }).pipe(Effect.provide(testApp())),
  );
});
