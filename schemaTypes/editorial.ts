import { defineType, defineField } from "sanity";
const copyField = (name: string, title: string) =>
  defineField({
    name,
    title,
    type: "text",
    rows: 2,
    validation: (Rule) =>
      Rule.custom(
        (v) =>
          v == null ||
          (typeof v === "string" && v.trim().length > 0 && v.length <= 20000) ||
          "Usa texto no vacío de hasta 20000 caracteres",
      ),
  });
export const editorialHeading = defineType({
  name: "editorialHeading",
  title: "Titular con énfasis",
  type: "object",
  fields: [
    defineField({
      name: "before",
      title: "Texto inicial (admite saltos de línea)",
      type: "text",
      rows: 2,
      validation: (Rule) => Rule.max(20000),
    }),
    defineField({
      name: "emphasis",
      title: "Texto en cursiva",
      type: "text",
      rows: 2,
      validation: (Rule) => Rule.max(20000),
    }),
    defineField({
      name: "after",
      title: "Texto final",
      type: "text",
      rows: 2,
      validation: (Rule) => Rule.max(20000),
    }),
  ],
  validation: (Rule) =>
    Rule.custom(
      (v) =>
        v == null ||
        ["before", "emphasis", "after"].some((key) => {
          const x = (v as Record<string, unknown>)[key];
          return typeof x === "string" && x.trim().length > 0;
        }) ||
        "Escribe al menos un fragmento del titular",
    ),
});
export const pageComposition = defineType({
  name: "pageComposition",
  title: "Textos de la composición original",
  type: "object",
  description:
    "Opcional. Sin valores se conserva el texto histórico; no añade bloques ni cambia la composición.",
  fields: [
    defineField({
      name: "hero",
      title: "Hero original",
      type: "object",
      fields: [
        copyField("caption", "Pie de fotografía"),
        copyField("coordinates", "Coordenadas (una línea por fila)"),
        copyField("sideNote", "Texto lateral"),
        defineField({ name: "link", title: "Enlace", type: "contentLink" }),
      ],
    }),
    defineField({
      name: "essence",
      title: "Concepto",
      type: "object",
      fields: [
        copyField("eyebrow", "Antetítulo"),
        defineField({
          name: "heading",
          title: "Titular con énfasis",
          type: "editorialHeading",
        }),
        defineField({ name: "link", title: "Enlace", type: "contentLink" }),
      ],
    }),
    defineField({
      name: "featured",
      title: "Platos destacados",
      type: "object",
      fields: [
        copyField("eyebrow", "Antetítulo"),
        defineField({
          name: "heading",
          title: "Titular con énfasis",
          type: "editorialHeading",
        }),
        defineField({ name: "link", title: "Enlace", type: "contentLink" }),
        copyField("empty", "Mensaje sin contenido"),
      ],
    }),
    defineField({
      name: "storyPreview",
      title: "Avance de historia",
      type: "object",
      fields: [
        copyField("eyebrow", "Antetítulo"),
        defineField({ name: "link", title: "Enlace", type: "contentLink" }),
      ],
    }),
    defineField({
      name: "story",
      title: "Historia",
      type: "object",
      fields: [copyField("eyebrow", "Antetítulo")],
    }),
    defineField({
      name: "chef",
      title: "Chef",
      type: "object",
      fields: [copyField("eyebrow", "Antetítulo")],
    }),
    defineField({
      name: "gallery",
      title: "Galería",
      type: "object",
      fields: [
        copyField("eyebrow", "Antetítulo"),
        defineField({
          name: "heading",
          title: "Titular con énfasis",
          type: "editorialHeading",
        }),
        copyField("empty", "Mensaje sin contenido"),
      ],
    }),
    defineField({
      name: "contact",
      title: "Contacto",
      type: "object",
      fields: [
        copyField("eyebrow", "Antetítulo"),
        defineField({
          name: "heading",
          title: "Titular con énfasis",
          type: "editorialHeading",
        }),
        copyField("providerLabel", "Texto del botón del proveedor"),
        copyField("hoursTitle", "Título de horarios"),
        copyField("addressTitle", "Título de ubicación"),
        copyField("unavailable", "Mensaje de reservas no activas"),
      ],
    }),
  ],
});
export const siteEditorial = defineType({
  name: "siteEditorial",
  title: "Textos de la composición original",
  type: "object",
  description:
    "Opcional. Sin valores se conserva el texto histórico; no añade bloques ni cambia la composición.",
  fields: [
    copyField("signature", "Firma bajo el logotipo"),
    defineField({
      name: "footer",
      title: "Pie de página",
      type: "object",
      fields: [
        copyField("line", "Firma del pie"),
        defineField({ name: "link", title: "Enlace", type: "contentLink" }),
        copyField("backToTop", "Texto para volver arriba"),
      ],
    }),
    defineField({
      name: "reservation",
      title: "Franja de reservas",
      type: "object",
      fields: [
        copyField("eyebrow", "Antetítulo"),
        defineField({
          name: "heading",
          title: "Titular con énfasis",
          type: "editorialHeading",
        }),
        defineField({ name: "link", title: "Enlace", type: "contentLink" }),
      ],
    }),
    defineField({
      name: "menu",
      title: "Textos de la carta",
      type: "object",
      fields: [
        copyField("emptyCategory", "Categoría vacía"),
        copyField("emptyMenu", "Carta vacía"),
        copyField("disclaimer", "Aviso de precios y alérgenos"),
        copyField("noAllergens", "Sin alérgenos declarados"),
        copyField("unavailable", "Plato no disponible"),
      ],
    }),
  ],
});
