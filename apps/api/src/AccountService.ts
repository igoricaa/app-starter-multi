import {
  CurrentUser,
  DisplayName,
  InvalidDisplayName,
  NotFound,
  type Account,
} from "@app/contracts";
import { and, eq } from "drizzle-orm";
import { Context, Effect, Layer, Schema } from "effect";
import * as Db from "./Db";
import { user } from "./schema";

// The reference slice. Identity comes from CurrentUser; an id from the caller only names a record,
// which is loaded and refused unless the caller owns it.
export class AccountService extends Context.Service<
  AccountService,
  {
    readonly get: (id: string) => Effect.Effect<typeof Account.Type, NotFound, CurrentUser>;
    readonly updateDisplayName: (
      id: string,
      displayName: string,
    ) => Effect.Effect<void, InvalidDisplayName | NotFound, CurrentUser>;
  }
>()("app/api/AccountService") {}

export const layer = Layer.effect(
  AccountService,
  Effect.gen(function* () {
    const db = yield* Db.Db;

    // The id and the owner are both in the query, so a record that isn't the caller's is never
    // read or written. An account's owner is the account itself; other records compare their owner
    // column: `and(eq(notes.id, id), eq(notes.ownerId, me.id))`.
    const owned = (id: string, me: CurrentUser["Service"]) =>
      and(eq(user.id, id), eq(user.id, me.id));

    const get = Effect.fn("AccountService.get")(function* (id: string) {
      const me = yield* CurrentUser;
      const [account] = yield* db
        .select({ id: user.id, email: user.email, displayName: user.name })
        .from(user)
        .where(owned(id, me))
        .pipe(Effect.orDie);
      if (!account) return yield* new NotFound();
      return account;
    });

    const updateDisplayName = Effect.fn("AccountService.updateDisplayName")(function* (
      id: string,
      input: string,
    ) {
      const displayName = yield* Schema.decodeUnknownEffect(DisplayName)(input).pipe(
        Effect.mapError(() => new InvalidDisplayName()),
      );
      const me = yield* CurrentUser;
      const [updated] = yield* db
        .update(user)
        .set({ name: displayName })
        .where(owned(id, me))
        .returning({ id: user.id })
        .pipe(Effect.orDie);
      if (!updated) return yield* new NotFound();
    });

    return AccountService.of({ get, updateDisplayName });
  }),
);
