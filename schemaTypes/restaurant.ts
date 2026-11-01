import {defineType,defineField,defineArrayMember} from 'sanity';
import {visualTokenSchemas,visualLabels,storedThemeSchema,presetNames,optionLabels} from './visual.ts';
export const theme=defineType({name:'restaurantTheme',title:'Identidad visual',type:'object',fields:[
 defineField({name:'preset',title:'Preset visual',type:'string',options:{list:presetNames.map(value=>({title:value[0].toUpperCase()+value.slice(1),value}))}}),
 ...Object.entries(visualTokenSchemas).map(([name,schema])=>{
  const base={name,title:visualLabels[name as keyof typeof visualLabels],description:'Opcional: vacío hereda el preset o la configuración compatible de la web.'};
  if(schema.type==='number')return defineField({...base,type:'number'});
  return defineField({...base,type:'string',...('options' in schema?{options:{list:(schema.options as string[]).map(value=>({title:optionLabels[value]||value,value}))}}:{})});
 }),
],validation:Rule=>Rule.custom(value=>value==null||storedThemeSchema.safeParse(value).success||'Revisa colores, rangos y variantes visuales')});
export const modulePreferences = defineType({name:'modulePreferences',title:'Preferencias de módulos',type:'array',description:'Solo preferencias de presentación. La contratación y autorización se comprobarán en un futuro backend; estos campos no activan funcionalidades.',of:[defineArrayMember({name:'modulePreference',type:'object',fields:[
 defineField({name:'key',title:'Módulo',type:'string',options:{list:[{title:'Reservas',value:'reservations'},{title:'Empleados',value:'staff'},{title:'Carta QR',value:'qrMenu'},{title:'Eventos',value:'events'},{title:'Analíticas',value:'analytics'}]},validation:Rule=>Rule.required()}),
 defineField({name:'enabled',title:'Solicitar activación',type:'boolean',initialValue:false}),
 defineField({name:'presentation',title:'Presentación',type:'string',initialValue:'link',options:{list:[{title:'Enlace',value:'link'},{title:'Sección',value:'section'}]}}),
],preview:{select:{title:'key'}}})],validation:Rule=>Rule.custom(value=>!value || new Set(value.map(v=>(v as {key?:string}).key)).size===value.length || 'No repitas módulos')});
