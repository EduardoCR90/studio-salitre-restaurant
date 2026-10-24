# Preparación de la importación inicial de Salitre

Destino fijo: proyecto `hfa8zkyw`, dataset `production`. El frontend es EduardoCR90/restaurant-premium-sanity y el Studio EduardoCR90/studio-salitre-restaurant. Este procedimiento no modifica componentes, estilos ni la configuración de GitHub Pages.

## Plan candidato

| Tipo | Documentos | Contenido |
| --- | ---: | --- |
| settings | 1 | Marca, concepto, contacto ficticio, horarios y reservas inactivas |
| story | 1 | Historia, filosofía y chef ficticia |
| gallery | 1 | Tres fotografías ordenadas |
| page | 4 | Inicio, carta, restaurante y reservas, incluidos textos y SEO |
| category | 4 | Para comenzar, Tierra y mar, Un final lento y En la copa |
| dish | 11 | Nombres, descripciones, precios EUR, alérgenos, disponibilidad y destacados |
| **Total** | **22** | Documentos publicados, no borradores |

Se preparan seis fotografías JPEG, con un máximo de 2000 px de ancho, referenciadas en once lugares: cuatro páginas, tres platos destacados, historia y tres imágenes de galería. Los otros ocho platos no tenían imagen en la demo y no se inventan fotografías. La imagen social local de Astro se mantiene. Cada foto conserva su alt.

## Auditoría antes de confirmar

El workflow **Audit demo import (read only)**:

1. Obtiene el frontend actual de main y ejecuta el exportador existente `npm run seed:export`. Este comando solo genera un NDJSON local.
2. Consulta documentos y assets de production con perspectiva raw. Con un token válido incluye borradores y versiones, además de publicados. Sin autenticación solo informa de una auditoría parcial y no marca el plan como importable.
3. Detiene la futura importación si existe cualquier documento de contenido, aunque sea un borrador. Los documentos internos de Sanity (`system.*` y `sanity.*`) se excluyen del inventario de contenido y nunca se modifican. Los assets existentes se pueden reutilizar por su hash; no se reescriben.
4. Valida los datos del exportador, los slugs y relaciones y usa los validadores reales del schema de Studio para los 22 documentos candidatos. Las referencias a documentos/imagenes pendientes se validan dentro del plan en memoria: esto no significa que ya existan en Sanity.
5. Descarga y comprueba las seis fotografías: HTTP, formato JPEG, dimensiones, tamaño y hashes. No las sube.
6. Genera el artefacto `salitre-import-review`: SUMMARY.md, plan.json y un NDJSON de validación. No importes directamente ese NDJSON: contiene claves de origen y referencias de prevalidación, no los IDs finales.

`plan.json` incluye inventario, errores, fotografías, estado `ready` y una huella SHA-256. La huella cubre datos, imágenes, schemas, código de importación y estado del dataset; cambiar cualquiera obliga a revisar y aprobar otro plan.

El modo audit termina antes de cualquier llamada a assets.upload, create o transacción. No escribe en Sanity. Las auditorías automáticas de PR solo se ejecutan para ramas del mismo repositorio, no forks.

## Secreto seguro

En **studio-salitre-restaurant → Settings → Secrets and variables → Actions**, añade el secreto `SANITY_IMPORT_TOKEN`, con un token Sanity limitado al proyecto y autorizado para leer borradores, crear documentos y subir imágenes (por ejemplo, rol Editor adecuado al dataset). No lo pegues en el chat ni en archivos.

La auditoría/importación puede reutilizar `SANITY_AUTH_TOKEN` ya configurado para Studio si tiene esos permisos; un token que solo despliega el editor puede no bastar. Los valores nunca se imprimen ni se guardan en artefactos. No se usan prefijos públicos. El GITHUB_TOKEN del workflow solo tiene contents:read.

## Confirmación expresa e importación posterior

**No ejecutes el workflow de importación hasta revisar el plan y confirmar expresamente los 22 documentos publicados y sus seis imágenes.** La autorización genérica de desarrollo no sustituye esa confirmación.

Después de aprobarlo:

1. Ejecuta una auditoría reciente en main; comprueba que ready sea true y que no haya documentos existentes ni errores.
2. En **Import approved demo content → Run workflow → main**, introduce la frase exacta `CONFIRMAR IMPORTACION SALITRE` y la SHA-256 del plan aprobado. No hay valores de confirmación predeterminados ni triggers de push/PR en este workflow.
3. El script vuelve a auditar y compara la huella antes de escribir. Si hay cambios o borradores nuevos, se bloquea sin crear documentos.
4. Reutiliza assets idénticos existentes o sube los nuevos. Vuelve a comprobar ausencia de contenido antes de crear documentos.
5. Sanity asigna IDs a las cuatro categorías; las referencias de platos usan los IDs devueltos. Las páginas y platos también se crean sin IDs de origen. Solo se fijan los IDs singleton restaurant-settings, restaurant-story y restaurant-gallery. No se usan createOrReplace, patch, delete ni --replace.
6. Los 18 documentos restantes se crean en una transacción mediante create. Una colisión de singleton causa error, no sustitución. El resultado guarda IDs reales en import-result.json.

Las categorías se crean antes de la transacción porque sus IDs los asigna Sanity. Esto no es una transacción global: si hay un error intermedio, el recibo registra qué se alcanzó a crear y no se repite ni se borra automáticamente. La siguiente auditoría bloqueará otra importación hasta revisar ese estado. Los assets subidos no se borran automáticamente.

Si ya tienes webhook, considera pausarlo durante esta primera carga para evitar builds intermedias con contenido parcial; Astro conserva el último despliegue correcto si una build falla. Reactívalo tras verificar el contenido completo.

## Comprobaciones posteriores a importar

El script ejecuta `npm run check:cms` en el frontend y exige fuente sanity, además de build real y check:build. Si falla, guarda el recibo y no intenta ocultarlo con mock. Desde Studio comprueba los tres singletons, las cuatro páginas, categorías, once platos, precios e imágenes. Los campos siguen siendo editables en los esquemas existentes.

Finalmente comprueba el webhook o ejecuta manualmente el workflow de Pages del frontend para reconstruir. Revisa las cuatro páginas, referencias y fotografías públicas, manteniendo isFictional y reservas inactivas hasta que se trate de un negocio real. La importación preparada no acredita su ejecución ni la revisión visual de Studio: esas comprobaciones se realizan solo después de confirmarla.
