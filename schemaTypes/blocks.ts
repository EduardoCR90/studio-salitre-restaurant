import {defineType,defineField,defineArrayMember} from 'sanity';
export function validLink(value:unknown):boolean {
 if (typeof value !== 'string') return false;
 if (/^\/(?!\/)[a-z0-9/#?=&%._-]*$/i.test(value)) return true;
 try {return new URL(value).protocol === 'https:' && value.startsWith('https://');} catch {return false;}
}
const text = (name:string,title:string,required=false) => defineField({name,title,type:'string',validation:Rule=>required?Rule.required():Rule});
export const blockNames = ['hero','richText','imageText','galleryBlock','menuSection','cards','cta','faq','divider','notice'] as const;
const choices = (name:string,title:string,values:string[],initialValue:string) => defineField({name,title,type:'string',initialValue,options:{list:values.map(value=>({value,title:({editorial:'Editorial',compact:'Compacta',left:'Izquierda',center:'Centro',right:'Derecha',reading:'Lectura',wide:'Amplio',small:'Pequeño',medium:'Medio',large:'Grande'} as Record<string,string>)[value]||value}))},validation:Rule=>Rule.custom(value=>!value || values.includes(value) || 'Selecciona una opción válida')});
const image = defineField({name:'image',title:'Imagen',type:'editorialImage'});
const cta = defineField({name:'cta',title:'Enlace de acción',type:'contentLink'});
const item = (name:string,fields:ReturnType<typeof defineField>[]) => defineArrayMember({name,type:'object',fields});
const array = (name:string,title:string,of:ReturnType<typeof defineArrayMember>[],required=false) => defineField({name,title,type:'array',of,validation:Rule=>required?Rule.required().min(1):Rule});
const common = [text('title','Título'),choices('variant','Presentación',['editorial','compact'],'editorial'),choices('alignment','Alineación',['left','center'],'left')];
function block(name:string,title:string,fields:ReturnType<typeof defineField>[]) {
 return defineType({name,title,type:'object',fields:[...common.filter(f=>!fields.some(x=>x.name===f.name)),...fields],preview:{select:{title:'title'},prepare:({title:heading})=>({title:heading||title,subtitle:title})}});
}
export const contentLink = defineType({name:'contentLink',title:'Enlace',type:'object',fields:[text('label','Texto del enlace',true),defineField({name:'href',title:'Destino',description:'URL HTTPS o ruta interna, por ejemplo /carta/. La web añade su ruta base.',type:'string',validation:Rule=>Rule.required().custom(value=>validLink(value) || 'Usa HTTPS o una ruta interna')})]});
export const richBody = defineType({name:'richBody',title:'Contenido enriquecido',type:'array',of:[defineArrayMember({type:'block',styles:[{title:'Párrafo',value:'normal'},{title:'Título de sección',value:'h2'},{title:'Subtítulo',value:'h3'},{title:'Cita',value:'blockquote'}],lists:[{title:'Viñetas',value:'bullet'},{title:'Numerada',value:'number'}],marks:{decorators:[{title:'Negrita',value:'strong'},{title:'Cursiva',value:'em'}],annotations:[{name:'link',title:'Enlace',type:'object',fields:[defineField({name:'href',title:'Destino',type:'string',validation:Rule=>Rule.required().custom(value=>validLink(value) || 'Usa HTTPS o una ruta interna')})]}]}})]});
export const blockTypes = [
 block('hero','Hero / Banner',[text('title','Título',true),text('subtitle','Subtítulo'),image,cta]),
 block('richText','Texto enriquecido',[defineField({name:'body',title:'Contenido',type:'richBody',validation:Rule=>Rule.required().min(1)}),choices('width','Ancho',['reading','wide'],'reading')]),
 block('imageText','Imagen y texto',[defineField({...image,validation:Rule=>Rule.required()}),defineField({name:'body',title:'Texto',type:'text',validation:Rule=>Rule.required()}),choices('position','Posición de imagen',['left','right'],'left'),cta]),
 block('galleryBlock','Galería',[array('images','Imágenes (arrastra para ordenar)',[defineArrayMember({type:'editorialImage'})],true)]),
 block('menuSection','Sección de carta',[array('categories','Categorías (vacío: todas)',[defineArrayMember({type:'reference',to:[{type:'category'}]})]),array('dishes','Platos (vacío: todos)',[defineArrayMember({type:'reference',to:[{type:'dish'}]})])]),
 block('cards','Tarjetas editoriales',[array('items','Tarjetas (arrastra para ordenar)',[item('editorialCard',[text('title','Título',true),defineField({name:'description',title:'Descripción',type:'text'}),image,defineField({name:'link',title:'Enlace',type:'contentLink'})])],true)]),
 block('cta','Llamada a la acción',[text('title','Título',true),defineField({name:'description',title:'Descripción',type:'text'}),defineField({...cta,validation:Rule=>Rule.required()}),image]),
 block('faq','Preguntas frecuentes',[array('items','Preguntas (arrastra para ordenar)',[item('questionAnswer',[text('question','Pregunta',true),defineField({name:'answer',title:'Respuesta',type:'text',validation:Rule=>Rule.required()})])],true)]),
 block('divider','Separador / Espaciador',[choices('spacing','Espacio',['small','medium','large'],'medium'),defineField({name:'line',title:'Mostrar línea',type:'boolean',initialValue:true})]),
 block('notice','Aviso / Promoción',[text('text','Texto',true),cta,defineField({name:'startsAt',title:'Visible desde (opcional)',type:'datetime'}),defineField({name:'endsAt',title:'Visible hasta (opcional)',type:'datetime',description:'Las fechas se evalúan al reconstruir la web; vuelve a ejecutar el workflow al empezar o finalizar.',validation:Rule=>Rule.custom((value,context)=>!value || !(context.parent as {startsAt?:string})?.startsAt || Date.parse(value)>=Date.parse((context.parent as {startsAt:string}).startsAt) || 'Debe ser posterior al inicio')})]),
];
