import { readFile, writeFile } from "node:fs/promises";

// Solo vocabulario cerrado: nunca mensajes, URLs, cuerpos HTTP ni metadatos del dataset.
const phases = {
  authorization: ["autorización", "contexto"],
  credentials: ["variables de credenciales", "credenciales"],
  environment: ["entorno del runner", "entorno"],
  temporary: ["temporales privados", "almacenamiento local"],
  tools: ["carga/versiones de herramientas", "herramientas"],
  prepare: ["preparación", "validación"],
  "target-read": ["lectura de staging", "dataset"],
  "target-empty": ["comprobación de staging vacío", "dataset"],
  "source-read": ["lectura de production", "dataset"],
  "source-validation": ["validación de documentos origen", "validación"],
  "source-unchanged": ["comprobación de origen sin cambios", "verificación"],
  "export-source": ["exportación de production con CLI oficial", "exportación"],
  "export-validation": ["validación del export y recursos", "exportación"],
  plan: ["validación del plan privado", "validación"],
  "import-validation": ["validación previa a importar", "validación"],
  "import-target": ["importación en staging con CLI oficial", "importación"],
  verification: [
    "comparación posterior de documentos y recursos",
    "verificación",
  ],
  "export-target": ["exportación de staging para verificar", "verificación"],
  receipt: ["validación del recibo", "verificación"],
  cleanup: ["limpieza local", "almacenamiento local"],
};
const categories = new Set([
  ...Object.values(phases).map(([, category]) => category),
  "permisos",
  "conexión",
]);
export function diagnostic(phase, error) {
  if (!Object.hasOwn(phases, phase)) phase = "prepare";
  let category = phases[phase][1];
  // Solo campos estructurados conocidos. No se inspeccionan mensajes/respuestas de texto.
  const status = error?.statusCode ?? error?.response?.statusCode;
  if (status === 401) category = "credenciales";
  else if (status === 403) category = "permisos";
  else if (status === 404) category = "dataset";
  else if ([408, 429, 500, 502, 503, 504].includes(status))
    category = "conexión";
  else if (
    [
      "ENOTFOUND",
      "EAI_AGAIN",
      "ECONNRESET",
      "ECONNREFUSED",
      "ETIMEDOUT",
      "UND_ERR_CONNECT_TIMEOUT",
      "CERT_HAS_EXPIRED",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
    ].includes(error?.code ?? error?.cause?.code)
  )
    category = "conexión";
  return { version: 1, phase, category };
}
export function validDiagnostic(value) {
  return (
    value &&
    Object.keys(value).sort().join(",") === "category,phase,version" &&
    value.version === 1 &&
    Object.hasOwn(phases, value.phase) &&
    categories.has(value.category)
  );
}
export class DiagnosticError extends Error {
  constructor(value) {
    const safe = validDiagnostic(value) ? value : diagnostic("prepare");
    super(
      `Fase: ${phases[safe.phase][0]}; categoría: ${safe.category}. Operación detenida. Antes de otra importación, revisar staging mediante solo lectura. No se muestran datos ni errores privados.`,
    );
    this.diagnostic = safe;
  }
}
export function safeMessage(error, phase) {
  return new DiagnosticError(
    error instanceof DiagnosticError
      ? error.diagnostic
      : diagnostic(phase, error),
  ).message;
}
export async function writeDiagnostic(path, value) {
  if (path && validDiagnostic(value))
    await writeFile(path, JSON.stringify(value), { mode: 0o600 });
}
export async function readDiagnostic(path) {
  try {
    const value = JSON.parse(await readFile(path, "utf8"));
    return validDiagnostic(value) ? value : null;
  } catch {
    return null;
  }
}
