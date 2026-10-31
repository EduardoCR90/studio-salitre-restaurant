import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { resolve, join } from "node:path";
import { spawn } from "node:child_process";
import { createClient } from "@sanity/client";
import { cliSpec, PROJECT, SOURCE, TARGET } from "./core.mjs";
import { prepare, importInitial, verify } from "./procedure.mjs";
import { diagnostic, writeDiagnostic, safeMessage } from "./diagnostics.mjs";

let phase = "tools";
const diagnosticFile = process.env.SANITY_CLONE_DIAGNOSTIC_FILE;
async function stage(next) {
  phase = next;
  await writeDiagnostic(diagnosticFile, diagnostic(phase));
}

process.umask(0o077);
const root = resolve(import.meta.dirname, "../..");
const [operation, ...args] = process.argv.slice(2);
if (!operation || operation === "--help") {
  console.log(
    'node ops/sanity-staging/cli.mjs prepare|import|verify --directory /ruta/privada/fuera-de-Git [--confirm "CLONAR production -> staging" --digest SHA256]',
  );
  process.exit(0);
}
try {
  await stage("tools");
  assert.ok(
    ["prepare", "import", "verify"].includes(operation),
    "Operación inválida",
  );
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    assert.ok(
      ["--directory", "--confirm", "--digest"].includes(args[i]) && args[i + 1],
      "Argumentos inválidos",
    );
    assert.ok(!(args[i] in options), "Argumento duplicado");
    options[args[i]] = args[i + 1];
  }
  assert.ok(options["--directory"], "Falta --directory");
  assert.ok(
    process.env.SANITY_SOURCE_READ_TOKEN,
    "Configura SANITY_SOURCE_READ_TOKEN de forma segura",
  );
  assert.ok(
    process.env.SANITY_STAGING_WRITE_TOKEN,
    "Configura SANITY_STAGING_WRITE_TOKEN de forma segura (prepare/verify solo lo usan para leer)",
  );
  const clients = new Map(
    [SOURCE, TARGET].map((dataset) => [
      dataset,
      createClient({
        projectId: PROJECT,
        dataset,
        apiVersion: "2025-02-19",
        perspective: "raw",
        useCdn: false,
        maxRetries: 0,
        timeout: 30000,
        token:
          dataset === SOURCE
            ? process.env.SANITY_SOURCE_READ_TOKEN
            : process.env.SANITY_STAGING_WRITE_TOKEN,
      }),
    ]),
  );
  const deps = {
    stage,
    async tools() {
      const lock = JSON.parse(
        await readFile(join(root, "package-lock.json"), "utf8"),
      );
      const cli = JSON.parse(
        await readFile(
          join(root, "node_modules/@sanity/cli/package.json"),
          "utf8",
        ),
      );
      assert.equal(
        cli.version,
        lock.packages["node_modules/@sanity/cli"].version,
        "Ejecuta npm ci: la CLI no coincide con el lock",
      );
      const sdk = JSON.parse(
        await readFile(
          join(root, "node_modules/@sanity/client/package.json"),
          "utf8",
        ),
      );
      assert.equal(
        sdk.version,
        lock.packages["node_modules/@sanity/client"].version,
        "Ejecuta npm ci: el SDK no coincide con el lock",
      );
      return { cli: cli.version, client: sdk.version };
    },
    async read(dataset) {
      assert.ok(clients.has(dataset));
      const docs = [];
      let after = "";
      while (true) {
        const page = await clients
          .get(dataset)
          .fetch("*[_id > $after] | order(_id asc)[0...1000]", { after });
        assert.ok(Array.isArray(page), "Respuesta de consulta inválida");
        docs.push(...page);
        assert.ok(
          docs.length <= 100000,
          "Dataset demasiado grande para este procedimiento; requiere revisión",
        );
        if (page.length < 1000) return docs;
        after = page.at(-1)._id;
      }
    },
    async cli(action, archive) {
      const spec = cliSpec(action, archive);
      await deps.tools();
      try {
        await access(archive);
        assert.equal(spec.write, true, "El archivo de salida ya existe");
      } catch (error) {
        if (error.code !== "ENOENT") throw error;
        assert.equal(spec.write, false, "Falta el archivo de importación");
      }
      const token =
        spec.dataset === SOURCE
          ? process.env.SANITY_SOURCE_READ_TOKEN
          : process.env.SANITY_STAGING_WRITE_TOKEN;
      const childEnvironment = { ...process.env };
      delete childEnvironment.SANITY_SOURCE_READ_TOKEN;
      delete childEnvironment.SANITY_STAGING_WRITE_TOKEN;
      await new Promise((accept, reject) => {
        const child = spawn(
          process.execPath,
          [join(root, "node_modules/@sanity/cli/bin/run.js"), ...spec.args],
          {
            cwd: root,
            env: {
              ...childEnvironment,
              CI: "true",
              SANITY_AUTH_TOKEN: token,
              SANITY_IMPORT_TOKEN: token,
              SANITY_STUDIO_PROJECT_ID: PROJECT,
              SANITY_STUDIO_DATASET: spec.dataset,
              DO_NOT_TRACK: "1",
              SANITY_CLI_TELEMETRY_ENABLED: "false",
            },
            stdio: "ignore",
          },
        );
        child.once("error", () =>
          reject(new Error("No se pudo iniciar la CLI oficial")),
        );
        child.once("close", (code) =>
          code === 0
            ? accept()
            : reject(
                new Error(
                  "La CLI oficial falló; revisar estado privado antes de continuar, sin reintentar ni sobrescribir",
                ),
              ),
        );
      });
    },
  };
  await deps.tools();
  const result =
    operation === "prepare"
      ? await prepare(options["--directory"], deps)
      : operation === "import"
        ? await importInitial(
            options["--directory"],
            options["--confirm"],
            options["--digest"],
            deps,
          )
        : await verify(options["--directory"], deps);
  // No imprimir contenido, IDs, URLs de assets, tokens ni errores del SDK/CLI.
  if (operation === "prepare") console.log(JSON.stringify(result, null, 2));
  else
    console.log(
      JSON.stringify({
        status: result.status,
        sourceCount: result.sourceCount,
        targetCount: result.targetCount,
        differences: result.differences.length,
        mediaMatch: result.mediaMatch,
        sourceMatchesApprovedSnapshot: result.sourceMatchesApprovedSnapshot,
      }),
    );
  if (result.status === "different") process.exitCode = 1;
} catch (error) {
  // Solo códigos permitidos; nunca se vuelca el error original en el canal privado.
  try {
    await writeDiagnostic(diagnosticFile, diagnostic(phase, error));
  } catch {}
  console.error(safeMessage(error, phase));
  process.exitCode = 1;
}
