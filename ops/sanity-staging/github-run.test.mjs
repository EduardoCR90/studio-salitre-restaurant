import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  stat,
  rm,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { CONFIRMATION } from "./core.mjs";
import {
  authorizeRun,
  initializeGithubRun,
  cleanupRun,
} from "./github-run.mjs";

function environment(temporary) {
  return {
    GITHUB_ACTIONS: "true",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_REF: "refs/heads/main",
    GITHUB_REPOSITORY: "EduardoCR90/studio-salitre-restaurant",
    GITHUB_RUN_ID: "12345",
    GITHUB_RUN_ATTEMPT: "1",
    RUNNER_TEMP: temporary,
    CLONE_CONFIRMATION: CONFIRMATION,
    SANITY_SOURCE_READ_TOKEN: "synthetic-read-token",
    SANITY_STAGING_WRITE_TOKEN: "synthetic-staging-token",
  };
}
async function isolated(fn) {
  const temporary = await mkdtemp(join(tmpdir(), "workflow-clone-test-"));
  try {
    return await fn(temporary, environment(temporary));
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
const runDirectory = (temporary) => join(temporary, "sanity-staging-12345-1");
const digest = "a".repeat(64);
const privateMarker = "SYNTHETIC-PRIVATE-EXPORT-CONTENT";
function invocation(logs, calls, behavior = {}) {
  return async (args, env) => {
    calls.push([...args]);
    assert.equal(env.SANITY_SOURCE_READ_TOKEN, "synthetic-read-token");
    const data = args[args.indexOf("--directory") + 1];
    assert.equal(env.TMPDIR, join(data, "..", "cli-tmp"));
    assert.equal((await stat(env.TMPDIR)).mode & 0o077, 0);
    await writeFile(
      join(env.TMPDIR, "synthetic-unpacked-data"),
      privateMarker,
      { mode: 0o600 },
    );
    if (args[0] === "prepare") {
      await mkdir(data, { mode: 0o700 });
      await writeFile(
        join(data, "plan.json"),
        JSON.stringify({
          digest: behavior.invalidDigest ? "invalid-private-value" : digest,
          privateMetadata: privateMarker,
        }),
        { mode: 0o600 },
      );
      await writeFile(join(data, "production.tar.gz"), privateMarker, {
        mode: 0o600,
      });
      assert.equal((await stat(data)).mode & 0o077, 0);
      if (behavior.prepareFails) throw new Error(privateMarker);
    } else {
      assert.equal(args[0], "import");
      assert.equal(args[args.indexOf("--digest") + 1], digest);
      assert.equal(args[args.indexOf("--confirm") + 1], CONFIRMATION);
      assert.equal(
        await readFile(join(data, "production.tar.gz"), "utf8"),
        privateMarker,
      );
      if (behavior.importFails) throw new Error(privateMarker);
      await writeFile(
        join(data, "import-result.json"),
        JSON.stringify({
          status: behavior.badReceipt ? "different" : "verified",
          digest: behavior.badDigest ? "b".repeat(64) : digest,
        }),
      );
    }
    // Un hijo real tendría stdout/stderr descartados; el mock no imprime los datos.
    assert.ok(!logs.some((x) => x.includes(privateMarker)));
  };
}

test("solo autoriza dispatch/main/repositorio correcto, confirmación previa y secretos presentes", () => {
  const env = environment("/tmp");
  assert.doesNotThrow(() => authorizeRun(env));
  for (const change of [
    { GITHUB_EVENT_NAME: "push" },
    { GITHUB_EVENT_NAME: "pull_request" },
    { GITHUB_REF: "refs/heads/feature" },
    { GITHUB_REPOSITORY: "someone/fork" },
    { CLONE_CONFIRMATION: "" },
    { SANITY_SOURCE_READ_TOKEN: "" },
    { SANITY_STAGING_WRITE_TOKEN: "" },
    { GITHUB_ACTIONS: "false" },
    { GITHUB_RUN_ATTEMPT: "2" },
  ])
    assert.throws(() => authorizeRun({ ...env, ...change }));
});
test("rechazo de contexto no prepara ni importa ni crea directorio", async () =>
  isolated(async (temporary, env) => {
    const calls = [];
    await assert.rejects(
      initializeGithubRun(
        { ...env, CLONE_CONFIRMATION: "not-authorized" },
        { invoke: async () => calls.push("unexpected"), log: () => {} },
      ),
    );
    assert.deepEqual(calls, []);
    await assert.rejects(access(runDirectory(temporary)));
  }));
test("dos fases en el mismo directorio, misma huella/export, sin reexportación ni metadatos en logs", async () =>
  isolated(async (temporary, env) => {
    const logs = [],
      calls = [];
    await initializeGithubRun(env, {
      invoke: invocation(logs, calls),
      log: (x) => logs.push(x),
    });
    assert.deepEqual(
      calls.map((x) => x[0]),
      ["prepare", "import"],
    );
    assert.equal(calls[0][2], calls[1][2]);
    assert.ok(
      logs.every(
        (x) =>
          !x.includes(digest) &&
          !x.includes(privateMarker) &&
          !x.includes(temporary) &&
          !x.includes("synthetic-read-token"),
      ),
    );
    await assert.rejects(access(runDirectory(temporary)));
  }));
test("preparación fallida no importa y elimina temporales sin imprimir el error privado", async () =>
  isolated(async (temporary, env) => {
    const logs = [],
      calls = [];
    await assert.rejects(
      initializeGithubRun(env, {
        invoke: invocation(logs, calls, { prepareFails: true }),
        log: (x) => logs.push(x),
      }),
      (error) =>
        !error.message.includes(privateMarker) &&
        error.message.includes("herramientas"),
    );
    assert.deepEqual(
      calls.map((x) => x[0]),
      ["prepare"],
    );
    await assert.rejects(access(runDirectory(temporary)));
  }));
test("fallo de importación no se reintenta ni deja export/plan en el runner", async () =>
  isolated(async (temporary, env) => {
    const logs = [],
      calls = [];
    await assert.rejects(
      initializeGithubRun(env, {
        invoke: invocation(logs, calls, { importFails: true }),
        log: (x) => logs.push(x),
      }),
      (error) => !error.message.includes(privateMarker),
    );
    assert.equal(calls.length, 2);
    assert.equal(logs.length, 3);
    await assert.rejects(access(runDirectory(temporary)));
  }));
test("plan ilegible/inválido bloquea importación sin mostrar contenido privado", async () =>
  isolated(async (temporary, env) => {
    const logs = [],
      calls = [];
    await assert.rejects(
      initializeGithubRun(env, {
        invoke: invocation(logs, calls, { invalidDigest: true }),
        log: (x) => logs.push(x),
      }),
      (error) => !error.message.includes("invalid-private-value"),
    );
    assert.equal(calls.length, 1);
    assert.equal(logs.length, 2);
  }));
test("exit cero del hijo no acredita éxito si el recibo no está verificado o usa otra huella", async () =>
  isolated(async (temporary, env) => {
    for (const behavior of [{ badReceipt: true }, { badDigest: true }]) {
      const logs = [],
        calls = [];
      await assert.rejects(
        initializeGithubRun(env, {
          invoke: invocation(logs, calls, behavior),
          log: (x) => logs.push(x),
        }),
      );
      assert.equal(logs.length, 3);
      await assert.rejects(access(runDirectory(temporary)));
    }
  }));
test("cleanup siempre es local, idempotente y limitado al marcador de esta ejecución", async () =>
  isolated(async (temporary, env) => {
    const dir = runDirectory(temporary);
    await mkdir(dir, { mode: 0o700 });
    await writeFile(join(dir, ".workflow-owner"), "another-run");
    await writeFile(join(dir, "keep"), "synthetic");
    await assert.rejects(cleanupRun(env));
    assert.equal(await readFile(join(dir, "keep"), "utf8"), "synthetic");
    await writeFile(join(dir, ".workflow-owner"), "12345:1");
    await cleanupRun(env);
    await cleanupRun(env);
    await assert.rejects(access(dir));
  }));
test("no sobreescribe un directorio de ejecución preexistente", async () =>
  isolated(async (temporary, env) => {
    const dir = runDirectory(temporary);
    await mkdir(dir, { mode: 0o700 });
    await writeFile(join(dir, "keep"), "synthetic");
    await assert.rejects(
      initializeGithubRun(env, {
        invoke: async () => assert.fail("No debe invocar CLI"),
      }),
    );
    assert.equal(await readFile(join(dir, "keep"), "utf8"), "synthetic");
  }));
test("identificadores de ejecución no admiten rutas manipuladas", async () =>
  isolated(async (_temporary, env) => {
    await assert.rejects(
      initializeGithubRun(
        { ...env, GITHUB_RUN_ID: "../../outside" },
        {
          invoke: async () => assert.fail("No debe invocar CLI"),
          log: () => {},
        },
      ),
    );
  }));
test("entrada ejecutable rechaza fuera de Actions sin SDK/CLI de Sanity ni salida sensible", (t) => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL("./github-run.mjs", import.meta.url))],
    { encoding: "utf8", env: { ...process.env, GITHUB_ACTIONS: "false" } },
  );
  if (result.error?.code === "EPERM" && !process.env.CI) {
    t.skip(
      "El sandbox local no permite crear un subproceso Node; CI lo comprueba sin esa restricción",
    );
    return;
  }
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Variables \(solo presencia\):/);
  assert.doesNotMatch(
    result.stdout,
    /synthetic-read-token|synthetic-staging-token/,
  );
  assert.ok(result.stderr.includes("No se muestran datos ni errores privados"));
});
test("workflow solo manual, main, sin artefactos/caché/outputs y con secretos solo en el paso operativo", async () => {
  const workflow = await readFile(
    new URL(
      "../../.github/workflows/initialize-sanity-staging.yml",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(workflow, /on:\s*\n\s*workflow_dispatch:/);
  assert.doesNotMatch(
    workflow,
    /\b(push|pull_request|workflow_call|repository_dispatch|schedule):/,
  );
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /github\.run_attempt == 1/);
  assert.ok(workflow.includes(CONFIRMATION));
  assert.match(workflow, /permissions:\s*\n\s*contents: read/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.doesNotMatch(
    workflow,
    /upload-artifact|actions\/cache|cache:|GITHUB_OUTPUT|GITHUB_STEP_SUMMARY|contents: write/,
  );
  assert.equal(
    (workflow.match(/secrets\.SANITY_SOURCE_READ_TOKEN/g) || []).length,
    1,
  );
  assert.equal(
    (workflow.match(/secrets\.SANITY_STAGING_WRITE_TOKEN/g) || []).length,
    1,
  );
  assert.ok(
    workflow.indexOf("secrets.SANITY_SOURCE_READ_TOKEN") >
      workflow.indexOf("name: Prepare, import the same export"),
  );
  assert.match(workflow, /if: always\(\)/);
});
