// Run first by scripts/vercel-build.sh, before anything touches a database. A preview must never
// migrate or use production's database (PRODUCTION_DATABASE_HOST, not a secret, set for Preview).
// A new Vercel project's first Git deployment goes to production whatever its branch, so
// production builds only from main.
import { databaseHosts, normalizeHost } from "./database-host";

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
    if (!env.PRODUCTION_DATABASE_HOST) refuse("PRODUCTION_DATABASE_HOST is not set.");
    const production = normalizeHost(env.PRODUCTION_DATABASE_HOST);
    for (const name of ["DATABASE_URL", "DATABASE_URL_UNPOOLED"]) {
      const url = env[name];
      if (!url) refuse(`${name} is not set.`);
      if (databaseHosts(url).includes(production))
        refuse(`this preview's ${name} is production's.`);
    }
    break;
  }
  default:
    refuse(`VERCEL_ENV is '${env.VERCEL_ENV ?? ""}', not production or preview.`);
}
