import { Context, Schema } from "effect";
import {
  HttpApi,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpApiSchema,
} from "effect/http-api";
import { Account, AccountId } from "./account";
import { InvalidDisplayName, InvalidRequest, NotFound, Unauthenticated } from "./errors";

// The signed-in user, from the request's session cookie or bearer token; never from input.
export class CurrentUser extends Context.Service<CurrentUser, { readonly id: string }>()(
  "app/contracts/CurrentUser",
) {}

// Clients send credentials themselves: the browser its cookie, mobile `Authorization: Bearer`.
export class Authentication extends HttpApiMiddleware.Service<
  Authentication,
  { provides: CurrentUser }
>()("app/contracts/Authentication", { error: Unauthenticated }) {}

// Turns a request the contract can't decode into InvalidRequest.
export class RequestValidation extends HttpApiMiddleware.Service<RequestValidation>()(
  "app/contracts/RequestValidation",
  { error: InvalidRequest },
) {}

export class AccountGroup extends HttpApiGroup.make("account")
  .add(
    HttpApiEndpoint.get("get", "/:id", {
      params: { id: AccountId },
      success: Account,
      error: NotFound,
    }),
    HttpApiEndpoint.patch("updateDisplayName", "/:id", {
      params: { id: AccountId },
      payload: Schema.Struct({ displayName: Schema.String }),
      success: HttpApiSchema.NoContent,
      error: [InvalidDisplayName, NotFound],
    }),
  )
  .middleware(RequestValidation)
  .middleware(Authentication)
  .prefix("/accounts") {}

export class HealthGroup extends HttpApiGroup.make("health", { topLevel: true }).add(
  // The deployed commit, so a client can wait for the API of its own commit.
  HttpApiEndpoint.get("health", "/health", { success: Schema.Struct({ sha: Schema.String }) }),
) {}

export class Api extends HttpApi.make("app").add(AccountGroup).add(HealthGroup) {}
