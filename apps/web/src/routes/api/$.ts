import { createFileRoute } from "@tanstack/react-router";
import { createCsrfMiddleware } from "@tanstack/react-start";
import { apiOrigin, upstreamHeaders } from "~/server/upstream";

// The browser's way to the API: /api/* here is the API's /*, on this origin so the session cookie
// stays first-party. Cross-site browser requests are refused; a request with no browser headers at
// all carries no ambient cookie, so it passes.
const csrf = createCsrfMiddleware({ allowRequestsWithoutOriginCheck: true });

async function forward({ request }: { request: Request }) {
  const url = new URL(request.url);
  const headers = new Headers(request.headers);
  headers.delete("host");
  // On a protected preview, a client asking Vercel to set this deployment's bypass cookie would
  // get the API preview's cookie and a redirect to an API path instead.
  headers.delete("x-vercel-set-bypass-cookie");
  for (const [name, value] of Object.entries(upstreamHeaders(request.headers))) {
    headers.set(name, value);
  }
  // Node's fetch streams a request body only with `duplex`, which the DOM types lack.
  const init: RequestInit & { duplex: "half" } = {
    method: request.method,
    headers,
    body: request.body,
    redirect: "manual",
    duplex: "half",
  };
  const response = await fetch(
    `${apiOrigin()}${url.pathname.slice("/api".length)}${url.search}`,
    init,
  );
  const returned = new Headers(response.headers);
  // fetch has already decoded the body.
  returned.delete("content-encoding");
  returned.delete("content-length");
  // The bearer plugin's copy of the session token is for mobile; the browser keeps its HttpOnly cookie.
  returned.delete("set-auth-token");
  return new Response(response.body, { status: response.status, headers: returned });
}

export const Route = createFileRoute("/api/$")({
  server: { middleware: [csrf], handlers: { ANY: forward } },
});
