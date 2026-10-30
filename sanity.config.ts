import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { schemaTypes } from './schemaTypes';
const projectId = process.env.SANITY_STUDIO_PROJECT_ID || 'hfa8zkyw';
const dataset = process.env.SANITY_STUDIO_DATASET || 'production';
if (!projectId || !dataset) throw new Error('Configura SANITY_STUDIO_PROJECT_ID y SANITY_STUDIO_DATASET en .env');
const singletons = [
 { type:'settings', id:'restaurant-settings', title:'Configuración y contacto' },
 { type:'story', id:'restaurant-story', title:'Historia y chef' },
 { type:'gallery', id:'restaurant-gallery', title:'Galería editorial' },
];
export default defineConfig({
 name:'salitre', title:'Salitre · Contenido', projectId, dataset,
 plugins:[structureTool({ structure: S => S.list().title('Restaurante').items([
  S.listItem().title('Mi restaurante').child(S.list().title('Mi restaurante').items([S.listItem().title('Historia y chef').child(S.document().schemaType('story').documentId('restaurant-story'))])),
  S.listItem().title('Páginas y navegación').child(S.documentTypeList('page').title('Páginas y navegación').defaultOrdering([{field:'navigationOrder',direction:'asc'}])),
  S.listItem().title('Carta y categorías').child(S.list().title('Carta y categorías').items(['category','dish'].map(type=>S.documentTypeListItem(type)))),
  S.listItem().title('Galerías e imágenes').child(S.document().schemaType('gallery').documentId('restaurant-gallery')),
  S.listItem().title('Promociones y avisos').child(S.documentList().title('Páginas con avisos').filter('_type == "page" && count(blocks[_type == "notice"]) > 0')),
  S.listItem().title('Configuración').child(S.document().schemaType('settings').documentId('restaurant-settings')),
 ]) })],
 schema:{ types:schemaTypes, templates: templates => templates.filter(template => !singletons.some(s => s.type === template.schemaType)) },
 document:{ actions: (actions, context) => singletons.some(s => s.type === context.schemaType) ? actions.filter(action => !['duplicate','delete','unpublish'].includes(action.action || '')) : actions },
});
