// Reads a postgres:// URL strictly, for the build's guard and migrations: only a Neon host (or,
// where allowed, localhost) and nothing else that could choose the server. Neon routes by endpoint
// id, which a client can also name in `options=endpoint%3D…` or in the password (`endpoint=…;`),
// and libpq and node-postgres read a `host` parameter and PGHOSTADDR and PGOPTIONS. So a URL passes
// only when its hostname alone decides where it connects.
const neonHost = /^(ep-[a-z0-9-]+?)(-pooler)?(\.[a-z0-9-]+)+\.neon\.tech$/;
const localHosts = ["localhost", "127.0.0.1"];
const allowedParameters = ["sslmode", "channel_binding"];
const routingVariables = ["PGHOSTADDR", "PGOPTIONS"];

export type DatabaseTarget = { endpoint: string | null; pooled: boolean };

// The Neon endpoint id ("ep-…", without "-pooler") and whether the URL goes through Neon's pooler;
// a local host has no endpoint. Throws, without echoing the URL (`name` says which), when anything
// else could route it.
export function readDatabaseUrl(
  name: string,
  url: string,
  { allowLocal = false } = {},
): DatabaseTarget {
  const routing = routingVariables.filter((variable) => process.env[variable]);
  if (routing.length > 0) throw new Error(`${routing.join(" and ")} must not be set.`);

  let parsed: URL;
  let credentials: string;
  try {
    parsed = new URL(url);
    credentials = decodeURIComponent(`${parsed.username}:${parsed.password}`);
  } catch {
    throw new Error(`${name} isn't a well-formed URL.`);
  }
  if (parsed.protocol !== "postgres:" && parsed.protocol !== "postgresql:") {
    throw new Error(`${name} isn't a postgres:// URL.`);
  }
  if (/endpoint=/i.test(credentials)) throw new Error(`${name}'s credentials name an endpoint.`);
  for (const [parameter, value] of parsed.searchParams) {
    if (!allowedParameters.includes(parameter) || !/^[a-z-]+$/.test(value)) {
      throw new Error(`${name}'s parameter '${parameter}' isn't allowed.`);
    }
  }

  // `postgresql:` URLs keep their host as written: no lowercasing, decoding or dot removal.
  const neon = neonHost.exec(parsed.hostname);
  if (neon && !parsed.port) return { endpoint: neon[1]!, pooled: Boolean(neon[2]) };
  if (allowLocal && localHosts.includes(parsed.hostname)) return { endpoint: null, pooled: false };
  throw new Error(
    `${name}'s host isn't a lowercase Neon host${allowLocal ? " or localhost" : ""}.`,
  );
}

// The endpoint id of a bare Neon hostname, such as PRODUCTION_DATABASE_HOST.
export const neonEndpoint = (host: string) => neonHost.exec(host.trim())?.[1] ?? null;
