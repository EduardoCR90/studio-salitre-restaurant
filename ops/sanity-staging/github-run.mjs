import assert from "node:assert/strict";
import { mkdir, writeFile, readFile, rm, realpath } from "node:fs/promises";
import { join, resolve, isAbsolute } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { CONFIRMATION } from "./core.mjs";
import {
  diagnostic,
  DiagnosticError,
  readDiagnostic,
  safeMessage,
} from "./diagnostics.mjs";

const REPOSITORY = "eduardocr90/studio-salitre-restaurant";
const OWNER_FILE = ".workflow-owner";

export function authorizeRun(env) {
  assert.equal(env.GITHUB_ACTIONS, "true", "Solo se admite GitHub Actions");
  assert.equal(
    env.GITHUB_EVENT_NAME,
    "workflow_dispatch",
    "Solo ejecución manual",
  );
  assert.equal(env.GITHUB_REF, "refs/heads/main", "Solo se admite main");
  assert.equal(
    env.GITHUB_REPOSITORY?.toLowerCase(),
    REPOSITORY,
    "Repositorio incorrecto",
  );
  assert.equal(
    env.GITHUB_RUN_ATTEMPT,
    "1",
    "Se requiere una nueva ejecución manual; no un re-run",
  );
  assert.equal(
    env.CLONE_CONFIRMATION,
    CONFIRMATION,
    "Falta confirmación exacta previa",
  );
  for (const name of ["SANITY_SOURCE_READ_TOKEN", "SANITY_STAGING_WRITE_TOKEN"])
    if (!(typeof env[name] === "string" && env[name].trim()))
      throw new DiagnosticError(diagnostic("credentials"));
}

async function runLocation(env) {
  assert.ok(
    isAbsolute(env.RUNNER_TEMP || ""),
    "Falta el directorio temporal del runner",
  );
  assert.match(env.GITHUB_RUN_ID || "", /^\d+$/);
  assert.match(env.GITHUB_RUN_ATTEMPT || "", /^\d+$/);
  const temporary = await realpath(env.RUNNER_TEMP);
  return {
    directory: join(
      temporary,
      `sanity-staging-${env.GITHUB_RUN_ID}-${env.GITHUB_RUN_ATTEMPT}`,
    ),
    owner: `${env.GITHUB_RUN_ID}:${env.GITHUB_RUN_ATTEMPT}`,
  };
}

// Limpieza local idempotente: jamás elimina un directorio ajeno sin nuestro marcador.
export async function cleanupRun(env) {
  const location = await runLocation(env);
  let owner;
  try {
    owner = await readFile(join(location.directory, OWNER_FILE), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  assert.equal(owner, location.owner, "Directorio temporal no identificado");
  await rm(location.directory, { recursive: true, force: true });
}

function invokeCli(args, env) {
  const cli = resolve(import.meta.dirname, "cli.mjs");
  return new Promise((accept, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      env,
      // prepare imprime resumen/huella: ambos se mantienen privados, incluso al fallar.
      stdio: "ignore",
    });
    child.once("error", () =>
      reject(new Error("No se pudo iniciar la herramienta")),
    );
    child.once("close", (code) => {
      if (code === 0) accept();
      else reject(new Error("La herramienta detuvo la operación"));
    });
  });
}

export async function initializeGithubRun(
  env,
  { invoke = invokeCli, log = console.log } = {},
) {
  // Antes de crear archivos, leer secretos en hijos o contactar Sanity.
  let location;
  let created = false;
  let phase = "authorization";
  let failed = false;
  try {
    // Se informa solo presencia/ausencia, nunca valores ni longitudes.
    const names = [
      "SANITY_SOURCE_READ_TOKEN",
      "SANITY_STAGING_WRITE_TOKEN",
      "CLONE_CONFIRMATION",
      "RUNNER_TEMP",
      "GITHUB_ACTIONS",
      "GITHUB_EVENT_NAME",
      "GITHUB_REF",
      "GITHUB_REPOSITORY",
      "GITHUB_RUN_ID",
      "GITHUB_RUN_ATTEMPT",
    ];
    log(
      "Variables (solo presencia): " +
        names
          .map(
            (name) =>
              `${name}=${typeof env[name] === "string" && env[name].trim() ? "presente" : "ausente"}`,
          )
          .join("; "),
    );
    authorizeRun(env);
    phase = "environment";
    location = await runLocation(env);
    phase = "temporary";
    await mkdir(location.directory, { mode: 0o700 });
    created = true;
    await writeFile(join(location.directory, OWNER_FILE), location.owner, {
      mode: 0o600,
      flag: "wx",
    });
    // Incluye también las carpetas de extracción/descarga temporales de la CLI oficial.
    const cliTemporary = join(location.directory, "cli-tmp");
    await mkdir(cliTemporary, { mode: 0o700 });
    const diagnosticFile = join(location.directory, "diagnostic.json");
    const executionEnvironment = {
      ...env,
      TMPDIR: cliTemporary,
      SANITY_CLONE_DIAGNOSTIC_FILE: diagnosticFile,
    };
    const invokeDiagnosed = async (args) => {
      // No reutiliza un diagnóstico de la fase previa.
      await rm(diagnosticFile, { force: true });
      try {
        await invoke(args, executionEnvironment);
      } catch (error) {
        throw new DiagnosticError(
          (await readDiagnostic(diagnosticFile)) || diagnostic("tools", error),
        );
      }
    };
    const data = join(location.directory, "data"); // prepare exige que aún no exista.
    phase = "prepare";
    log("Inicio de preparación; no se ha invocado la importación.");
    await invokeDiagnosed(["prepare", "--directory", data]);
    phase = "plan";
    // La huella se lee del plan privado. No pasa por logs, outputs, resúmenes o artefactos.
    const plan = JSON.parse(await readFile(join(data, "plan.json"), "utf8"));
    assert.match(plan.digest || "", /^[a-f0-9]{64}$/);
    const digest = plan.digest;
    log(
      "Preparación validada. Se aplica la autorización explícita previa para importar.",
    );
    phase = "import-validation";
    await invokeDiagnosed([
      "import",
      "--directory",
      data,
      "--digest",
      digest,
      "--confirm",
      env.CLONE_CONFIRMATION,
    ]);
    // importInitial ya comprueba hashes, vacío, versiones, cambios de origen e igualdad final.
    phase = "receipt";
    const receipt = JSON.parse(
      await readFile(join(data, "import-result.json"), "utf8"),
    );
    assert.equal(receipt.status, "verified");
    assert.equal(receipt.digest, digest);
    log("Inicialización de staging y comparación completadas correctamente.");
  } catch (error) {
    failed = true;
    throw new DiagnosticError(
      error instanceof DiagnosticError
        ? error.diagnostic
        : diagnostic(phase, error),
    );
  } finally {
    if (created) {
      try {
        await rm(location.directory, { recursive: true, force: true });
      } catch (error) {
        // No oculta el fallo operativo anterior si también falla la limpieza.
        log(safeMessage(error, "cleanup"));
        if (!failed) throw new DiagnosticError(diagnostic("cleanup", error));
      }
    }
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  process.umask(0o077);
  try {
    if (process.argv[2] === "cleanup") await cleanupRun(process.env);
    else {
      assert.equal(process.argv.length, 2);
      await initializeGithubRun(process.env);
    }
  } catch (error) {
    console.error(
      safeMessage(
        error,
        process.argv[2] === "cleanup" ? "cleanup" : "authorization",
      ),
    );
    process.exitCode = 1;
  }
}
