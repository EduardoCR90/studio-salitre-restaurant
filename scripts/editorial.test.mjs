import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createSchema } from "sanity";
import { validateDocument } from "@sanity/validation";
import { schemaTypes } from "../schemaTypes/index.ts";
import {
  pageComposition,
  siteEditorial,
  editorialHeading,
} from "../schemaTypes/editorial.ts";
const fixture = JSON.parse(
  await readFile(
    new URL("../tests/fixtures/editorial-contract.json", import.meta.url),
    "utf8",
  ),
);
function paths(value, prefix = "") {
  return Object.entries(value).flatMap(([k, v]) =>
    v && typeof v === "object" ? paths(v, prefix + k + ".") : [prefix + k],
  );
}
function fieldsPaths(fields, prefix = "") {
  return fields.flatMap((f) =>
    f.type === "object"
      ? fieldsPaths(f.fields || [], prefix + f.name + ".")
      : f.type === "editorialHeading"
        ? fieldsPaths(editorialHeading.fields, prefix + f.name + ".")
        : f.type === "contentLink"
          ? [prefix + f.name + ".label", prefix + f.name + ".href"]
          : [prefix + f.name],
  );
}
test("todos los campos compartidos están registrados sin eliminar tipos ni cambiar singletons", () => {
  for (const path of paths(fixture.page.composition))
    assert.ok(fieldsPaths(pageComposition.fields).includes(path), path);
  for (const path of paths(fixture.settings.editorial))
    assert.ok(fieldsPaths(siteEditorial.fields).includes(path), path);
  assert.ok(
    schemaTypes
      .find((t) => t.name === "page")
      .fields.some(
        (f) => f.name === "composition" && f.type === "pageComposition",
      ),
  );
  assert.ok(
    schemaTypes
      .find((t) => t.name === "settings")
      .fields.some(
        (f) => f.name === "socialImage" && f.type === "editorialImage",
      ),
  );
  for (const name of [
    "settings",
    "page",
    "category",
    "dish",
    "story",
    "gallery",
    "editorialImage",
    "seo",
  ])
    assert.ok(schemaTypes.some((t) => t.name === name));
});
const schema = createSchema({
  name: "offline-editorial-contract",
  types: [
    ...schemaTypes,
    {
      name: "editorialProbe",
      type: "document",
      fields: [
        { name: "composition", type: "pageComposition" },
        { name: "editorial", type: "siteEditorial" },
      ],
    },
  ],
});
let externalCalls = 0;
const client = {
  config: () => ({ projectId: "fixture1", dataset: "offline" }),
  withConfig() {
    return this;
  },
  fetch() {
    externalCalls++;
    throw new Error("No se permite consultar Sanity en este test");
  },
};
async function markers(fields) {
  const result = await validateDocument({
    document: {
      _id: "offline-probe",
      _type: "editorialProbe",
      _rev: "fixture",
      ...fields,
    },
    schema,
    client,
    customValidation: true,
    getDocumentExists: async () => false,
  });
  assert.notEqual(result.status, "notEvaluated");
  assert.equal(externalCalls, 0);
  return Array.isArray(result) ? result : result.markers || [];
}
test("validador oficial acepta fixture y documentos sin campos nuevos, sin llamadas a Sanity", async () => {
  assert.deepEqual(
    await markers({
      composition: fixture.page.composition,
      editorial: fixture.settings.editorial,
    }),
    [],
  );
  assert.deepEqual(await markers({}), []);
  assert.deepEqual(
    await markers({ composition: null, editorial: { footer: { link: null } } }),
    [],
  );
});
test("validador oficial rechaza titulares vacíos, enlaces inseguros y texto vacío", async () => {
  for (const composition of [
    { essence: { heading: {} } },
    { hero: { link: { label: "X", href: "javascript:alert(1)" } } },
    { hero: { caption: "  " } },
  ])
    assert.ok(
      (await markers({ composition })).length > 0,
      JSON.stringify(composition),
    );
});
