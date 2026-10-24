import { defineType, defineField, defineArrayMember } from 'sanity';
const requiredText = (name: string, title: string) => defineField({ name, title, type:'string', validation: Rule => Rule.required() });
const requiredBody = (name: string, title: string) => defineField({ name, title, type:'text', rows:4, validation: Rule => Rule.required() });
const image = defineType({ name:'editorialImage', title:'Imagen editorial', type:'image', options:{ hotspot:true }, fields:[requiredText('alt','Texto alternativo (describe la imagen)')] });
const seo = defineType({ name:'seo', title:'SEO', type:'object', fields:[requiredText('title','Título'), defineField({ name:'description', title:'Descripción', type:'text', validation: Rule => Rule.required().max(180) }), defineField({ name:'image', title:'Imagen social', type:'editorialImage' })] });
const settings = defineType({ name:'settings', title:'Configuración general', type:'document', fields:[
 requiredText('name','Nombre'), requiredText('tagline','Firma de marca'), requiredBody('concept','Concepto gastronómico'),
 requiredText('address','Dirección'), defineField({ name:'email',title:'Email',type:'string',validation:Rule=>Rule.required().email() }), requiredText('phone','Teléfono'),
 defineField({ name:'isFictional',title:'Restaurante ficticio / demostración',type:'boolean',initialValue:true,validation:Rule=>Rule.required() }),
 defineField({ name:'reservationUrl',title:'URL del proveedor real de reservas',type:'url',description:'Solo se activa si el restaurante ya no es ficticio.',validation:Rule=>Rule.uri({scheme:['https']}) }),
 defineField({ name:'hours',title:'Horarios',type:'array',validation:Rule=>Rule.required().min(1),of:[defineArrayMember({type:'object',name:'openingHours',fields:[requiredText('days','Días'),requiredText('time','Horario')]})] }),
] });
const page = defineType({name:'page',title:'Página',type:'document',fields:[
 defineField({name:'slug',title:'Ruta lógica',type:'slug',description:'Crear exactamente: inicio, carta, restaurante y reservas.',validation:Rule=>Rule.required().custom(value => ['inicio','carta','restaurante','reservas'].includes(value?.current || '') || 'Usa una de las cuatro rutas admitidas')}),
 requiredText('eyebrow','Antetítulo'),requiredBody('title','Titular (admite saltos de línea)'),requiredBody('intro','Introducción'),defineField({name:'image',title:'Fotografía',type:'editorialImage'}),defineField({name:'seo',title:'Metadatos SEO',type:'seo',validation:Rule=>Rule.required()}),
],preview:{select:{title:'title',subtitle:'slug.current'}}});
const category = defineType({name:'category',title:'Categoría de carta',type:'document',fields:[requiredText('name','Nombre'),defineField({name:'note',title:'Nota editorial',type:'string'}),defineField({name:'order',title:'Orden',type:'number',validation:Rule=>Rule.required().integer().min(0)})]});
const dish = defineType({name:'dish',title:'Plato',type:'document',initialValue:{available:true,featured:false,allergens:[],order:0},fields:[
 requiredText('name','Nombre'),requiredBody('description','Descripción'),defineField({name:'price',title:'Precio (EUR, IVA incluido)',type:'number',validation:Rule=>Rule.required().min(0).precision(2)}),
 defineField({name:'category',title:'Categoría',type:'reference',to:[{type:'category'}],validation:Rule=>Rule.required()}),
 defineField({name:'image',title:'Fotografía',type:'editorialImage'}),defineField({name:'allergens',title:'Alérgenos',type:'array',of:[{type:'string'}],validation:Rule=>Rule.required().unique()}),
 defineField({name:'available',title:'Disponible',type:'boolean',validation:Rule=>Rule.required()}),defineField({name:'featured',title:'Destacado en inicio',type:'boolean',validation:Rule=>Rule.required()}),defineField({name:'order',title:'Orden',type:'number',validation:Rule=>Rule.required().integer().min(0)}),
],preview:{select:{title:'name',media:'image'}}});
const story = defineType({name:'story',title:'Historia',type:'document',fields:[requiredBody('title','Título'),requiredBody('body','Historia'),requiredBody('philosophy','Filosofía'),requiredText('chefName','Chef'),requiredBody('chefBio','Biografía'),defineField({name:'image',title:'Imagen del equipo o de cocina',type:'editorialImage'})]});
const gallery = defineType({name:'gallery',title:'Galería',type:'document',fields:[defineField({name:'images',title:'Fotografías',type:'array',of:[defineArrayMember({type:'editorialImage'})],validation:Rule=>Rule.required()})]});
export const schemaTypes = [image,seo,settings,page,category,dish,story,gallery];
