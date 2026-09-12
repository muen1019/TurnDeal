import { compile } from "json-schema-to-typescript";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, "../../contracts/a2a-commerce.v0.3.schema.json");
const outputPath = resolve(here, "../src/generated/contracts.d.ts");

function normalizeForTypes(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeForTypes);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const next = {};
  for (const [key, child] of Object.entries(value)) {
    if (["$schema", "$id", "if", "then", "else", "allOf", "not", "minItems", "maxItems", "minItems", "maxItems"].includes(key)) {
      continue;
    }

    if (key === "$ref" && typeof child === "string") {
      next[key] = child.replaceAll("#/$defs/", "#/definitions/");
      continue;
    }

    if (key === "$defs") {
      next.definitions = normalizeForTypes(child);
      continue;
    }

    next[key] = normalizeForTypes(child);
  }

  return next;
}

const contract = JSON.parse(await readFile(schemaPath, "utf8"));
const syntheticSchema = {
  title: "A2ACommerceContracts",
  type: "object",
  definitions: normalizeForTypes(contract.$defs),
  properties: Object.fromEntries(
    Object.keys(contract.$defs).map((name) => [name, { $ref: `#/definitions/${name}` }])
  ),
  additionalProperties: false
};

const ts = await compile(syntheticSchema, "A2ACommerceContracts", {
  bannerComment: "/* Generated from contracts/a2a-commerce.v0.3.schema.json. Do not edit by hand. */",
  cwd: resolve(here, "../.."),
  declareExternallyReferenced: true,
  enableConstEnums: false,
  style: {
    bracketSpacing: true,
    printWidth: 120,
    semi: true,
    singleQuote: false,
    tabWidth: 2,
    trailingComma: "none",
    useTabs: false
  },
  unreachableDefinitions: true
});

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, ts);
