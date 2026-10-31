import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export const PROJECT = "hfa8zkyw";
export const SOURCE = "production";
export const TARGET = "staging";
export const CONFIRMATION = "CLONAR production -> staging";
export const ASSET_TYPES = new Set(["sanity.imageAsset", "sanity.fileAsset"]);
export const hash = (value) =>
  createHash("sha256")
    .update(
      typeof value === "string" || Buffer.isBuffer(value)
        ? value
        : canonical(value),
    )
    .digest("hex");
export function canonical(value) {
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort()
        .map((k) => JSON.stringify(k) + ":" + canonical(value[k]))
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
export function contentDocuments(docs) {
  return docs.filter(
    (d) => !d._id.startsWith("_.") || d._id.startsWith("_.releases."),
  );
}
export function assertEmpty(docs) {
  assert.equal(
    contentDocuments(docs).length,
    0,
    "staging contiene documentos o assets; no se importará ni sobrescribirá nada",
  );
}
export function assetPath(doc) {
  const match = doc._id.match(
    /^(image|file)-([a-f0-9]{40})-(?:(\d+x\d+)-)?([a-z0-9]+)$/,
  );
  assert.ok(match, "ID de asset no soportado");
  assert.equal(match[2], doc.sha1hash, "Hash del ID de asset incompatible");
  if (match[1] === "image")
    assert.equal(
      match[3],
      `${doc.metadata?.dimensions?.width}x${doc.metadata?.dimensions?.height}`,
      "Dimensiones del ID de imagen incompatibles",
    );
  const filename = doc._id.match(/^(image|file)-(.*?)(-[a-z]+)?$/);
  return `${match[1]}s/${filename[2]}.${(filename[3] || "bin").replace(/^-/, "")}`;
}
function assetLocation(doc, dataset) {
  const kind = doc._type === "sanity.imageAsset" ? "images" : "files";
  const prefix = `${kind}/${PROJECT}/${dataset}/`;
  const url = new URL(doc.url);
  assert.equal(
    url.origin,
    "https://cdn.sanity.io",
    "Origen de asset inesperado",
  );
  assert.ok(
    url.pathname.slice(1).startsWith(prefix),
    "Asset no pertenece al dataset esperado",
  );
  assert.ok(
    String(doc.path).startsWith(prefix),
    "Ruta de asset no pertenece al dataset esperado",
  );
  return {
    url:
      `https://cdn.sanity.io/${kind}/${PROJECT}/<dataset>/` +
      url.pathname.slice(prefix.length + 1) +
      url.search,
    path: `${kind}/${PROJECT}/<dataset>/` + doc.path.slice(prefix.length),
  };
}
export function normalized(doc, dataset) {
  const result = structuredClone(doc);
  for (const k of ["_rev", "_createdAt", "_updatedAt"]) delete result[k];
  if (ASSET_TYPES.has(doc._type)) {
    Object.assign(result, assetLocation(doc, dataset));
    delete result.uploadId;
  }
  return result;
}
export function fingerprint(docs) {
  return hash(
    contentDocuments(docs).toSorted((a, b) => a._id.localeCompare(b._id)),
  );
}
export function assertUnchanged(before, after) {
  assert.equal(
    fingerprint(after),
    fingerprint(before),
    "El dataset ha cambiado durante la operación; se requiere una revisión nueva",
  );
}
export function validateDocuments(input, dataset = SOURCE) {
  const docs = contentDocuments(input);
  const ids = new Set(docs.map((d) => d._id));
  assert.equal(ids.size, docs.length, "IDs duplicados");
  assert.ok(docs.length > 0, "El origen no contiene documentos para clonar");
  let references = 0;
  let weakMissing = 0;
  function walk(value) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === "object")
          assert.ok(
            typeof item._key === "string",
            "Array sin _key: la CLI lo modificaría; revisar primero",
          );
        walk(item);
      }
      return;
    }
    if (!value || typeof value !== "object") return;
    assert.ok(
      !("_dataset" in value) && !("_projectId" in value),
      "Referencia entre datasets/proyectos no soportada; revisar antes de clonar",
    );
    if (typeof value._ref === "string") {
      assert.equal(
        value._type,
        "reference",
        "Referencia sin _type: la CLI la modificaría",
      );
      assert.ok(
        value._weak !== false,
        "_weak=false explícito requiere revisión antes de importar",
      );
      references++;
      if (!ids.has(value._ref)) {
        assert.equal(value._weak, true, "Referencia fuerte sin destino");
        weakMissing++;
      }
    }
    Object.values(value).forEach(walk);
  }
  for (const doc of docs) {
    assert.ok(
      typeof doc._id === "string" && typeof doc._type === "string",
      "Documento sin ID/tipo",
    );
    assert.ok(
      !doc._id.startsWith("versions.") && !doc._id.startsWith("_.releases."),
      "Content Releases requiere un procedimiento específico; no se ha importado nada",
    );
    if (ASSET_TYPES.has(doc._type)) normalized(doc, dataset);
    else walk(doc);
  }
  return {
    documents: docs.length,
    assets: docs.filter((d) => ASSET_TYPES.has(d._type)).length,
    references,
    weakMissing,
    byType: docs.reduce(
      (a, d) => ((a[d._type] = (a[d._type] || 0) + 1), a),
      {},
    ),
  };
}
export function restoreAssetReferences(value, assets) {
  if (Array.isArray(value))
    return value.map((x) => restoreAssetReferences(x, assets));
  if (!value || typeof value !== "object") return value;
  const { _sanityAsset, ...rest } = value;
  const result = Object.fromEntries(
    Object.entries(rest).map(([k, v]) => [
      k,
      restoreAssetReferences(v, assets),
    ]),
  );
  if (_sanityAsset !== undefined) {
    assert.equal(typeof _sanityAsset, "string");
    const match = _sanityAsset.match(
      /^(image|file)@file:\/\/\.\/(images\/[^/]+|files\/[^/]+)$/,
    );
    assert.ok(match, "Placeholder de asset externo o no soportado");
    assert.ok(
      assets.has(match[2]),
      "Asset del documento no incluido en el archivo",
    );
    result.asset = { _type: "reference", _ref: assets.get(match[2])._id };
  }
  return result;
}
export function compareDocuments(source, target) {
  const a = new Map(contentDocuments(source).map((d) => [d._id, d]));
  const b = new Map(contentDocuments(target).map((d) => [d._id, d]));
  const differences = [];
  for (const [id, doc] of a) {
    if (!b.has(id)) differences.push({ id, reason: "missing" });
    else if (
      canonical(normalized(doc, SOURCE)) !==
      canonical(normalized(b.get(id), TARGET))
    )
      differences.push({ id, reason: "content" });
  }
  for (const id of b.keys())
    if (!a.has(id)) differences.push({ id, reason: "extra" });
  return differences;
}
export function assertArchiveDocuments(source, exported, media) {
  const assets = new Map(
    source
      .filter((d) => ASSET_TYPES.has(d._type))
      .map((d) => [assetPath(d), d]),
  );
  assert.equal(assets.size, media.size, "Faltan o sobran archivos multimedia");
  for (const [path, asset] of assets) {
    const entry = media.get(path);
    assert.ok(entry, "Recurso multimedia ausente");
    assert.equal(entry.size, asset.size, "Tamaño de asset distinto al origen");
    assert.equal(
      entry.sha1,
      asset.sha1hash,
      "Bytes del asset no conservan su hash/ID; revisar formato antes de importar",
    );
  }
  const expected = source.filter((d) => !ASSET_TYPES.has(d._type));
  const actual = exported.map((d) => restoreAssetReferences(d, assets));
  assert.deepEqual(
    actual.map((d) => d._id).sort(),
    expected.map((d) => d._id).sort(),
    "El export no conserva todos los IDs",
  );
  const byId = new Map(actual.map((d) => [d._id, d]));
  for (const doc of expected)
    assert.equal(
      canonical(normalized(byId.get(doc._id), SOURCE)),
      canonical(normalized(doc, SOURCE)),
      "El export cambia campos o referencias del documento",
    );
}
export function cliSpec(operation, archive) {
  assert.ok(
    ["export-source", "export-target", "import-target"].includes(operation),
    "Operación CLI prohibida",
  );
  const dataset = operation === "export-source" ? SOURCE : TARGET;
  const args =
    operation === "import-target"
      ? [
          "datasets",
          "import",
          archive,
          "--dataset",
          TARGET,
          "--project-id",
          PROJECT,
        ]
      : [
          "datasets",
          "export",
          dataset,
          archive,
          "--project-id",
          PROJECT,
          "--mode",
          "stream",
        ];
  return { args, dataset, write: operation === "import-target" };
}
