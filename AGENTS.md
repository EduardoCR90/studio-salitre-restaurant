# Salitre Studio

- Fuente de verdad del Studio y sus esquemas: este repositorio. Astro vive en EduardoCR90/restaurant-premium-sanity.
- No incrustar el Studio en Astro. No añadir dependencias Astro ni sus estilos.
- Mantener los tipos existentes: settings, page, category, dish, story, gallery, editorialImage y seo.
- Mantener los IDs singleton restaurant-settings, restaurant-story y restaurant-gallery. Dejar que Sanity asigne IDs a documentos ordinarios.
- Relacionar platos mediante reference a category. Actualizar los contratos Zod/GROQ del frontend si cambia el modelo.
- No guardar tokens en Git ni en variables SANITY_STUDIO_. Los tokens de automatización solo se leen desde secretos de Actions.
- Antes de entregar: npm ci, npm run check, npm run build. Publicar con el workflow manual solo cuando existan credenciales autorizadas.
- No importar ejemplos sobre contenido existente ni reemplazar documentos. No registrar cabeceras ni valores de tokens.
