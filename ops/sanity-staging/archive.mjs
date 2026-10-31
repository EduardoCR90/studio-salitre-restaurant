import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { execFileSync, spawn } from "node:child_process";
export async function fileHash(path) {
  const h = createHash("sha256");
  for await (const chunk of createReadStream(path)) h.update(chunk);
  return h.digest("hex");
}
function tar(args) {
  return execFileSync("tar", args, {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
    stdio: ["ignore", "pipe", "pipe"],
  });
}
export async function inspectArchive(path) {
  const names = tar(["-tzf", path]).split("\n").filter(Boolean);
  assert.equal(
    new Set(names).size,
    names.length,
    "Entradas duplicadas en el tar",
  );
  assert.ok(
    names.every((n) =>
      /^(data\.ndjson|assets\.json|images\/?|files\/?|(?:images|files)\/[a-f0-9]{40}(?:-[a-z0-9]+)*\.[a-z0-9]+)$/.test(
        n,
      ),
    ),
    "Entrada de archivo no soportada",
  );
  assert.ok(
    tar(["-tvzf", path])
      .split("\n")
      .filter(Boolean)
      .every((line) => line.startsWith("-") || line.startsWith("d")),
    "Enlaces/dispositivos en el archivo no permitidos",
  );
  assert.ok(
    names.includes("data.ndjson") && names.includes("assets.json"),
    "Export incompleto",
  );
  const documents = tar(["-xOf", path, "--", "data.ndjson"])
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  JSON.parse(tar(["-xOf", path, "--", "assets.json"]));
  const media = new Map();
  for (const name of names.filter((n) => /^(images|files)\/.+\./.test(n))) {
    const child = spawn("tar", ["-xOf", path, "--", name], {
      stdio: ["ignore", "pipe", "ignore"],
    });
    const completion = new Promise((accept, reject) => {
      child.once("error", reject);
      child.once("close", (code) =>
        code === 0
          ? accept()
          : reject(new Error("No se pudo leer el asset del tar")),
      );
    });
    const sha1 = createHash("sha1"),
      sha256 = createHash("sha256");
    let size = 0;
    for await (const chunk of child.stdout) {
      sha1.update(chunk);
      sha256.update(chunk);
      size += chunk.length;
    }
    await completion;
    media.set(name, {
      sha1: sha1.digest("hex"),
      sha256: sha256.digest("hex"),
      size,
    });
  }
  return { documents, media };
}
