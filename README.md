# studio-salitre-restaurant

Sanity Studio independiente para **Salitre-restaurant**, proyecto `hfa8zkyw`, dataset `production`. La web Astro sigue en [restaurant-premium-sanity](https://github.com/EduardoCR90/restaurant-premium-sanity). Este repositorio no contiene Astro ni se publica en GitHub Pages.

Los esquemas y la estructura se migran del Studio ya existente, sin cambiar nombres de tipos, campos ni IDs singleton. Aquí pasa a estar su única fuente de verdad. El frontend conserva su cliente Sanity, consultas, validación y demo de respaldo. No se han creado ni sustituido documentos del dataset.

## Trabajar solo con GitHub y el navegador

1. Integra la PR de instalación. Actions compila el Studio sin necesitar tokens.
2. En [Sanity Manage](https://www.sanity.io/manage/project/hfa8zkyw), configura un token de automatización autorizado para desplegar Studio y schemas en este proyecto; uno de lectura no basta. Guárdalo en **este repositorio** → Settings → Secrets and variables → Actions → New repository secret, con nombre `SANITY_AUTH_TOKEN`. No lo pegues en el chat ni en archivos.
3. En variables de Actions puedes definir `SANITY_STUDIO_HOSTNAME`. Se propone `salitre-restaurant-hfa8zkyw`, pero no está reservado ni se ha verificado su disponibilidad. Si está ocupado, elige otro.
4. Ejecuta **Actions → Publish standalone Sanity Studio → Run workflow → main**. El workflow publica primero los schemas y después el Studio mediante la CLI oficial. Sin secreto falla con un mensaje explícito; no inicia login interactivo.
5. Solo si el deploy termina correctamente, abre `https://<hostname>.sanity.studio/` e inicia sesión con tu cuenta Sanity. La publicación del Studio no evita los permisos de acceso del proyecto: invita a los editores desde Manage.
6. Si necesitas configurar CORS en Manage → API → CORS origins, permite únicamente el origen HTTPS exacto del Studio con credenciales. No uses `*` con credenciales. La web Astro consulta Sanity durante la build y no necesita CORS del navegador.

No se ha publicado el Studio ni desplegado el schema sin un token autorizado. La URL anterior es una propuesta, no un servicio verificado.

## Crear contenido desde el navegador

En Studio encontrarás:

- **Configuración y contacto**: nombre, concepto, dirección, horarios, correo, teléfono y URL opcional del proveedor de reservas. Mantén `isFictional` activado mientras sea demostración.
- **Historia y chef** y **Galería editorial**: los documentos singleton mantienen sus IDs anteriores.
- **Página**: crea una por slug lógico `inicio`, `carta`, `restaurante` y `reservas`. Rellena textos y SEO. No crees dos páginas con el mismo slug.
- **Categoría de carta**: nombre, nota y orden.
- **Plato**: nombre, descripción, precio EUR, referencia a categoría, alérgenos, disponibilidad, destacado e imagen.

Sube fotografías con texto alternativo y publica los documentos. Al principio el dataset está vacío: Astro muestra demo explícita. Para la primera versión completa publica configuración, historia, galería (puede estar vacía), las cuatro páginas y las categorías/platos. Datos publicados incompletos detienen una nueva build para conservar la web anterior; no se mezclan silenciosamente con ejemplos.

La carta del navegador cambia al reconstruir Astro, no al compilar Studio. Configura después el webhook documentado en [el frontend](https://github.com/EduardoCR90/restaurant-premium-sanity/blob/main/docs/sanity-setup.md). No necesita un servidor adicional: Sanity solicita la ejecución del workflow de Pages con un token GitHub de permisos mínimos guardado únicamente en la configuración privada del webhook.

## Desarrollo opcional en Codex Cloud u otro equipo

Node 22.22+:

```bash
npm ci
cp .env.example .env
npm run dev
npm run check
npm run build
```

El Studio local se abre en http://localhost:3333. `npm run schema:deploy` y `npm run deploy` requieren autenticación Sanity; puedes usar el workflow manual para no instalar nada en tu ordenador. Los identificadores públicos tienen valores predeterminados; el token nunca entra en el bundle del Studio.

## Modelo

`schemaTypes/index.ts` registra `editorialImage`, `seo`, `settings`, `page`, `category`, `dish`, `story` y `gallery`. `sanity.config.ts` controla singletons y estructura; `sanity.cli.ts` define proyecto, dataset y hostname. Antes de modificar un campo, revisa su consulta GROQ y contrato Zod en el frontend.
