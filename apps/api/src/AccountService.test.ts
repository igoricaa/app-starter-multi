import { assert, layer } from "@effect/vitest";
import { Effect } from "effect";
import { sessionHeaders, signIn, testApp } from "../tests/app";
import { AccountService } from "./AccountService";
import { authenticate, signedInUser } from "./auth";

// The signed-in user's id and their CurrentUser layer.
const signedIn = (email: string) =>
  Effect.gen(function* () {
    const headers = sessionHeaders(yield* signIn(email));
    return { id: (yield* signedInUser(headers)).id, as: authenticate(headers) };
  });
const get = (id: string) => AccountService.use((account) => account.get(id));
const update = (id: string, displayName: string) =>
  AccountService.use((account) => account.updateDisplayName(id, displayName));

layer(testApp())("AccountService", (it) => {
  it.effect("refuses a signed-out caller", () =>
    Effect.gen(function* () {
      const signedOut = authenticate(sessionHeaders());
      const read = yield* get("any").pipe(Effect.provide(signedOut), Effect.flip);
      const write = yield* update("any", "Mallory").pipe(Effect.provide(signedOut), Effect.flip);
      assert.strictEqual(read._tag, "Unauthenticated");
      assert.strictEqual(write._tag, "Unauthenticated");
    }),
  );

  it.effect("user B passing user A's id gets NotFound, and A's account is unchanged", () =>
    Effect.gen(function* () {
      const alice = yield* signedIn("alice@example.test");
      const bob = yield* signedIn("bob@example.test");
      yield* update(alice.id, "Alice").pipe(Effect.provide(alice.as));

      const read = yield* get(alice.id).pipe(Effect.provide(bob.as), Effect.flip);
      const write = yield* update(alice.id, "Mallory").pipe(Effect.provide(bob.as), Effect.flip);

      assert.strictEqual(read._tag, "NotFound");
      assert.strictEqual(write._tag, "NotFound");
      assert.deepStrictEqual(yield* get(alice.id).pipe(Effect.provide(alice.as)), {
        id: alice.id,
        email: "alice@example.test",
        displayName: "Alice",
      });
    }),
  );

  it.effect("an invalid name returns its code and changes nothing", () =>
    Effect.gen(function* () {
      const carol = yield* signedIn("carol@example.test");
      yield* update(carol.id, "Carol").pipe(Effect.provide(carol.as));

      for (const displayName of ["   ", "x".repeat(51)]) {
        const error = yield* update(carol.id, displayName).pipe(
          Effect.provide(carol.as),
          Effect.flip,
        );
        assert.strictEqual(error._tag, "InvalidDisplayName");
      }
      assert.strictEqual(
        (yield* get(carol.id).pipe(Effect.provide(carol.as))).displayName,
        "Carol",
      );
    }),
  );
});
