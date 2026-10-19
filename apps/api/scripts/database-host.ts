// The hosts a postgres:// URL connects to, as libpq reads them: a `host` query parameter wins
// over the authority, and either may list several. Decoded and lowercased.
function hostsOf(url: string) {
  const parsed = new URL(url);
  const hosts = parsed.searchParams.get("host") ?? decodeURIComponent(parsed.hostname);
  return hosts.split(",").map((host) => host.trim().toLowerCase());
}

const pooler = /^([^.]+)-pooler\./;

// Without Neon's "-pooler" suffix, so a pooled and a direct URL of one database compare equal.
export const normalizeHost = (host: string) => host.trim().toLowerCase().replace(pooler, "$1.");

export const databaseHosts = (url: string) => hostsOf(url).map(normalizeHost);

// Through Neon's connection pooler, where a session's advisory lock doesn't hold.
export const isPooled = (url: string) => hostsOf(url).some((host) => pooler.test(host));
