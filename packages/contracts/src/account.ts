import { Schema } from "effect";

// Better Auth's ids: 32 letters and digits.
export const AccountId = Schema.String.check(Schema.isPattern(/^[A-Za-z0-9]{32}$/));

export const Account = Schema.Struct({
  id: AccountId,
  email: Schema.String,
  displayName: Schema.String,
});

// Trimmed. The API checks it on update and when Better Auth creates an account.
export const DisplayName = Schema.Trim.check(Schema.isMinLength(1), Schema.isMaxLength(50));
