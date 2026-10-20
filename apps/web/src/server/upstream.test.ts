import { afterEach, beforeEach, expect, test } from "vitest";
import { proxyTarget } from "./upstream";

beforeEach(() => {
  process.env.API_URL = "http://api.test";
  process.env.API_PROXY_SECRET = "test-only-proxy-secret";
});
afterEach(() => {
  delete process.env.API_URL;
  delete process.env.API_PROXY_SECRET;
});

const target = (path: string, headers: Record<string, string> = {}) =>
  proxyTarget(new Request(`http://web.test${path}`, { headers }));

test("forwards /api/* to the API's /*, under the API's own origin", () => {
  expect(target("/api/accounts/1?a=b")?.url.href).toBe("http://api.test/accounts/1?a=b");
  expect(target("/api//evil.test/health")?.url.host).toBe("api.test");
});

test("refuses a path that only decodes to /api/, which would otherwise change the API's host", () => {
  expect(target("/%61pi/health")).toBeUndefined();
  expect(target("/ap%69/health")).toBeUndefined();
  expect(target("/api")).toBeUndefined();
});

test("drops a client's Vercel protection controls, in the query or the headers", () => {
  const forwarded = target(
    "/api/health?x-vercel-set-bypass-cookie=true&X-Vercel-Protection-Bypass=guess&a=b",
    { "x-vercel-set-bypass-cookie": "true", "x-vercel-protection-bypass": "guess" },
  )!;
  expect(forwarded.url.href).toBe("http://api.test/health?a=b");
  expect(forwarded.headers.has("x-vercel-set-bypass-cookie")).toBe(false);
  expect(forwarded.headers.has("x-vercel-protection-bypass")).toBe(false);
});

test("sends the visitor's IP only from x-forwarded-for, never a client's x-client-ip", () => {
  const forged = target("/api/health", { "x-client-ip": "203.0.113.7" })!;
  expect(forged.headers.has("x-client-ip")).toBe(false);
  const forwarded = target("/api/health", {
    "x-client-ip": "203.0.113.7",
    "x-forwarded-for": "198.51.100.1, 10.0.0.1",
  })!;
  expect(forwarded.headers.get("x-client-ip")).toBe("198.51.100.1");
  expect(forwarded.headers.get("x-proxy-secret")).toBe("test-only-proxy-secret");
});
