// Reads a postgres:// URL strictly, for the build's guard and migrations: only a Neon host (or,
// where allowed, localhost) and nothing else that could choose the server. Neon routes by endpoint
// id, which a client can also name in `options=endpoint%3D…` or in the password (`endpoint=…;`,
// `project=…;`), and libpq and node-postgres read a `host` parameter, PGHOSTADDR and PGOPTIONS.
// So a URL passes only when its hostname alone decides where it connects, over TLS.
// This guards against misconfiguration, not against someone who can already set Vercel env vars.
import { parse } from "pg-connection-string";

// Neon's hosts: ep-<id>[-pooler].<suffix>, the suffix being the region's labels and neon.tech.
const neonHost = /^(ep-[a-z0-9-]+?)(-pooler)?\.((?:[a-z0-9-]+\.)+neon\.tech)$/;
const localHosts = ["localhost", "127.0.0.1"];
const tlsModes = ["require", "verify-full"];

export type NeonHost = { endpoint: string; pooled: boolean; suffix: string };

// A bare Neon hostname's parts, such as PRODUCTION_DATABASE_HOST's; null for any other host.
export function neonHostParts(host: string): NeonHost | null {
  const match = neonHost.exec(host);
  return match ? { endpoint: match[1]!, pooled: match[2] !== undefined, suffix: match[3]! } : null;
}

// The URL's Neon host, or null for localhost where `allowLocal`. Throws, without echoing the URL
// (`name` says which), when anything but the hostname could route it.
export function readDatabaseUrl(
  name: string,
  url: string,
  { allowLocal = false } = {},
): NeonHost | null {
  // node-postgres reads PGOPTIONS for every connection; PGHOSTADDR overrides libpq's host. PGHOST
  // and PGPASSWORD, which Vercel's Neon integration sets, are read only when the URL lacks its
  // own host or password, and a Neon URL here has both.
  for (const variable of ["PGOPTIONS", "PGHOSTADDR"]) {
    if (process.env[variable] !== undefined) throw new Error(`${variable} must not be set.`);
  }

  let parsed: URL;
  let decoded: string;
  try {
    parsed = new URL(url);
    decoded = decodeURIComponent(url);
    // node-postgres parses the URL itself; both readings must name the same host.
    if (parse(url).host !== parsed.hostname) throw new Error();
  } catch {
    throw new Error(`${name} isn't a well-formed URL.`);
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`${name} isn't a postgres:// URL.`);
  }
  if (/endpoint=|project=/i.test(decoded)) {
    throw new Error(`${name} names a Neon endpoint or project.`);
  }
  for (const [parameter, value] of parsed.searchParams) {
    const allowed =
      parameter === "sslmode"
        ? tlsModes.includes(value)
        : parameter === "channel_binding" && /^[a-z]+$/.test(value);
    if (!allowed) throw new Error(`${name}'s parameter '${parameter}' isn't allowed.`);
  }

  // `postgresql:` URLs keep their host as written: no lowercasing, decoding or dot removal.
  if (allowLocal && localHosts.includes(parsed.hostname)) {
    if (!parsed.password && process.env.PGPASSWORD !== undefined) {
      throw new Error(`PGPASSWORD must not be set when ${name} has no password.`);
    }
    return null;
  }
  const neon = neonHostParts(parsed.hostname);
  if (!neon || parsed.port) {
    throw new Error(`${name}'s host isn't a Neon host${allowLocal ? " or localhost" : ""}.`);
  }
  if (!parsed.password) throw new Error(`${name} has no password.`);
  if (!tlsModes.includes(parsed.searchParams.get("sslmode") ?? "")) {
    throw new Error(`${name} must set sslmode to require or verify-full.`);
  }
  return neon;
}
