import { Api, ApiFailure } from "@app/contracts";
import { createIsomorphicFn } from "@tanstack/react-start";
import { appendResponseHeader, getRequestHeaders } from "@tanstack/react-start/server";
import { Effect, Schema } from "effect";
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/http";
import { HttpApiClient } from "effect/http-api";
import { apiOrigin, upstreamHeaders } from "~/server/upstream";

// During SSR, straight to the API with the visitor's cookie; in the browser, through this origin's
// /api proxy (src/routes/api/$.ts).
const connection = createIsomorphicFn()
  .server(() => {
    const incoming = getRequestHeaders();
    return {
      baseUrl: apiOrigin(),
      headers: { cookie: incoming.get("cookie") ?? "", ...upstreamHeaders(incoming) },
    };
  })
  .client(() => ({ baseUrl: `${location.origin}/api`, headers: {} }));

type Client = HttpApiClient.ForApi<typeof Api>;

// One call through the typed client. It rejects with the API's error (read it with `readError`).
export function callApi<A, E>(call: (client: Client) => Effect.Effect<A, E>) {
  const { baseUrl, headers } = connection();
  return HttpApiClient.make(Api, {
    baseUrl,
    transformClient: HttpClient.mapRequest(HttpClientRequest.setHeaders(headers)),
  }).pipe(Effect.flatMap(call), Effect.provide(FetchHttpClient.layer), Effect.runPromise);
}

// Better Auth's session endpoint, the only one that extends an aging session.
async function readSession() {
  const { baseUrl, headers } = connection();
  const response = await fetch(`${baseUrl}/auth/get-session`, { headers });
  if (!response.ok) throw new Error(`The session check answered ${response.status}.`);
  const session = (await response.json()) as { user: { id: string } } | null;
  return { userId: session?.user.id ?? null, cookies: response.headers.getSetCookie() };
}

// The signed-in user's id, or null. During SSR the extended session's cookie is passed on to the
// browser, as the proxy does in the browser; without it every session would end 7 days after
// sign-in.
export const signedInUserId = createIsomorphicFn()
  .server(async () => {
    const { userId, cookies } = await readSession();
    for (const cookie of cookies) appendResponseHeader("set-cookie", cookie);
    return userId;
  })
  .client(async () => (await readSession()).userId);

const isApiFailure = Schema.is(ApiFailure);

// The code and message of an API failure; anything else is Unknown, with a generic message.
export function readError(error: unknown) {
  return isApiFailure(error)
    ? { code: error._tag, message: error.message }
    : { code: "Unknown" as const, message: "Something went wrong. Please try again." };
}
