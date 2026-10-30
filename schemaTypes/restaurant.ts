import {defineType,defineField,defineArrayMember} from 'sanity';
const color = (name:string,title:string,initialValue:string) => defineField({name,title,type:'string',initialValue,description:'Color hexadecimal #RRGGBB. Comprueba el contraste antes de publicar.',validation:Rule=>Rule.regex(/^#[0-9a-fA-F]{6}$/)});
export const theme = defineType({name:'restaurantTheme',title:'Identidad visual',type:'object',fields:[
 defineField({name:'name',title:'Tema',type:'string',initialValue:'salitre',options:{list:[{title:'Salitre editorial',value:'salitre'}]}}),
 color('paper','Fondo','#ece8df'),color('ink','Texto','#252d27'),color('accent','Acento','#95462f'),
 defineField({name:'font',title:'Tipografía de titulares',type:'string',initialValue:'editorial',options:{list:[{title:'Serif editorial',value:'editorial'},{title:'Sans serif',value:'sans'}]}}),
 defineField({name:'button',title:'Botones',type:'string',initialValue:'solid',options:{list:[{title:'Relleno',value:'solid'},{title:'Contorno',value:'outline'}]}}),
 defineField({name:'cards',title:'Tarjetas',type:'string',initialValue:'editorial',options:{list:[{title:'Editorial',value:'editorial'},{title:'Compacta',value:'compact'}]}}),
]});
export const modulePreferences = defineType({name:'modulePreferences',title:'Preferencias de módulos',type:'array',description:'Solo preferencias de presentación. La contratación y autorización se comprobarán en un futuro backend; estos campos no activan funcionalidades.',of:[defineArrayMember({name:'modulePreference',type:'object',fields:[
 defineField({name:'key',title:'Módulo',type:'string',options:{list:[{title:'Reservas',value:'reservations'},{title:'Empleados',value:'staff'},{title:'Carta QR',value:'qrMenu'},{title:'Eventos',value:'events'},{title:'Analíticas',value:'analytics'}]},validation:Rule=>Rule.required()}),
 defineField({name:'enabled',title:'Solicitar activación',type:'boolean',initialValue:false}),
 defineField({name:'presentation',title:'Presentación',type:'string',initialValue:'link',options:{list:[{title:'Enlace',value:'link'},{title:'Sección',value:'section'}]}}),
],preview:{select:{title:'key'}}})],validation:Rule=>Rule.custom(value=>!value || new Set(value.map(v=>(v as {key?:string}).key)).size===value.length || 'No repitas módulos')});
