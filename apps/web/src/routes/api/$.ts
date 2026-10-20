import { createFileRoute } from "@tanstack/react-router";
import { createCsrfMiddleware } from "@tanstack/react-start";
import { proxyTarget } from "~/server/upstream";

// The browser's way to the API: /api/* here is the API's /*, on this origin so the session cookie
// stays first-party. Cross-site browser requests are refused; a request with no browser headers at
// all carries no ambient cookie, so it passes.
const csrf = createCsrfMiddleware({ allowRequestsWithoutOriginCheck: true });

async function forward({ request }: { request: Request }) {
  const target = proxyTarget(request);
  if (!target) return new Response(null, { status: 404 });
  // Node's fetch streams a request body only with `duplex`, which the DOM types lack.
  const init: RequestInit & { duplex: "half" } = {
    method: request.method,
    headers: target.headers,
    body: request.body,
    redirect: "manual",
    duplex: "half",
  };
  const response = await fetch(target.url, init);
  const returned = new Headers(response.headers);
  // fetch has already decoded the body.
  returned.delete("content-encoding");
  returned.delete("content-length");
  // The signed session token, the only one the API takes as a bearer, is for mobile apps; browser
  // scripts never see it.
  returned.delete("set-auth-token");
  return new Response(response.body, { status: response.status, headers: returned });
}

export const Route = createFileRoute("/api/$")({
  server: { middleware: [csrf], handlers: { ANY: forward } },
});
