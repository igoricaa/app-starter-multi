import { assert, it } from "@effect/vitest";
import { databaseHosts, isPooled, normalizeHost } from "./database-host";

const production = normalizeHost("ep-main-123-pooler.eu-central-1.aws.neon.tech");

it("finds production's host however the URL spells it", () => {
  for (const url of [
    "postgresql://u:p@ep-main-123.eu-central-1.aws.neon.tech/db?sslmode=require",
    "postgresql://u:p@EP-MAIN-123-POOLER.eu-central-1.aws.neon.tech/db",
    "postgresql://u:p@ep%2Dmain%2D123.eu-central-1.aws.neon.tech/db",
    "postgresql://u:p@preview.example.test/db?host=ep-main-123-pooler.eu-central-1.aws.neon.tech",
    "postgresql://u:p@preview.example.test/db?host=other.test%2Cep-main-123.eu-central-1.aws.neon.tech",
  ]) {
    assert.include(databaseHosts(url), production, url);
  }
  assert.notInclude(databaseHosts("postgresql://u:p@ep-preview-9.aws.neon.tech/db"), production);
});

it("tells a pooled URL from a direct one", () => {
  assert.isTrue(isPooled("postgresql://u:p@ep-main-123-pooler.aws.neon.tech/db"));
  assert.isTrue(isPooled("postgresql://u:p@direct.test/db?host=ep-main-123-pooler.aws.neon.tech"));
  assert.isFalse(isPooled("postgresql://u:p@ep-main-123.aws.neon.tech/db"));
});
