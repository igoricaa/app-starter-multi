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
