// Run first by scripts/vercel-build.sh, before anything touches a database. A preview must never
// migrate or use production's database: its URLs must pass the strict read in database-host.ts, on
// PRODUCTION_DATABASE_HOST's suffix (not a secret, set for Preview), with another endpoint id.
// A new Vercel project's first Git deployment goes to production whatever its branch, so
// production builds only from main.
import { neonHostParts, readDatabaseUrl } from "./database-host";

function refuse(reason: string): never {
  console.error(`Refusing to build: ${reason}`);
  process.exit(1);
}

const env = process.env;
switch (env.VERCEL_ENV) {
  case "production":
    if (env.VERCEL_GIT_COMMIT_REF !== "main") {
      refuse(`production builds only from main, not '${env.VERCEL_GIT_COMMIT_REF ?? ""}'.`);
    }
    if (env.TEST_OTP_CODE) refuse("TEST_OTP_CODE is set in production.");
    break;
  case "preview": {
    if (env.RESEND_API_KEY) refuse("RESEND_API_KEY is set; previews sign in seeded accounts only.");
    const production = neonHostParts(env.PRODUCTION_DATABASE_HOST ?? "");
    if (!production) refuse("PRODUCTION_DATABASE_HOST is not a Neon host.");
    for (const name of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"]) {
      const url = env[name];
      if (!url) refuse(`${name} is not set.`);
      let host: ReturnType<typeof readDatabaseUrl>;
      try {
        host = readDatabaseUrl(name, url);
      } catch (error) {
        refuse((error as Error).message);
      }
      // Exactly <endpoint id>[-pooler].<production's suffix>: Neon's own host for another endpoint.
      if (host?.suffix !== production.suffix)
        refuse(`${name}'s host isn't on production's Neon suffix.`);
      if (host.endpoint === production.endpoint) refuse(`this preview's ${name} is production's.`);
    }
    break;
  }
  default:
    refuse(`VERCEL_ENV is '${env.VERCEL_ENV ?? ""}', not production or preview.`);
}
