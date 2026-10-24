import { defineCliConfig } from 'sanity/cli';
export default defineCliConfig({
  api: {
    projectId: process.env.SANITY_STUDIO_PROJECT_ID || 'hfa8zkyw',
    dataset: process.env.SANITY_STUDIO_DATASET || 'production',
  },
  studioHost: process.env.SANITY_STUDIO_HOSTNAME || 'salitre-restaurant-hfa8zkyw',
});
