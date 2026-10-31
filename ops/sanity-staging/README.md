# Inicialización segura: production → staging

Herramientas de operación separadas del Studio. Para la alternativa de una ejecución manual en GitHub con confirmación previa, consulta [github-actions.md](github-actions.md). Proyecto fijo `hfa8zkyw`; origen fijo `production`; único destino de importación `staging`. No se cambian Astro, el dashboard SaaS, esquemas, configuración, componentes o despliegue del Studio. Esta PR **no consulta ni modifica los datasets**: solo incorpora scripts, pruebas aisladas y esta guía.

## Alcance y garantías

- CLI oficial de Sanity (`datasets export` y `datasets import`) y SDK oficial `@sanity/client`. Usa las versiones fijadas en package-lock.json, sin `npx latest`: CLI 8.23.0 y cliente 8.11.0 en este lock. La herramienta comprueba las versiones instaladas antes de operar.
- Copia todos los documentos de contenido, incluidos borradores, y todos los assets de imagen/archivo exportados, incluso los no referenciados. Se conservan los IDs existentes y las referencias locales. Es una restauración entre datasets, no un seed que genere IDs nuevos.
- `production` solo tiene operaciones de lectura y exportación. Usa un token exclusivamente de lectura para este origen. No se ejecutan mutaciones, reemplazos, borrados, creación de datasets ni cambios de permisos/visibilidad.
- `staging` se comprueba con consulta autenticada en perspectiva raw, incluyendo borradores, versiones y assets. Si hay **cualquier documento de contenido o asset**, se detiene antes de importar. Solo se excluyen metadatos internos reservados `_.…` administrados por Sanity; los documentos de Releases no se ignoran y bloquean la operación.
- Importación en modo oficial predeterminado **create**. No usa `--replace`, `--missing`, `--replace-assets`, filtros de tipos, `--no-assets`, `--no-drafts`, `--raw` ni opciones que toleren pérdida de assets. Una colisión de ID falla en lugar de sustituir o saltar documentos.
- Los dos datasets deben existir. No hay un comando para crearlos. El proyecto/datasets no se aceptan desde argumentos/env; los flags explícitos prevalecen sobre la configuración del Studio.

## Requisitos y permisos

Node 22.22+ (Node 22 LTS recomendado), npm 11.9.0 y `tar` en Linux/macOS. Desde la raíz de este repositorio ejecuta `npm ci` para instalar las herramientas bloqueadas; no hace falta arrancar, compilar o desplegar Studio.

Configura **fuera del repositorio y del chat**, en los secretos del entorno seguro de ejecución:

| Variable                   | Permisos necesarios                                                                                                                                                                                                                                                                         |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SANITY_SOURCE_READ_TOKEN   | Lectura completa de production, incluidos borradores/documentos raw y descarga de assets; lectura de metadatos/listado de datasets que utiliza la CLI. Sin escritura en production.                                                                                                         |
| SANITY_STAGING_WRITE_TOKEN | Lectura completa de staging para comprobar ausencia/verificar, creación de documentos y assets, y actualización de staging para restaurar referencias y metadatos de assets. La CLI también necesita leer metadatos/listado de datasets. Limitar a staging cuando el plan/roles lo permita. |

No necesitas permisos para borrar/crear datasets ni escribir en production. No se usa como fallback el token global del Studio. Un rol Editor puede incluir más permisos de los estrictamente necesarios: usa un rol limitado por dataset si está disponible. Si solo puedes usar un token de proyecto para staging, estos scripts siguen fijando el destino, pero ese token usado fuera del procedimiento conserva sus permisos originales.

No pongas tokens en argumentos, variables SANITY_STUDIO_, archivos de Git, capturas o logs. Para automatización, inyecta las dos variables desde GitHub Actions Secrets en una ejecución manual futura y autorizada; no recuperes ni copies sus valores al chat o al repositorio. Desde Codex Cloud puedes preparar esa ejecución sin publicar los secretos. La validación offline no ejecuta operaciones remotas ni distribuye exports como artefactos de Actions. El [workflow manual opcional](github-actions.md) requiere confirmación previa explícita y mantiene todo el export en el mismo job efímero. La CI de estas herramientas solo trabaja con datos sintéticos sin credenciales.

## 1. Preparar e inspeccionar, cuando se autoricen las lecturas

Evita ediciones en ambos datasets durante la ventana de copia. En staging, cierra temporalmente el editor del dashboard y cualquier otro escritor. Las restricciones de staging del dashboard no se modifican. Si existen webhooks compartidos, revisa que filtren el dataset para que una importación en staging no dispare despliegues ajenos; estas herramientas no cambian ni desactivan webhooks.

Elige una ruta **nueva**, privada y fuera de todo repositorio Git. No reutilices la de una ejecución anterior:

```bash
node ops/sanity-staging/cli.mjs prepare \
  --directory /tmp/salitre-staging-inicial
```

El script crea el directorio con modo 0700 y archivos privados (0600/umask 077). No admite una ruta dentro de un repositorio, incluso usando symlinks. `.gitignore` añade una protección adicional para tarballs, pero no sustituye esa restricción.

`prepare`:

