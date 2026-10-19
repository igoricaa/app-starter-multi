import { ConfigProvider, Effect, Layer } from "effect";
import * as Auth from "../src/auth";
import { services } from "../src/http";
import { testDatabase } from "./postgres";

export const apiUrl = "http://localhost:3001";
const webOrigin = "http://localhost:3000";
export const proxySecret = "test-only-proxy-secret";

// The API's services and config on a fresh test database. `env` adds environment variables.
export const testApp = (env: Record<string, string> = {}) =>
  services.pipe(
    Layer.provideMerge(
      ConfigProvider.layer(
        Effect.map(testDatabase, (url) =>
          ConfigProvider.fromUnknown({
            DATABASE_URL: url,
            API_URL: apiUrl,
            SITE_URL: webOrigin,
            BETTER_AUTH_SECRET: "test-only-secret-0123456789abcdef",
            API_PROXY_SECRET: proxySecret,
            ...env,
          }),
        ),
      ),
    ),
  );

// A browser's POST to Better Auth's handler, through the web app's proxy.
export const postAuth = (path: string, body: object) =>
  Auth.Auth.use((auth) =>
    Effect.promise(() =>
      auth.handler(
        new Request(`${apiUrl}/auth${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: webOrigin },
          body: JSON.stringify(body),
        }),
      ),
    ),
  );

// A sign-in code issued through the real generation hook (no mail).
export const issueCode = (email: string) =>
  Auth.Auth.use((auth) =>
    Effect.promise(() => auth.api.createVerificationOTP({ body: { email, type: "sign-in" } })),
  );

// Issues a code, then signs in over HTTP with `otp`, or with the issued code when `otp` is omitted.
export const signIn = (email: string, otp?: string, name?: string) =>
  Effect.gen(function* () {
    const issued = yield* issueCode(email);
    return yield* postAuth("/sign-in/email-otp", { email, otp: otp ?? issued, name });
  });

// The headers a browser sends after this sign-in response, or signed out without one.
export function sessionHeaders(response?: Response) {
  const cookie = (response?.headers.getSetCookie() ?? [])
    .map((header) => header.split(";")[0])
    .join("; ");
  return new Headers({ cookie });
}
