import { Config } from "effect";

// The API's environment, read only through these.
export const databaseUrl = Config.Redacted("DATABASE_URL");

// The deployed commit (a Vercel system variable), reported by /health.
export const commitSha = Config.String("VERCEL_GIT_COMMIT_SHA").pipe(Config.withDefault("local"));

export const authConfig = Config.all({
  // This API's own origin: API_URL locally, the deployment's own URL on Vercel.
  apiUrl: Config.String("API_URL").pipe(
    Config.orElse(() => Config.String("VERCEL_URL").pipe(Config.map((host) => `https://${host}`))),
  ),
  // The web app's origin, trusted for browser requests through its proxy: http://localhost:3000,
  // the production URL, or the previews' wildcard.
  siteUrl: Config.String("SITE_URL"),
  secret: Config.Redacted("BETTER_AUTH_SECRET"),
  // Shared with the web app, whose server sends it with the visitor's IP.
  proxySecret: Config.Redacted("API_PROXY_SECRET"),
  // Dev and previews only: the seeded accounts sign in with this code.
  testOtpCode: Config.option(Config.NonEmptyString("TEST_OTP_CODE")),
  resendApiKey: Config.option(Config.Redacted("RESEND_API_KEY")),
  emailFrom: Config.option(Config.NonEmptyString("EMAIL_FROM")),
});