1. Comprueba staging vacío antes de exportar.
2. Lee una instantánea raw de production, valida IDs, claves de arrays y referencias.
3. Exporta production en modo stream consistente, con medios y verificación de assets predeterminada, a production.tar.gz.
4. Inspecciona el tar sin extraerlo en el repositorio. Comprueba que estén todos los IDs, referencias, campos y binarios esperados. Un asset que la CLI omita por 401/403/404 hace fallar la preparación.
5. Vuelve a leer production y staging. Si el origen cambió o el destino ya no está vacío, se detiene.
6. Escribe plan.json y source-snapshot.json. Muestra únicamente recuentos por tipo, referencias y una huella SHA-256; no muestra el contenido.

El directorio contiene **contenido real y posiblemente borradores privados**. No lo añadas a Git ni lo publiques como artefacto de un repositorio público. Guárdalo solo en almacenamiento privado con permisos adecuados y elimina la copia local cuando termine su período de conservación. No se elimina automáticamente: se conserva para auditoría/recuperación.

## 2. Revisar el plan e importar, únicamente tras autorización

Revisa los recuentos, los archivos privados y la huella. Confirma que se trata de una primera carga y que staging sigue sin actividad editorial. Usa la huella exacta emitida por prepare:

```bash
node ops/sanity-staging/cli.mjs import \
  --directory /tmp/salitre-staging-inicial \
  --digest HUELLA_SHA256_REVISADA \
  --confirm 'CLONAR production -> staging'
```

Antes del único comando de escritura se comprueban confirmación, destino/proyecto, versiones de herramientas, huellas del plan/archivo/instantánea, ausencia de cambios en production y ausencia de documentos en staging. Se vuelve a comprobar staging justo antes de invocar `datasets import … --dataset staging --project-id hfa8zkyw`.

El marcador exclusivo import-started.lock permanece para impedir repetir ciegamente la operación. La CLI oficial restaura documentos, sube los binarios a staging y reconstruye las referencias conservando IDs basados en los mismos bytes. Los IDs no se recalculan desde slugs ni se sustituyen con UUIDs nuevos.

**No es una transacción global**: no existe un bloqueo atómico que abarque la consulta vacía y toda la importación CLI. No escribas desde otras herramientas durante la ventana de copia. Si aparece un documento concurrente con el mismo ID, create falla; si aparece otro ID, la comparación detecta el extra. Puede quedar una carga parcial. El procedimiento no la borra, sobrescribe ni reintenta automáticamente. Revisa import-result.json, los documentos/medios creados y las huellas; una nueva ejecución con staging no vacío quedará bloqueada. Cualquier limpieza/reinicio posterior requiere una decisión y autorización separadas.

## 3. Verificar sin modificar contenido

La importación llama automáticamente al verificador. También puede repetirse de forma independiente:

```bash
node ops/sanity-staging/cli.mjs verify \
  --directory /tmp/salitre-staging-inicial
```

Solo realiza lecturas y exporta staging a un archivo local nuevo. Compara:

- Conjunto exacto de IDs/tipos, incluidas imágenes/archivos y borradores.
- Todos los campos editoriales, orden de arrays y referencias, con propiedades `_type`/`_key`.
- Bytes de cada recurso por SHA-256 entre los exports; identidad SHA-1/ID de los assets.
- Que las URLs/rutas de assets pertenezcan ahora a staging y no sigan apuntando a production.
- Que source y target no cambien durante la comprobación, y que production siga coincidiendo con la instantánea aprobada.

Solo se normalizan `_rev`, `_createdAt`, `_updatedAt`, el uploadId regenerado de los assets y la parte del dataset de url/path del asset. No se ignoran textos, precios, referencias, disponibilidad, metadatos personalizados o datos de imagen. Los informes privados identifican diferencias sin corregirlas; un resultado distinto termina con código de error.

Después de autorizar y completar una copia verificada, abre el dashboard SaaS y comprueba sus páginas, categorías, platos e imágenes sobre staging. La web Astro debe seguir consultando production. Esta revisión visual no está acreditada por los tests ni exige reconstruir/publicar la web pública.

## Límites y fallos seguros

Content Releases/versions, referencias entre datasets/proyectos, referencias fuertes rotas o arrays de objetos sin `_key` requieren un procedimiento revisado aparte: se rechazan antes de importar, no se eliminan ni reescriben silenciosamente. También se rechaza `_weak=false` explícito o una referencia sin `_type` si la CLI fuera a cambiar su representación. Las referencias débiles ausentes se conservan y cuentan en el resumen.

Si el procesamiento de un asset cambia su hash (por ejemplo determinados SVG sanitizados), no se garantiza conservar su ID con una nueva subida: se detiene antes de escribir y requiere revisión. Los metadatos regenerados que no estén en la pequeña lista normalizada se comparan de forma estricta: una diferencia causa fallo, nunca un éxito supuesto. Este procedimiento está pensado para datasets moderados: máximo 100000 documentos leídos y 128 MiB por salida textual del tar.

No se ha probado esta PR contra tus datasets: no se han realizado consultas, exportaciones, importaciones o descargas de Sanity. Los tests usan documentos/binarios sintéticos, comandos CLI sustituidos y archivos temporales locales. La validación remota queda pendiente de autorización y secretos configurados.

## Tests locales sin credenciales

```bash
node --test ops/sanity-staging/*.test.mjs
node --check ops/sanity-staging/cli.mjs
```

La validación independiente `.github/workflows/validate-staging-tools.yml` ejecuta únicamente esos tests y comprobaciones sintácticas, sin secretos, sin invocar la CLI de Sanity y sin subir archivos de contenido.
