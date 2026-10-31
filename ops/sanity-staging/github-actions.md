# Inicializar staging desde GitHub Actions, sin publicar exports

## Decisión: una ejecución con autorización previa

En runners **alojados por GitHub**, cada job dispone de su propio entorno efímero. No se puede asumir que otro job/ejecución reciba el mismo disco. Las aprobaciones nativas de environments se aplican antes de empezar un job, no como una pausa entre pasos que conserve sus archivos.

Separar preparación e importación en jobs/ejecuciones y mantener el mismo export requeriría almacenamiento privado adicional o una infraestructura controlada. No usamos artefactos descargables, cachés, adjuntos de issues, Git, outputs o resúmenes para trasladar los datos. Tampoco simulamos persistencia con un runner compartido sin garantías de aislamiento.

Referencias: [runners alojados](https://docs.github.com/en/actions/using-github-hosted-runners/about-github-hosted-runners) y [entornos/aprobaciones de despliegue](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment).

Por tanto se implementa la alternativa prevista: **un único job iniciado manualmente, con confirmación explícita antes de cualquier consulta/exportación**, que prepara, importa y verifica dentro del mismo runner. Hay dos fases técnicas; **no hay una aprobación humana nueva después de preparar ni revisión interactiva de la huella generada**. La confirmación autoriza de antemano la importación solo si todas las validaciones del procedimiento pasan. Si necesitas revisar y aprobar cada documento/export antes de importar, no uses este workflow: requiere un procedimiento con almacenamiento privado externo y control de acceso aprobado aparte.

Esta PR prepara el workflow. No lo ejecuta, no consulta datasets, no crea contenido ni cambia aplicaciones/esquemas.

## Alcance fijo y autorización

Archivo: `.github/workflows/initialize-sanity-staging.yml`.

- Solo `workflow_dispatch`, en main y en EduardoCR90/studio-salitre-restaurant. No se ejecuta por push, PR o merge.
- Input obligatorio `confirmation`, sin valor predeterminado. Frase exacta: **CLONAR production -> staging** (sin las comillas).
- Se rechazan re-runs (`GITHUB_RUN_ATTEMPT` distinto de 1). Una nueva autorización debe ser una nueva ejecución desde Run workflow, después de revisar cualquier fallo.
- Proyecto hfa8zkyw; origen production; destino staging. No hay inputs para cambiar esos valores, pasar comandos o archivos externos.
- Checkout del SHA del evento; npm 11.9.0 y npm ci instalan las herramientas oficiales fijadas en el lock. No se usan versiones latest.
- Permisos del workflow: únicamente contents:read. Checkout no persiste credenciales. No se usan APIs de aprobación, permisos de escritura de GitHub o claves adicionales.
- Concurrencia común `sanity-hfa8zkyw-staging-initialization` y cancel-in-progress:false. No hay dos jobs de esta inicialización activos a la vez; GitHub puede sustituir ejecuciones pendientes por otra posterior. No es una cola FIFO ni bloquea a editores externos de Sanity.

## Secretos existentes

Los siguientes secretos de repositorio deben existir y se entregan **solo al paso operativo**, después de instalar herramientas y ejecutar tests sintéticos:

| Secreto                    | Alcance                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SANITY_SOURCE_READ_TOKEN   | Lectura completa de production, borradores y assets, y metadatos/listado de datasets requeridos por la CLI. Sin escritura sobre production.                           |
| SANITY_STAGING_WRITE_TOKEN | Lectura de staging y creación/actualización de documentos/assets de staging para importar y reconstruir referencias; limitar al dataset cuando los roles lo permitan. |

No se usan tokens del navegador, del Studio compilado, del dashboard o de Supabase. No pegues secretos en inputs ni en el chat. Los nombres personalizados ya están disponibles según la configuración indicada; esta PR no los consulta ni modifica. Los scripts anteriores siguen separando los tokens por cliente/dataset y fijan los argumentos de la CLI.

## Mismo export, sin persistencia entre ejecuciones

`ops/sanity-staging/github-run.mjs` es solo un coordinador; reutiliza el CLI existente:

1. Valida evento, rama, repositorio, primera ejecución, confirmación exacta y presencia de los secretos.
2. Crea un directorio 0700 en RUNNER_TEMP, fuera de Git, exclusivo para run_id/run_attempt; los archivos sensibles usan umask 077/0600.
3. Invoca `cli.mjs prepare` con ese directorio. Staging debe estar vacío, incluidos documentos, borradores y assets (solo se excluye metadata interna reservada según el procedimiento original). Exporta y valida con las herramientas oficiales existentes.
4. Lee la huella de plan.json **en memoria**, sin imprimirla. Invoca `cli.mjs import` sobre el mismo directorio, la misma huella y la confirmación recibida del usuario. No vuelve a preparar ni exportar production entre fases.
5. `importInitial` comprueba de nuevo el hash del archivo original, el plan, la instantánea, las versiones, el origen sin cambios y staging vacío inmediatamente antes del único comando de escritura. Solo usa create, sin replace/missing. Production sigue siendo exclusivamente lectura/exportación.
6. La importación ya incluye la comparación documental y de binarios. El coordinador exige además un recibo verified con la misma huella antes de informar de éxito.

No se duplica la lógica de clonación ni se pasan por alto sus bloqueos para referencias, Releases, assets incompletos o conflictos. Consulta [el procedimiento y sus límites](README.md).

## Privacidad y limpieza

Export, instantánea, huella, planes, informes, recibos y marcador de importación permanecen en el directorio temporal privado del **mismo job**. El `TMPDIR` de la CLI también queda dentro de ese directorio privado, de modo que sus archivos de extracción y descarga se eliminan con el resto. No se imprimen recuentos, IDs, rutas privadas, URLs de assets, hashes, JSON ni errores originales. Los subprocesos de las herramientas tienen stdout/stderr descartados, también cuando fallan. El log indica presencia/ausencia de variables, estados genéricos, fase/categoría de diagnóstico permitidas y el resultado global; no se añaden job outputs ni step summaries con datos. Consulta [los diagnósticos seguros y sus límites](diagnostics.md).

No se suben artefactos ni se guardan cachés. Las otras validaciones del repositorio ocurren en sus propios jobs, sin acceso a este directorio. El coordinador elimina los archivos en finally tanto en éxito como en fallo, y un paso always repite una limpieza local idempotente limitada al marcador de esta ejecución. No existe ningún paso de limpieza que borre datos remotos.

Cancelación forzada, timeout o caída del runner pueden impedir los pasos de limpieza; por eso se usan runners alojados efímeros y no máquinas persistentes/compartidas. La eliminación local no es una promesa de borrado criptográfico del disco de GitHub. Si tu política exige almacenamiento cifrado bajo tu control, necesitas esa infraestructura externa antes de ejecutar la copia.

**Los informes privados no estarán disponibles para descargar después del job.** Esta diferencia respecto al uso manual de los scripts es deliberada. Tras un fallo, puede ser necesaria una inspección autorizada independiente de staging; no se publicará información privada para facilitar el diagnóstico.

## Cómo ejecutarlo cuando se autorice

1. Revisa e integra esta PR. La integración solo instala la definición; **no dispara la inicialización**.
2. Comprueba que ambos secretos mantienen los permisos indicados. Evita escrituras en staging desde el dashboard y otras herramientas durante la ventana de copia; no cambies la integración SaaS ni el dataset usado por Astro. Revisa filtros de webhooks si hay hooks compartidos: este workflow no los cambia.
3. En Actions abre **Initialize Sanity staging (manual)** → **Run workflow**, elige **main** e introduce exactamente:

   ```text
   CLONAR production -> staging
   ```

4. Run workflow autoriza preparación e importación condicionadas en esa única ejecución. Si la frase, rama, repositorio o intento no son válidos, el job se omite; skipped **no significa que se haya clonado**.
5. Verifica que validación sintética, paso operativo y limpieza terminan correctamente. El mensaje **Inicialización de staging y comparación completadas correctamente** solo aparece después del recibo verificado. No acredita una revisión visual del dashboard.
6. Desde el dashboard autorizado, comprueba páginas, carta e imágenes de staging. Astro debe seguir leyendo production. Esta PR no realiza esa comprobación remota.

## Fallos y límites

Staging no vacío, cambios concurrentes de origen/destino, corrupción de export, versiones distintas, errores de API o desigualdad final detienen el proceso sin sobrescribir. No hay una transacción global ni bloqueo de otros clientes entre consulta e importación: detener los escritores de staging sigue siendo necesario. Puede quedar una importación parcial si se cancela o falla; no se borra ni reintenta automáticamente.

No pulses Re-run jobs ni crees otra ejecución para “arreglar” un resultado parcial. Los re-runs se rechazan; una nueva ejecución también se detendrá si staging contiene datos. Revisa primero el estado con una operación de lectura autorizada y solicita por separado cualquier limpieza/reinicio remoto. El workflow elimina sus recibos locales por privacidad y no puede recuperar el export de un runner anterior.

La CI solo prueba el coordinador con subprocesos de ensayo y datos sintéticos, más los tests ya existentes del procedimiento. No recibe secretos ni ejecuta prepare/import/verify contra Sanity.
