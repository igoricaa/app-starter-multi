import {
  Api,
  Authentication,
  CurrentUser,
  InvalidRequest,
  RequestValidation,
} from "@app/contracts";
import { timingSafeEqual } from "node:crypto";
import { Effect, Layer, Redacted } from "effect";
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";
import { HttpApiBuilder, HttpApiMiddleware } from "effect/http-api";
import * as AccountService from "./AccountService";
import * as Auth from "./auth";
import { authConfig, commitSha } from "./config";
import * as Db from "./Db";

const AuthenticationLive = Layer.effect(
  Authentication,
  Effect.gen(function* () {
    const auth = yield* Auth.Auth;
    return Authentication.of((httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const user = yield* Auth.signedInUser(new Headers(request.headers)).pipe(
          Effect.provideService(Auth.Auth, auth),
        );
        return yield* Effect.provideService(httpEffect, CurrentUser, user);
      }),
    );
  }),
);

// The diagnostics stay on the server; a response encoding failure stays a 500.
const RequestValidationLive = HttpApiMiddleware.layerSchemaErrorTransform(
  RequestValidation,
  (error) =>
    error.kind === "Body" || error.kind === "ResponseHeaders"
      ? Effect.fail(error)
      : Effect.fail(new InvalidRequest()),
);

const AccountHandlers = HttpApiBuilder.group(
  Api,
  "account",
  Effect.fn(function* (handlers) {
    const account = yield* AccountService.AccountService;
    return handlers
      .handle("get", ({ params }) => account.get(params.id))
      .handle("updateDisplayName", ({ params, payload }) =>
        account.updateDisplayName(params.id, payload.displayName),
      );
  }),
).pipe(Layer.provide([RequestValidationLive, AuthenticationLive]));

const HealthHandlers = HttpApiBuilder.group(
  Api,
  "health",
  Effect.fn(function* (handlers) {
    const sha = yield* commitSha;
    return handlers.handle("health", () => Effect.succeed({ sha }));
  }),
);

// Better Auth at /auth/*. Its per-IP limits would put every browser behind the web app's proxy in
// one bucket, so that proxy sends the visitor's IP in `x-client-ip` with the shared secret; the
// claim is believed only with that secret.
const AuthRoutes = HttpRouter.use(
  Effect.fn(function* (router) {
    const auth = yield* Auth.Auth;
    const proxySecret = Buffer.from(Redacted.value((yield* authConfig).proxySecret));
    const fromProxy = (secret: string | null) =>
      secret !== null &&
      Buffer.byteLength(secret) === proxySecret.length &&
      timingSafeEqual(Buffer.from(secret), proxySecret);

    yield* router.add("*", "/auth/*", (request) =>
      Effect.gen(function* () {
        const web = yield* HttpServerRequest.toWeb(request).pipe(Effect.orDie);
        const headers = new Headers(web.headers);
        const clientIp = headers.get("x-client-ip");
        if (clientIp && fromProxy(headers.get("x-proxy-secret"))) {
          headers.set("x-forwarded-for", clientIp);
        }
        headers.delete("x-client-ip");
        headers.delete("x-proxy-secret");
        // A new Request from parts: the platform's own Request class may not be undici's.
        const body =
          web.method === "GET" || web.method === "HEAD"
            ? null
            : yield* Effect.promise(() => web.arrayBuffer());
        const response = yield* Effect.promise(() =>
          auth.handler(new Request(web.url, { method: web.method, headers, body })),
        );
        return HttpServerResponse.fromWeb(response);
      }),
    );
  }),
);

export const services = Layer.mergeAll(AccountService.layer, Auth.layer).pipe(
  Layer.provideMerge(Db.layer),
);

// Every route the API serves, given the services.
export const routes = Layer.mergeAll(
  HttpApiBuilder.layer(Api).pipe(Layer.provide([AccountHandlers, HealthHandlers])),
  AuthRoutes,
).pipe(Layer.provide(HttpServer.layerServices));
