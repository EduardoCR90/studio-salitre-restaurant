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
  ...singletons.map(item => S.listItem().title(item.title).child(S.document().schemaType(item.type).documentId(item.id))),
  ...S.documentTypeListItems().filter(item => !singletons.some(s => s.type === item.getId())),
 ]) })],
 schema:{ types:schemaTypes, templates: templates => templates.filter(template => !singletons.some(s => s.type === template.schemaType)) },
 document:{ actions: (actions, context) => singletons.some(s => s.type === context.schemaType) ? actions.filter(action => !['duplicate','delete','unpublish'].includes(action.action || '')) : actions },
});
