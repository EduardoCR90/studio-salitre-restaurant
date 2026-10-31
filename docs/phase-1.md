# Edición y compatibilidad de fase 1

El modelo completo, los contratos Astro, catálogo de bloques, ejemplos, migración gradual, segundo restaurante y fase 2 se documentan en [la guía del frontend](https://github.com/EduardoCR90/restaurant-premium-sanity/blob/codex/phase-1-dynamic-blocks/docs/phase-1.md). Al integrar ambas PR, la guía estará también en main.

## Organización editorial

- **Mi restaurante:** historia y chef, con el mismo singleton `restaurant-story`.
- **Páginas y navegación:** páginas, SEO y menú; ordenación por Orden en navegación.
- **Carta y categorías:** categorías y platos, con orden numérico y previsualización de disponibilidad.
- **Galerías e imágenes:** el mismo singleton `restaurant-gallery`.
- **Promociones y avisos:** páginas que contienen un bloque notice; edita ese bloque en la página, sin duplicar documentos.
- **Configuración:** identidad, contacto, horarios, tema y preferencias futuras, en `restaurant-settings`.

No cambia el control de acciones de singletons: no se ofrecen duplicación, eliminación ni despublicación. Los esquemas siguen separados del frontend.

## Crear una página

1. Crea Página. Usa título, slug único y SEO; opcionalmente antetítulo e introducción.
2. Configura visibilidad pública y presencia en el menú, etiqueta y orden.
3. Añade bloques; arrástralos para ordenar. Usa los campos de ayuda y publica solo tras revisar.
4. El webhook existente reconstruye la web. Los borradores no generan rutas; Oculta retira ruta y navegación en la siguiente build.

Slugs: hasta 80 caracteres, letras ASCII minúsculas/números separados por guiones simples. Se reservan index, 404, admin, dashboard, api, assets, _astro, robots, robots.txt, sitemap y sitemap.xml. Se usa la unicidad nativa de Sanity y una segunda comprobación en Astro. Conserva las cuatro rutas lógicas inicio, carta, restaurante y reservas; inicio se sirve como portada.

## Bloques disponibles

Hero, texto enriquecido, imagen y texto, galería, sección de carta, tarjetas, CTA, FAQ, separador y aviso/promoción. Son objetos dentro de `page.blocks`; Sanity mantiene sus `_key` y el orden del array. Las imágenes reutilizan editorialImage, con alt obligatorio. Las secciones de carta seleccionan referencias a categorías/platos; sin selección se muestran todos los visibles.

**Página existente sin bloques: conserva su composición anterior. Añadir bloques reemplaza visualmente toda esa composición.** No borra los campos anteriores ni documentos compartidos, pero hay que trasladar todas las secciones que se quieran mostrar. Empieza por una página de prueba en un dataset de ensayo. No añadas un único bloque a la portada real esperando que se sume a su diseño anterior.

Avisos: fechas opcionales, fin posterior al inicio. Se evalúan en build; reconstruye en los límites de vigencia. No se ha creado ninguna automatización. Texto enriquecido: párrafos, h2/h3, citas, listas, negrita, cursiva y enlaces seguros; el renderer inicial aplana listas anidadas a un nivel.

## Carta

- Visible desactivado: no se muestra el plato.
- Visible activado y Disponible desactivado: aparece como agotado.
- Visible y Disponible activados: disponible.
- Categoría oculta: también se ocultan sus platos en la web.

Los documentos anteriores sin Visible se consideran visibles. El orden numérico se puede editar y usar en las listas; los bloques y sus elementos sí se arrastran. Asigna platos mediante su referencia Categoría. Se mantienen IDs, precios, imágenes, alérgenos y relaciones. No se impone una enumeración nueva de alérgenos sobre el contenido existente: se validan valores únicos, no vacíos y de longitud razonable. La información debe verificarse editorialmente.

## Tema y módulos

Configuración → Identidad permite logotipo, colores hexadecimales, tipografía editorial/sans y estilos compatibles de botones y tarjetas. Sin valores nuevos se usa Salitre. Verifica contraste al cambiar colores. Las composiciones históricas contienen textos decorativos de Salitre; para otra marca usa bloques o personalízalas.

Las preferencias de módulos futuros son únicamente presentación y solicitud de activación. No conceden permisos ni contratación; el futuro backend deberá autorizar cada capacidad. No se implementan funcionalidades de reservas, empleados, QR, eventos o analíticas.

## Validar y entregar

```bash
npm ci --no-audit --no-fund
npm run check
npm test
npm run build
```

Para cambiar un contrato, coordina esquema, GROQ, Zod, mock, exportador y pruebas del frontend. Añade nuevos bloques a blockNames/blockTypes, su contrato y al registro de componentes Astro.

Cambios de esta fase: ocho tipos originales preservados, diez objetos de bloque, contentLink, richBody, restaurantTheme y modulePreferences. No hay tipos documentales nuevos, por lo que el filtro del webhook no cambia.

No se necesita ni se ejecuta migración: todos los defaults son compatibles y se aplican también al leer. No ejecutes `seed:import` sobre los documentos existentes. Para una conversión masiva futura, prepara backup, plan con IDs/revisiones, parches idempotentes y prueba en otro dataset antes de solicitar autorización.

Se recomienda integrar primero el frontend compatible y después publicar Studio/schema con autorización. Esta entrega no ejecuta deploy/schema:deploy, no modifica production ni cambia el webhook. Pendiente: revisión editorial en Studio publicado y publicación de una página de prueba en un proyecto de ensayo. No hay vista previa de borradores en esta fase.

## Cierre y trabajo exclusivamente desde el móvil

El [informe de cierre](https://github.com/EduardoCR90/restaurant-premium-sanity/blob/codex/phase-1-dynamic-blocks/docs/phase-1-closeout.md) contiene las Actions verificadas, revisión de compatibilidad, capturas móviles, prueba editorial aislada y los pasos exactos para integrar/publicar desde GitHub sin entorno local.

Orden: primero PR frontend #4 y comprobar su despliegue; después PR Studio #3 y su publicación manual autorizada. Las dos PR siguen sin integrar. No usar Publish standalone Sanity Studio como despliegue de ensayo: su workflow fija hfa8zkyw/production. La vista previa interactiva y el Studio de ensayo requieren destinos distintos y autorización; las capturas se pueden revisar ahora en GitHub.
