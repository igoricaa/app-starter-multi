import { afterEach, assert, it } from "@effect/vitest";
import { neonEndpoint, readDatabaseUrl } from "./database-host";

const read = (url: string, allowLocal = false) =>
  readDatabaseUrl("DATABASE_URL", url, { allowLocal });
const neon = "ep-main-123.c-2.eu-central-1.aws.neon.tech";
const other = "ep-other-9.c-2.eu-central-1.aws.neon.tech";
// Neon reads an endpoint id from the password too.
const endpointPassword = encodeURIComponent("endpoint=ep-main-123;p");

afterEach(() => {
  delete process.env.PGOPTIONS;
  delete process.env.PGHOSTADDR;
});

it("reads the endpoint of the Neon URLs Vercel's integration sets", () => {
  assert.deepStrictEqual(read(`postgresql://u:p@${neon}/db?sslmode=require`), {
    endpoint: "ep-main-123",
    pooled: false,
  });
  assert.deepStrictEqual(
    read(
      "postgres://u:p@ep-main-123-pooler.c-2.eu-central-1.aws.neon.tech/db?sslmode=require&channel_binding=require",
    ),
    { endpoint: "ep-main-123", pooled: true },
  );
  assert.strictEqual(
    neonEndpoint(`ep-main-123-pooler.c-2.eu-central-1.aws.neon.tech`),
    "ep-main-123",
  );
});

it("refuses anything else that could choose the server", () => {
  for (const url of [
    `postgresql://u:p@${neon}./db`,
    `postgresql://u:p@EP-MAIN-123.c-2.eu-central-1.aws.neon.tech/db`,
    `postgresql://u:p@ep%2Dmain%2D123.c-2.eu-central-1.aws.neon.tech/db`,
    `postgresql://u:p@${neon}:5432/db`,
    `postgresql://u:p@${other}/db?options=endpoint%3Dep-main-123`,
    `postgresql://u:p@${other}/db?host=${neon}`,
    `postgresql://u:${endpointPassword}@${other}/db`,
    `postgresql://u:p@/db?host=${neon}`,
    "postgresql://u:p@10.0.0.1/db",
    "postgresql://u:p@db.example.test/db",
    "postgresql://u:p@localhost:5432/db",
    `mysql://u:p@${neon}/db`,
  ]) {
    assert.throws(() => read(url), /DATABASE_URL/, url);
  }
});

it("refuses while PGOPTIONS or PGHOSTADDR could reroute the connection", () => {
  process.env.PGOPTIONS = "endpoint=ep-main-123";
  assert.throws(() => read(`postgresql://u:p@${neon}/db`), /PGOPTIONS/);
});

it("allows localhost only where asked, for dev and tests", () => {
  assert.deepStrictEqual(read("postgresql://postgres@127.0.0.1:5432/app", true), {
    endpoint: null,
    pooled: false,
  });
  assert.doesNotThrow(() => read("postgresql://postgres@localhost:5432/postgres", true));
  assert.throws(() => read("postgresql://postgres@db.example.test/app", true));
});
