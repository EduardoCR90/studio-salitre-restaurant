import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  canonical,
  cliSpec,
  PROJECT,
  SOURCE,
  TARGET,
  CONFIRMATION,
  hash,
  normalized,
  assertEmpty,
  compareDocuments,
  validateDocuments,
  assetPath,
} from "./core.mjs";
import {
  prepare,
  importInitial,
  verify,
  privateDirectory,
} from "./procedure.mjs";
import { inspectArchive } from "./archive.mjs";

const bytes = Buffer.from("synthetic asset for isolated tests");
const sha1 = createHash("sha1").update(bytes).digest("hex");
const assetId = `image-${sha1}-10x10-jpg`;
function fixture(dataset = SOURCE) {
  return [
    {
      _id: "category-generated",
      _rev: "source-1",
      _type: "category",
      name: "Entrantes",
      order: 0,
    },
    {
      _id: "dish-generated",
      _rev: "source-2",
      _type: "dish",
      name: "Plato sintético",
      price: 18,
      category: { _type: "reference", _ref: "category-generated" },
      image: {
        _type: "editorialImage",
        alt: "Imagen sintética",
        asset: { _type: "reference", _ref: assetId },
      },
    },
    {
      _id: "drafts.dish-generated",
      _rev: "source-3",
      _type: "dish",
      name: "Borrador sintético",
      category: { _type: "reference", _ref: "category-generated" },
    },
    {
      _id: assetId,
      _type: "sanity.imageAsset",
      _rev: "source-4",
      sha1hash: sha1,
      size: bytes.length,
      mimeType: "image/jpeg",
      originalFilename: "test.jpg",
      url: `https://cdn.sanity.io/images/${PROJECT}/${dataset}/${sha1}-10x10.jpg`,
      path: `images/${PROJECT}/${dataset}/${sha1}-10x10.jpg`,
      uploadId: dataset,
      metadata: { dimensions: { width: 10, height: 10, aspectRatio: 1 } },
    },
  ];
}
function exported(value) {
  if (Array.isArray(value)) return value.map(exported);
  if (!value || typeof value !== "object") return value;
  const { asset, ...rest } = value;
  const result = Object.fromEntries(
    Object.entries(rest).map(([k, v]) => [k, exported(v)]),
  );
  if (asset) result._sanityAsset = `image@file://./images/${sha1}-10x10.jpg`;
  return result;
}
async function tarFixture(destination, docs, missing = false) {
  const folder = await mkdtemp(join(tmpdir(), "synthetic-export-"));
  try {
    await writeFile(
      join(folder, "data.ndjson"),
      docs
        .filter((d) => d._type !== "sanity.imageAsset")
        .map((d) => JSON.stringify(exported(d)))
        .join("\n") + "\n",
    );
    await writeFile(join(folder, "assets.json"), "{}");
    if (!missing) {
      await mkdir(join(folder, "images"));
      await writeFile(
        join(
          folder,
          assetPath(docs.find((d) => d._type === "sanity.imageAsset")),
        ),
        bytes,
      );
    }
    execFileSync(
      "tar",
      [
        "-czf",
        destination,
        "-C",
        folder,
        "data.ndjson",
        "assets.json",
        ...(!missing ? ["images"] : []),
      ],
      { stdio: "ignore" },
    );
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
}
async function sandbox(fn) {
  const base = await mkdtemp(join(tmpdir(), "staging-tool-test-"));
  try {
    return await fn(base);
  } finally {
    await rm(base, { recursive: true, force: true });
  }
}
function dependencies() {
  const state = { source: fixture(), target: [], calls: [], reads: [] };
  const deps = {
    tools: async () => ({ cli: "8.23.0", client: "8.11.0" }),
    read: async (dataset) => {
      state.reads.push(dataset);
      return structuredClone(dataset === SOURCE ? state.source : state.target);
    },
    cli: async (action, path) => {
      state.calls.push(action);
      if (action === "import-target") {
        state.target = fixture(TARGET).map((d) => ({ ...d, _rev: "imported" }));
        return;
      }
      await tarFixture(
        path,
        action === "export-source" ? state.source : state.target,
      );
    },
  };
  return { state, deps };
}
test("comandos oficiales con proyecto/dataset explícitos; ninguna opción de sustitución o salto", () => {
  for (const action of ["export-source", "export-target", "import-target"]) {
    const spec = cliSpec(action, "/tmp/export.tar.gz");
    assert.ok(spec.args.includes("--project-id"));
    assert.ok(spec.args.includes(PROJECT));
    for (const forbidden of [
      "--replace",
      "--missing",
      "--replace-assets",
      "--allow-failing-assets",
      "--no-assets",
      "--raw",
      "--no-drafts",
    ])
      assert.ok(!spec.args.includes(forbidden));
    if (spec.write) {
      assert.equal(spec.dataset, TARGET);
      assert.ok(!spec.args.includes(SOURCE));
    }
  }
  assert.throws(() => cliSpec("delete-source", "x"));
});
test("destino con cualquier documento, borrador o asset se bloquea; metadatos internos se ignoran", () => {
  for (const doc of fixture()) assert.throws(() => assertEmpty([doc]));
  assert.doesNotThrow(() =>
    assertEmpty([{ _id: "_.schemas.salitre", _type: "system.schema" }]),
  );
  assert.throws(() =>
    assertEmpty([{ _id: "_.releases.test", _type: "system.release" }]),
  );
});
test("normalización solo permite diferencias generadas de asset y fechas/revisiones", () => {
  const a = fixture();
  const b = fixture(TARGET).map((d) => ({
    ...d,
    _rev: "new",
    _createdAt: "later",
  }));
  assert.deepEqual(compareDocuments(a, b), []);
  b[1].category._ref = "other";
  assert.equal(compareDocuments(a, b)[0].reason, "content");
  assert.equal(
    canonical(normalized(a[3], SOURCE)),
    canonical(normalized(b[3], TARGET)),
  );
});
test("detecta referencias fuertes rotas, claves ausentes, referencias externas y Releases antes de escribir", () => {
  for (const mutate of [
    (docs) => (docs[1].category._ref = "missing"),
    (docs) => (docs[1].bad = [{ text: "Sin key" }]),
    (docs) => (docs[1].category._dataset = "production"),
    (docs) => docs.push({ _id: "versions.release.foo", _type: "page" }),
  ]) {
    const docs = fixture();
    mutate(docs);
    assert.throws(() => validateDocuments(docs));
  }
});
test("export sintético se inspecciona y conserva binarios sin extraer archivos al repositorio", async () =>
  sandbox(async (base) => {
    const archive = join(base, "export.tar.gz");
    await tarFixture(archive, fixture());
    const parsed = await inspectArchive(archive);
    assert.equal(parsed.documents.length, 3);
    assert.equal(parsed.media.size, 1);
    assert.equal(parsed.media.get(assetPath(fixture()[3])).sha1, sha1);
  }));
test("prepare no importa; destino ocupado detiene incluso el export", async () =>
  sandbox(async (base) => {
    const { state, deps } = dependencies();
    state.target = [fixture()[0]];
    await assert.rejects(
      prepare(join(base, "private"), deps),
      /staging contiene/,
    );
    assert.deepEqual(state.calls, []);
  }));
test("prepare + import + verify de ensayo conserva IDs/referencias/borrador y no cambia el origen", async () =>
  sandbox(async (base) => {
    const { state, deps } = dependencies();
    const original = hash(state.source);
    const dir = join(base, "private");
    const plan = await prepare(dir, deps);
    assert.equal(plan.status, "prepared-not-imported");
    assert.deepEqual(state.calls, ["export-source"]);
    const result = await importInitial(dir, CONFIRMATION, plan.digest, deps);
    assert.equal(result.status, "verified");
    assert.equal(result.targetCount, 4);
    assert.equal(hash(state.source), original);
    assert.equal(state.calls.filter((x) => x === "import-target").length, 1);
    assert.deepEqual(compareDocuments(state.source, state.target), []);
    await assert.rejects(
      importInitial(dir, CONFIRMATION, plan.digest, deps),
      /staging contiene/,
    );
  }));
test("falta de confirmación o huella no consulta ni importa", async () => {
  const { state, deps } = dependencies();
  await assert.rejects(
    importInitial("/no-directory", "", undefined, deps),
    /confirmación/,
  );
  await assert.rejects(
    importInitial("/no-directory", CONFIRMATION, undefined, deps),
    /huella/,
  );
  assert.deepEqual(state.reads, []);
  assert.deepEqual(state.calls, []);
});
test("cambio del origen entre revisión e importación bloquea el comando de escritura", async () =>
  sandbox(async (base) => {
    const { state, deps } = dependencies();
    const dir = join(base, "private");
    const plan = await prepare(dir, deps);
    state.source[0].name = "Cambio";
    await assert.rejects(
      importInitial(dir, CONFIRMATION, plan.digest, deps),
      /ha cambiado/,
    );
    assert.deepEqual(state.calls, ["export-source"]);
  }));
test("archivo alterado o huella incorrecta se rechaza antes de escribir", async () =>
  sandbox(async (base) => {
    const { state, deps } = dependencies();
    const dir = join(base, "private");
    const plan = await prepare(dir, deps);
    await assert.rejects(
      importInitial(dir, CONFIRMATION, "0".repeat(64), deps),
      /huella/,
    );
    await writeFile(join(dir, "production.tar.gz"), "alterado");
    await assert.rejects(
      importInitial(dir, CONFIRMATION, plan.digest, deps),
      /export fue modificado/,
    );
    assert.deepEqual(state.calls, ["export-source"]);
  }));
test("asset omitido en el export (por ejemplo CDN 404) impide preparar el plan", async () =>
  sandbox(async (base) => {
    const { deps } = dependencies();
    deps.cli = async (_action, path) => tarFixture(path, fixture(), true);
    await assert.rejects(prepare(join(base, "private"), deps), /multimedia/);
  }));
test("carrera en la última comprobación vacía se detiene sin llamar a import", async () =>
  sandbox(async (base) => {
    const { state, deps } = dependencies();
    const dir = join(base, "private");
    const plan = await prepare(dir, deps);
    let checks = 0;
    const read = deps.read;
    deps.read = async (dataset) =>
      dataset === TARGET && ++checks === 2 ? [fixture()[0]] : read(dataset);
    await assert.rejects(
      importInitial(dir, CONFIRMATION, plan.digest, deps),
      /staging contiene/,
    );
    assert.deepEqual(state.calls, ["export-source"]);
  }));
test("fallo parcial conserva recibo y no borra ni reintenta documentos", async () =>
  sandbox(async (base) => {
    const { state, deps } = dependencies();
    const dir = join(base, "private");
    const plan = await prepare(dir, deps);
    deps.cli = async () => {
      state.target = [fixture()[0]];
      throw new Error("simulated interruption");
    };
    await assert.rejects(
      importInitial(dir, CONFIRMATION, plan.digest, deps),
      /simulated/,
    );
    assert.equal(
      JSON.parse(await readFile(join(dir, "import-result.json"))).status,
      "needs-review-do-not-retry",
    );
    await assert.rejects(
      importInitial(dir, CONFIRMATION, plan.digest, deps),
      /staging contiene/,
    );
    assert.equal(state.target.length, 1);
  }));
test("verify solo lee/exporta y detecta diferencias sin corregirlas", async () =>
  sandbox(async (base) => {
    const { state, deps } = dependencies();
    const dir = join(base, "private");
    const plan = await prepare(dir, deps);
    await importInitial(dir, CONFIRMATION, plan.digest, deps);
    state.target[1].price = 99;
    state.calls = [];
    const report = await verify(dir, deps);
    assert.equal(report.status, "different");
    assert.equal(report.differences[0].id, "dish-generated");
    assert.deepEqual(state.calls, ["export-target"]);
    assert.equal(state.target[1].price, 99);
  }));
test("no permite escribir archivos de operación dentro de un repositorio Git", async () =>
  sandbox(async (base) => {
    await mkdir(join(base, ".git"));
    await writeFile(join(base, ".git/HEAD"), "ref: refs/heads/main");
    await assert.rejects(
      privateDirectory(join(base, "data"), true),
      /fuera de cualquier repositorio/,
    );
  }));
