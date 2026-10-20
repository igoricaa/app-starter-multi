import { relatedProjects } from "@vercel/related-projects";

// The API this deployment talks to: the API preview of the same Git branch, production's API, or
// API_URL locally. Vercel fills VERCEL_RELATED_PROJECTS from `relatedProjects` in vercel.json.
export function apiOrigin() {
  const env = process.env.VERCEL_ENV;
  if (env !== "preview" && env !== "production") {
    if (!process.env.API_URL) throw new Error("Set API_URL.");
    return process.env.API_URL;
  }
  const [api] = relatedProjects();
  const host = env === "preview" ? api?.preview.branch : api?.production.alias;
  if (!host) throw new Error(`VERCEL_RELATED_PROJECTS has no ${env} host for the API.`);
  return `https://${host}`;
}

// Sent with every call to the API. The API limits sign-in attempts per IP, and would otherwise
// count every visitor as this server; it believes `x-client-ip` only with the shared secret.
export function upstreamHeaders(incoming: Headers): Record<string, string> {
  const secret = process.env.API_PROXY_SECRET;
  if (!secret) throw new Error("Set API_PROXY_SECRET.");
  const ip = incoming.get("x-forwarded-for")?.split(",")[0]?.trim();
  return { "x-proxy-secret": secret, ...(ip && { "x-client-ip": ip }), ...previewBypass() };
}

// API previews sit behind Vercel's Deployment Protection; production's API is public, for mobile.
function previewBypass(): Record<string, string> {
  if (process.env.VERCEL_ENV !== "preview") return {};
  const bypass = process.env.API_BYPASS_SECRET;
  if (!bypass) throw new Error("Set API_BYPASS_SECRET, the API project's protection bypass.");
  return { "x-vercel-protection-bypass": bypass };
}

// Vercel's Deployment Protection controls. Only this server's bypass reaches an API preview: a
// client's would get the API preview's bypass cookie and a redirect to an API path.
const protectionControls = ["x-vercel-protection-bypass", "x-vercel-set-bypass-cookie"];

// The API's URL and headers for a browser's /api/* request, or undefined for any other path. The
// path goes under a fixed origin, so no encoding of it (/%61pi/…) can change the API's host.
export function proxyTarget(request: Request) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) return undefined;
  const target = new URL(apiOrigin());
  target.pathname = url.pathname.slice("/api".length);
  target.search = new URLSearchParams(
    Array.from(url.searchParams).filter(
      ([name]) => !protectionControls.includes(name.toLowerCase()),
    ),
  ).toString();
  const headers = new Headers(request.headers);
  for (const name of ["host", "x-client-ip", ...protectionControls]) headers.delete(name);
  for (const [name, value] of Object.entries(upstreamHeaders(request.headers))) {
    headers.set(name, value);
  }
  return { url: target, headers };
}
