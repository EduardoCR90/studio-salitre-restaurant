import assert from "node:assert/strict";
import {
  mkdir,
  realpath,
  stat,
  writeFile,
  readFile,
  open,
  access,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import {
  PROJECT,
  SOURCE,
  TARGET,
  CONFIRMATION,
  hash,
  assertEmpty,
  contentDocuments,
  validateDocuments,
  assertUnchanged,
  assertArchiveDocuments,
  compareDocuments,
  fingerprint,
} from "./core.mjs";
import { fileHash, inspectArchive } from "./archive.mjs";

async function outsideGit(path) {
  let current = path;
  while (true) {
    let exists = false;
    try {
      const info = await stat(join(current, ".git"));
      if (info.isFile()) exists = true;
      else if (info.isDirectory()) {
        // Un directorio .git vacío del sandbox no es un repositorio. HEAD identifica metadata real.
        try {
          await stat(join(current, ".git", "HEAD"));
          exists = true;
        } catch (error) {
          if (error.code !== "ENOENT") throw error;
        }
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    assert.ok(
      !exists,
      "Los datos y exports deben guardarse fuera de cualquier repositorio Git",
    );
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
export async function privateDirectory(path, create = false) {
  const directory = resolve(path);
  if (create) {
    await outsideGit(await realpath(dirname(directory)));
    await mkdir(directory, { mode: 0o700 });
  }
  const actual = await realpath(directory);
  await outsideGit(actual);
  const info = await stat(actual);
  assert.ok(
    info.isDirectory() && (info.mode & 0o077) === 0,
    "El directorio debe ser privado (0700)",
  );
  return actual;
}
async function json(path) {
  return JSON.parse(await readFile(path, "utf8"));
}
async function save(path, value, exclusive = false) {
  await writeFile(path, JSON.stringify(value, null, 2) + "\n", {
    mode: 0o600,
    flag: exclusive ? "wx" : "w",
  });
}
async function loadPlan(directory, expectedDigest) {
  const plan = await json(join(directory, "plan.json"));
  const { digest, ...body } = plan;
  assert.equal(hash(body), digest, "El plan fue modificado");
  if (expectedDigest !== undefined)
    assert.equal(
      digest,
      expectedDigest,
      "La huella no coincide con el plan revisado",
    );
  assert.equal(plan.version, 1);
  assert.equal(plan.projectId, PROJECT);
  assert.equal(plan.source, SOURCE);
  assert.equal(plan.target, TARGET);
  const source = await json(join(directory, "source-snapshot.json"));
  assert.equal(
    hash(source),
    plan.snapshotHash,
    "La instantánea fue modificada",
  );
  assert.equal(
    await fileHash(join(directory, "production.tar.gz")),
    plan.archiveHash,
    "El export fue modificado",
  );
  return { plan, source };
}
export async function prepare(path, deps) {
  await deps.stage?.("temporary");
  const directory = await privateDirectory(path, true);
  await deps.stage?.("target-read");
  const initialTarget = await deps.read(TARGET);
  await deps.stage?.("target-empty");
  assertEmpty(initialTarget);
  await deps.stage?.("source-read");
  const source = contentDocuments(await deps.read(SOURCE));
  await deps.stage?.("source-validation");
  const summary = validateDocuments(source);
  const archive = join(directory, "production.tar.gz");
  await deps.stage?.("export-source");
  await deps.cli("export-source", archive);
  await deps.stage?.("export-validation");
  const parsed = await (deps.inspect || inspectArchive)(archive);
  assertArchiveDocuments(source, parsed.documents, parsed.media);
  await deps.stage?.("source-unchanged");
  assertUnchanged(source, await deps.read(SOURCE));
  await deps.stage?.("target-read");
  const finalTarget = await deps.read(TARGET);
  await deps.stage?.("target-empty");
  assertEmpty(finalTarget);
  await deps.stage?.("plan");
  const snapshotHash = hash(source);
  const body = {
    version: 1,
    projectId: PROJECT,
    source: SOURCE,
    target: TARGET,
    tools: await deps.tools(),
    summary,
    snapshotHash,
    sourceFingerprint: fingerprint(source),
    archiveHash: await fileHash(archive),
    media: [...parsed.media].sort(([a], [b]) => a.localeCompare(b)),
  };
  const plan = { ...body, digest: hash(body) };
  await save(join(directory, "source-snapshot.json"), source, true);
  await save(join(directory, "plan.json"), plan, true);
  return {
    directory,
    digest: plan.digest,
    ...summary,
    status: "prepared-not-imported",
  };
}
export async function verify(path, deps) {
  await deps.stage?.("verification");
  const directory = await privateDirectory(path);
  const { plan, source } = await loadPlan(directory);
  const currentSource = contentDocuments(await deps.read(SOURCE));
  const target = contentDocuments(await deps.read(TARGET));
  validateDocuments(currentSource);
  validateDocuments(target, TARGET);
  const verification = join(
    directory,
    `staging-verification-${randomUUID()}.tar.gz`,
  );
  await deps.stage?.("export-target");
  await deps.cli("export-target", verification);
  await deps.stage?.("verification");
  const parsed = await (deps.inspect || inspectArchive)(verification);
  const sourceMatchesApprovedSnapshot =
    fingerprint(currentSource) === fingerprint(source);
  const differences = compareDocuments(currentSource, target);
  const mediaMatch =
    hash([...parsed.media].sort(([a], [b]) => a.localeCompare(b))) ===
    hash(plan.media);
  // Confirma también que el export de destino corresponde a sus documentos y archivos.
  assertArchiveDocuments(target, parsed.documents, parsed.media);
  assertUnchanged(currentSource, await deps.read(SOURCE));
  assertUnchanged(target, await deps.read(TARGET));
  const report = {
    status:
      sourceMatchesApprovedSnapshot && differences.length === 0 && mediaMatch
        ? "verified"
        : "different",
    projectId: PROJECT,
    source: SOURCE,
    target: TARGET,
    sourceMatchesApprovedSnapshot,
    sourceCount: currentSource.length,
    targetCount: target.length,
    differences,
    mediaMatch,
  };
  await save(
    join(directory, `verification-${randomUUID()}.json`),
    report,
    true,
  );
  return report;
}
export async function importInitial(path, confirmation, digest, deps) {
  await deps.stage?.("import-validation");
  assert.equal(
    confirmation,
    CONFIRMATION,
    "Falta la confirmación exacta de esta clonación",
  );
  assert.match(
    digest || "",
    /^[a-f0-9]{64}$/,
    "Falta la huella del plan revisado",
  );
  const directory = await privateDirectory(path);
  const { plan, source } = await loadPlan(directory, digest);
  assert.deepEqual(
    await deps.tools(),
    plan.tools,
    "Las versiones de las herramientas han cambiado",
  );
  await deps.stage?.("source-unchanged");
  assertUnchanged(source, await deps.read(SOURCE));
  await deps.stage?.("target-read");
  const targetBeforeValidation = await deps.read(TARGET);
  await deps.stage?.("target-empty");
  assertEmpty(targetBeforeValidation);
  await deps.stage?.("import-validation");
  const parsed = await (deps.inspect || inspectArchive)(
    join(directory, "production.tar.gz"),
  );
  assertArchiveDocuments(source, parsed.documents, parsed.media);
  // Marcador exclusivo persistente: una interrupción exige revisar, nunca reintentar a ciegas.
  const lock = await open(join(directory, "import-started.lock"), "wx", 0o600);
  await lock.close();
  await save(join(directory, "import-result.json"), {
    status: "starting",
    digest,
  });
  try {
    // Última comprobación inmediatamente antes del único comando que escribe.
    await deps.stage?.("target-read");
    const targetImmediatelyBeforeImport = await deps.read(TARGET);
    await deps.stage?.("target-empty");
    assertEmpty(targetImmediatelyBeforeImport);
    await deps.stage?.("import-target");
    await deps.cli("import-target", join(directory, "production.tar.gz"));
    await save(join(directory, "import-result.json"), {
      status: "import-command-completed",
      digest,
    });
    const report = await verify(directory, deps);
    assert.equal(
      report.status,
      "verified",
      "La comparación no coincide; consulta el informe privado. No se corrige ni borra nada automáticamente",
    );
    await save(join(directory, "import-result.json"), {
      status: "verified",
      digest,
      documents: report.targetCount,
    });
    return report;
  } catch (error) {
    await save(join(directory, "import-result.json"), {
      status: "needs-review-do-not-retry",
      digest,
    });
    throw error;
  }
}
