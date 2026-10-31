# Iteración 1: compatibilidad editorial

Inventario completo, decisiones y validación: [documento coordinado del dashboard](https://github.com/EduardoCR90/restaurant-platform-dashboard/blob/3bd9047/docs/editorial-compatibility.md).

Main de partida verificado: dashboard 118c62d, Astro adc9401, Studio 304c823. Cambios coordinados y opcionales: page.composition (textos de las composiciones históricas), settings.editorial (cabecera/pie/carta/CTA), settings.socialImage. No se duplican documentos ni se convierten páginas a bloques. Sin campos nuevos, se conserva la composición y los textos originales.

Los textos se escapan; los titulares separan before/emphasis/after sin HTML. Link ausente hereda el original, link null oculta; null en grupos/textos conserva defaults. Los estados de demo/ficticio y la activación segura de reservas siguen controlados por el código.

La fixture tests/fixtures/editorial-contract.json es idéntica en los tres repositorios y solo contiene datos sintéticos. El inventario describe las pruebas de contratos, formularios, borradores y HTML estático. Studio sigue siendo la autoridad del schema; las consultas/adaptadores de Astro y el dashboard consumen ese contrato.

No hay migración de datos, escrituras CMS, cambios SQL, deploy ni habilitación de production. No ejecutar seed/import ni las herramientas de clonación. Los nuevos campos empiezan a actuar solo cuando un operador publique overrides de forma autorizada en una iteración posterior.

Orden propuesto: Astro compatible, Studio/schema y dashboard. Integrar Astro en main dispara su workflow existente de Pages; no se ha hecho merge. El despliegue de Studio/schema es otra operación remota que debe autorizarse por separado. Para validar ahora usa exclusivamente fixtures, SANITY_USE_MOCK=true en Astro y builds locales; no check:cms ni comandos de publicación.
