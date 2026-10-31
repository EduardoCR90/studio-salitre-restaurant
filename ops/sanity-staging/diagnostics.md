# Diagnóstico seguro de la inicialización

## Qué sabemos del fallo anterior

El mensaje genérico anterior no demuestra que fallara la autenticación ni que no empezara la importación. `github-run.mjs` ocultaba los errores de autorización/temporales y descartaba stdout/stderr del proceso hijo; su catch final ocultaba incluso la fase. Que ambos Repository secrets existan solo confirma su registro en GitHub, no su entrega al paso, validez o permisos en Sanity.

No se han consultado datasets ni repetido ejecuciones para desarrollar estos cambios. La causa concreta de aquella ejecución sigue sin confirmar y estos cambios no reconstruyen retroactivamente su diagnóstico.

## Fallos posibles durante los primeros segundos, en orden

1. Autorización: evento distinto de workflow_dispatch, rama/repositorio incorrectos, intento repetido o frase de confirmación distinta.
2. Credenciales: variable vacía, ausente o solo espacios. Solo se informa `presente`/`ausente`, nunca valor ni longitud. La comprobación incluye las variables de contexto, confirmación y temporales.
3. Entorno y disco: RUNNER_TEMP inválido/inexistente, identificadores inválidos, falta de permisos, directorio previo, error al crear el marcador/temporales privados.
4. Herramientas: carga del SDK/CLI, paquetes ausentes, lock/versiones incompatibles. Un fallo antes de cargar el módulo CLI no puede escribir el diagnóstico y se identifica como carga/versiones de herramientas.
5. Primera lectura de staging: token inválido, permisos insuficientes, proyecto/dataset no accesible, DNS/TLS/conexión, límites o disponibilidad de la API.
6. Comprobación de staging vacío: cualquier documento, borrador o asset bloquea el procedimiento. Se mantienen las exclusiones de metadatos internos del procedimiento original. No se publica ningún recuento ni identificador.
7. Lectura y validación de production: acceso, conexión, referencias incompatibles, Releases no soportadas o datos inválidos. Después pueden fallar la exportación oficial, recursos multimedia o comprobaciones de integridad/concurrencia.

La duración por sí sola no permite determinar el punto alcanzado. Un dataset pequeño puede superar varias de estas fases rápidamente.

## Qué muestra el nuevo diagnóstico

Ejemplos de mensajes estáticos, sin información del contenido:

```text
Fase: lectura de staging; categoría: permisos. Operación detenida.
Fase: comprobación de staging vacío; categoría: dataset. Operación detenida.
Fase: importación en staging con CLI oficial; categoría: importación. Operación detenida.
```

El hijo escribe únicamente versión, fase y categoría de un vocabulario cerrado en un archivo 0600 dentro del directorio privado del job. El coordinador descarta registros inválidos/campos adicionales, borra el diagnóstico de la fase anterior antes de cada subproceso y transmite solo esos valores permitidos. El archivo se elimina con los temporales; no se publica como artefacto. Se conserva la salida stdout/stderr original de la CLI **descartada**.

Para errores estructurados del SDK: HTTP 401 se clasifica como credenciales, 403 como permisos, 404 como dataset/proyecto no accesible, y errores de red conocidos o 408/429/5xx seleccionados como conexión/disponibilidad. La categoría es orientativa: por ejemplo, un 404 también puede ocultar falta de acceso. Nunca se analizan mensajes de error, cuerpos HTTP, cabeceras, URLs o stacks para decidir el texto publicado.

La CLI oficial opaca puede devolver solo un exit distinto de cero. En ese caso se publica la fase y su categoría exportación/importación/verificación; **no se afirma que sea un problema de token, permisos o red**. Un cierre forzado puede dejar únicamente la última fase registrada. No habilites debug, `set -x` ni la impresión de stderr para obtener más detalle.

Todas las validaciones, consultas, destinos fijos, huellas, bloqueo de sobrescrituras y ausencia de reintentos permanecen. Los callbacks de fase solo añaden observabilidad; no introducen consultas nuevas. Los errores de limpieza local se informan sin ocultar el diagnóstico operativo original.

## Antes de otra importación

**No uses Run workflow ni Re-run jobs para diagnosticar la ejecución anterior.** El workflow sigue siendo una operación de escritura condicional, no una herramienta de inspección.

1. Autoriza y realiza por separado una inspección exclusivamente de lectura de `hfa8zkyw/staging`, con perspectiva `raw`, incluyendo borradores y assets. Usa una herramienta autorizada que pueda ver todo el dataset; una carta vacía en el dashboard o la vista de publicados no acredita que esté vacío. No compartas documentos, tokens o respuestas completas en logs/chat.
2. Si hay documentos, detente. Puede haber una importación parcial o completa. No borres, sustituyas ni vuelvas a importar; revisa el resultado y acuerda cualquier siguiente operación por separado. Los diagnósticos de esta PR no prueban el estado actual del dataset.
3. Solo después de confirmar mediante lectura que no contiene documentos y revisar la causa, considera una nueva autorización manual. Se conservan además las comprobaciones de vacío del procedimiento inmediatamente antes de escribir; la inspección previa no las sustituye.

`prepare` exporta production y `verify` requiere un plan previo; ninguno sustituye la inspección mínima independiente de staging. Esta PR no ejecuta esa inspección ni añade automatismos para hacerla o reintentar la copia.
