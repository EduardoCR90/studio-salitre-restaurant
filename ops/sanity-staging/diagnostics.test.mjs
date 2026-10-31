import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  diagnostic,
  DiagnosticError,
  safeMessage,
  readDiagnostic,
  writeDiagnostic,
  validDiagnostic,
} from "./diagnostics.mjs";
import { initializeGithubRun } from "./github-run.mjs";
import { prepare } from "./procedure.mjs";
import { CONFIRMATION } from "./core.mjs";

const privateValue = "PRIVATE-TOKEN-DOCUMENT-URL-RESPONSE";
async function temporary(fn) {
  const dir = await mkdtemp(join(tmpdir(), "safe-diagnostic-test-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
function env(dir) {
  return {
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main",
    GITHUB_REPOSITORY: "EduardoCR90/studio-salitre-restaurant",
    GITHUB_RUN_ID: "123",
    GITHUB_RUN_ATTEMPT: "1",
    RUNNER_TEMP: dir,
    CLONE_CONFIRMATION: CONFIRMATION,
    SANITY_SOURCE_READ_TOKEN: privateValue,
    SANITY_STAGING_WRITE_TOKEN: privateValue,
  };
}
test("categorías solo desde estado HTTP/código estructurado; nunca desde mensajes privados", () => {
  for (const [error, expected] of [
    [{ statusCode: 401 }, "credenciales"],
    [{ response: { statusCode: 403, body: privateValue } }, "permisos"],
    [{ statusCode: 404 }, "dataset"],
    [{ statusCode: 429 }, "conexión"],
    [{ statusCode: 503 }, "conexión"],
    [{ code: "ENOTFOUND" }, "conexión"],
    [{ cause: { code: "ETIMEDOUT" } }, "conexión"],
    [{ message: "401 " + privateValue }, "dataset"],
  ]) {
    const value = diagnostic("target-read", error);
    assert.equal(value.category, expected);
    assert.ok(!safeMessage(new DiagnosticError(value)).includes(privateValue));
    assert.ok(!JSON.stringify(value).includes(privateValue));
  }
  for (const [phase, category] of [
    ["target-empty", "dataset"],
    ["export-source", "exportación"],
    ["import-target", "importación"],
    ["verification", "verificación"],
  ])
    assert.equal(diagnostic(phase).category, category);
});
test("canal privado 0600, vocabulario cerrado y rechazo de registros/campos manipulados", () =>
  temporary(async (dir) => {
    const path = join(dir, "diagnostic.json");
    await writeDiagnostic(path, diagnostic("source-read", { statusCode: 403 }));
    assert.equal((await stat(path)).mode & 0o077, 0);
    assert.deepEqual(
      await readDiagnostic(path),
      diagnostic("source-read", { statusCode: 403 }),
    );
    for (const invalid of [
      null,
      { version: 1, phase: privateValue, category: "dataset" },
      { ...diagnostic("target-read"), body: privateValue },
      { ...diagnostic("target-read"), category: privateValue },
    ]) {
      assert.ok(!validDiagnostic(invalid));
      await writeFile(path, JSON.stringify(invalid));
      assert.equal(await readDiagnostic(path), null);
      assert.ok(!new DiagnosticError(invalid).message.includes(privateValue));
    }
    await writeFile(path, privateValue);
    assert.equal(await readDiagnostic(path), null);
  }));
test("variable ausente se diagnostica antes de archivos/hijos y solo se publica presencia", () =>
  temporary(async (dir) => {
    const logs = [];
    await assert.rejects(
      initializeGithubRun(
        { ...env(dir), SANITY_STAGING_WRITE_TOKEN: "  " },
        {
          log: (x) => logs.push(x),
          invoke: async () => assert.fail("Sin hijos"),
        },
      ),
      /categoría: credenciales/,
    );
    assert.match(logs[0], /SANITY_STAGING_WRITE_TOKEN=ausente/);
    assert.match(logs[0], /SANITY_SOURCE_READ_TOKEN=presente/);
    assert.ok(!logs.join().includes(privateValue));
  }));
test("rechazos de contexto, entorno y temporales tienen fases distintas y no invocan Sanity", () =>
  temporary(async (dir) => {
    for (const [change, expected] of [
      [{ GITHUB_REF: privateValue }, /autorización/],
      [{ RUNNER_TEMP: privateValue }, /entorno del runner/],
    ]) {
      await assert.rejects(
        initializeGithubRun(
          { ...env(dir), ...change },
          { log: () => {}, invoke: async () => assert.fail("Sin hijos") },
        ),
        expected,
      );
    }
  }));
test("fallo de hijo conserva fase/categoría seguras y no intenta importar ni reintentar", () =>
  temporary(async (dir) => {
    for (const value of [
      diagnostic("target-read", { statusCode: 403 }),
      diagnostic("target-empty"),
      diagnostic("export-source"),
      diagnostic("verification"),
    ]) {
      let calls = 0;
      const logs = [];
      await assert.rejects(
        initializeGithubRun(env(dir), {
          log: (x) => logs.push(x),
          invoke: async (_args, childEnv) => {
            calls++;
            await writeDiagnostic(childEnv.SANITY_CLONE_DIAGNOSTIC_FILE, value);
            throw new Error(privateValue);
          },
        }),
        (error) => {
          assert.deepEqual(error.diagnostic, value);
          assert.ok(!error.message.includes(privateValue));
          return true;
        },
      );
      assert.equal(calls, 1);
      assert.ok(!logs.join().includes(privateValue));
      await assert.rejects(
        readFile(join(dir, "sanity-staging-123-1", "diagnostic.json")),
      );
    }
  }));
test("preparación marca lectura y vacío antes de acceder a production; errores no incluyen documentos", () =>
  temporary(async (dir) => {
    const stages = [],
      reads = [];
    await assert.rejects(
      prepare(join(dir, "data"), {
        stage: async (p) => stages.push(p),
        read: async (dataset) => {
          reads.push(dataset);
          return [{ _id: privateValue, _type: "dish" }];
        },
        cli: async () => assert.fail("No se exporta ni importa"),
      }),
    );
    assert.deepEqual(stages, ["temporary", "target-read", "target-empty"]);
    assert.deepEqual(reads, ["staging"]);
  }));

test("fallo de importación publica su diagnóstico, nunca el de preparación, y no reintenta", () =>
  temporary(async (dir) => {
    for (const importDiagnostic of [
      diagnostic("import-target"),
      diagnostic("verification"),
      null,
    ]) {
      const calls = [],
        logs = [];
      await assert.rejects(
        initializeGithubRun(env(dir), {
          log: (value) => logs.push(value),
          invoke: async (args, childEnv) => {
            calls.push(args[0]);
            const data = args[args.indexOf("--directory") + 1];
            const channel = childEnv.SANITY_CLONE_DIAGNOSTIC_FILE;
            if (args[0] === "prepare") {
              await mkdir(data, { mode: 0o700 });
              await writeFile(
                join(data, "plan.json"),
                JSON.stringify({ digest: "a".repeat(64) }),
              );
              await writeDiagnostic(
                channel,
                diagnostic("source-read", { statusCode: 403 }),
              );
            } else {
              assert.equal(await readDiagnostic(channel), null);
              if (importDiagnostic)
                await writeDiagnostic(channel, importDiagnostic);
              throw new Error(privateValue);
            }
          },
        }),
        (error) => {
          assert.deepEqual(
            error.diagnostic,
            importDiagnostic || diagnostic("tools"),
          );
          assert.ok(!error.message.includes(privateValue));
          return true;
        },
      );
      assert.deepEqual(calls, ["prepare", "import"]);
      assert.ok(!logs.join().includes(privateValue));
    }
  }));
