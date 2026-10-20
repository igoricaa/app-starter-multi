import { afterEach, assert, it } from "@effect/vitest";
import { neonHostParts, readDatabaseUrl } from "./database-host";

const read = (url: string, allowLocal = false) =>
  readDatabaseUrl("DATABASE_URL", url, { allowLocal });
const suffix = "c-2.eu-central-1.aws.neon.tech";
const neon = `ep-main-123.${suffix}`;
const other = `ep-other-9.${suffix}`;
// Neon reads an endpoint id or project from the password too.
const routingPassword = (name: string) => encodeURIComponent(`${name}=ep-main-123;p`);

afterEach(() => {
  for (const name of ["PGOPTIONS", "PGHOSTADDR", "PGPASSWORD"]) delete process.env[name];
});

it("reads the Neon URLs Vercel's integration sets", () => {
  assert.deepStrictEqual(read(`postgresql://u:p@${neon}/db?sslmode=require`), {
    endpoint: "ep-main-123",
    pooled: false,
    suffix,
  });
  assert.deepStrictEqual(
    read(`postgres://u:p@ep-main-123-pooler.${suffix}/db?sslmode=require&channel_binding=require`),
    { endpoint: "ep-main-123", pooled: true, suffix },
  );
  assert.deepStrictEqual(neonHostParts(`ep-main-123-pooler.${suffix}`), {
    endpoint: "ep-main-123",
    pooled: true,
    suffix,
  });
});

it("refuses anything else that could choose the server, or skip TLS", () => {
  for (const url of [
    `postgresql://u:p@${neon}./db?sslmode=require`,
    `postgresql://u:p@EP-MAIN-123.${suffix}/db?sslmode=require`,
    `postgresql://u:p@ep%2Dmain%2D123.${suffix}/db?sslmode=require`,
    `postgresql://u:p@${neon}:5432/db?sslmode=require`,
    `postgresql://u:p@${other}/db?sslmode=require&options=endpoint%3Dep-main-123`,
    `postgresql://u:p@${other}/db?sslmode=require&host=${neon}`,
    `postgresql://u:${routingPassword("endpoint")}@${other}/db?sslmode=require`,
    `postgresql://u:${routingPassword("project")}@${other}/db?sslmode=require`,
    `postgresql://u:p@/db?host=${neon}`,
    `postgresql://u@${other}/db?sslmode=require`,
    `postgresql://u:p@${other}/db`,
    `postgresql://u:p@${other}/db?sslmode=no-verify`,
    `postgresql://u:p@${other}/db?sslmode=prefer`,
    "postgresql://u:p@10.0.0.1/db?sslmode=require",
    "postgresql://u:p@db.example.test/db?sslmode=require",
    "postgresql://u:p@localhost:5432/db",
    `mysql://u:p@${neon}/db?sslmode=require`,
  ]) {
    assert.throws(() => read(url), /DATABASE_URL/, url);
  }
});

it("refuses while PGOPTIONS or PGHOSTADDR could reroute the connection", () => {
  process.env.PGOPTIONS = "endpoint=ep-main-123";
  assert.throws(() => read(`postgresql://u:p@${neon}/db?sslmode=require`), /PGOPTIONS/);
});

it("allows localhost only where asked, for dev and tests", () => {
  assert.isNull(read("postgresql://postgres@127.0.0.1:5432/app", true));
  assert.isNull(read("postgresql://postgres@localhost:5432/postgres", true));
  assert.throws(() => read("postgresql://postgres@db.example.test/app", true));
  process.env.PGPASSWORD = "endpoint=ep-main-123;p";
  assert.throws(() => read("postgresql://postgres@127.0.0.1:5432/app", true), /PGPASSWORD/);
});
