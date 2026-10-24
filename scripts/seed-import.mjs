import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { createClient } from '@sanity/client';
import { createSchema } from 'sanity';
import { validateDocument } from '@sanity/validation';
import { schemaTypes } from '../schemaTypes/index.ts';
import { PROJECT, DATASET, TYPES, SINGLETONS, hash, imageSlots, downloadUrl, jpegDimensions, assertPlanStructure, buildDocuments, documentCounts, assertImportAllowed } from './seed-plan.mjs';

const mode = process.argv[2] || 'audit';
assert.ok(['audit', 'import'].includes(mode), 'Modo no admitido');
const frontend = resolve(process.env.SEED_FRONTEND || './frontend');
const output = resolve('import-review');
const token = process.env.SANITY_IMPORT_TOKEN || process.env.SANITY_AUTH_TOKEN;
const client = createClient({ projectId:PROJECT, dataset:DATASET, apiVersion:'2025-02-19', perspective:'raw', useCdn:false, token, maxRetries:0, timeout:20000 });
const created = { documents:[], assets:[] };
await mkdir(output, { recursive:true });
async function receipt(extra = {}) { await writeFile(join(output, 'import-result.json'), JSON.stringify({ ...created, ...extra }, null, 2)); }

try {
  // El exportador existente se ejecuta antes en el workflow, sin escribir en Sanity.
  const source = (await readFile(join(frontend, '.sanity/seed.ndjson'), 'utf8')).trim().split('\n').map(line=>JSON.parse(line));
  assertPlanStructure(source);
  const { mockContent } = await import(pathToFileURL(join(frontend, 'src/lib/mock.ts')).href);
  const slots = imageSlots(mockContent);
  const existing = await client.fetch(`{
    "documents": *[!(_type match "sanity.*")] | order(_id asc){_id,_rev,_type},
    "allDocumentTypes": array::unique(*[]._type),
    "assets": *[_type == "sanity.imageAsset"]{_id,sha1hash,url}
  }`, { types:TYPES });
  // Sin token, la lectura pública no demuestra ausencia de borradores.
  const authenticatedAudit = Boolean(token);
  const images = [];
  const buffers = new Map();
  for (const url of [...new Set(slots.map(x=>x.image.url))]) {
    const response = await fetch(downloadUrl(url), { signal:AbortSignal.timeout(30000) });
    assert.ok(response.ok(), `No se descargó una imagen: HTTP ${response.status}`);
    assert.ok(response.headers.get('content-type')?.startsWith('image/jpeg'));
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.ok(bytes.length < 20 * 1024 * 1024, 'Imagen demasiado grande');
    const dimensions = jpegDimensions(bytes);
    const sha1 = createHash('sha1').update(bytes).digest('hex');
    images.push({ source:url, sha256:hash(bytes), sha1, bytes:bytes.length, ...dimensions, reusedAsset:existing.assets.find(x=>x.sha1hash===sha1)?._id || null });
    buffers.set(url, bytes);
  }
  const schemaSource = await readFile(new URL('../schemaTypes/index.ts', import.meta.url), 'utf8');
  const validatorAssets = new Map(images.map(image=>[image.source, image.reusedAsset || `image-${image.sha1}-${image.width}x${image.height}-jpg`]));
  // Estos IDs solo se usan para validar relaciones en memoria. Nunca se escriben.
  const candidate = buildDocuments(source, slots, validatorAssets);
  const known = new Set([...candidate.map(x=>x._id), ...validatorAssets.values()]);
  const schema = createSchema({ name:'salitre-import', types:schemaTypes });
  const validationErrors = [];
  for (const document of candidate) {
    const markers = await validateDocument({
      document:{ ...document, _rev:'preflight', _createdAt:'2026-10-24T00:00:00Z', _updatedAt:'2026-10-24T00:00:00Z' },
      schema, client, customValidation:true,
      getDocumentExists: async ({id})=>known.has(id) || existing.assets.some(x=>x._id===id),
    });
    if (markers.status === 'notEvaluated') validationErrors.push({ document:document._id, message:'Validación incompleta' });
    for (const marker of (Array.isArray(markers) ? markers : markers.markers || [])) {
      if (marker.level === 'error') validationErrors.push({ document:document._id, path:marker.path, message:marker.message });
    }
  }
  const plan = {
    projectId:PROJECT, dataset:DATASET, authenticatedAudit,
    existing, counts:documentCounts(source), candidateDocuments:source.length,
    uniqueImages:images.length, imagePlacements:slots.length, images,
    schemaHash:hash(schemaSource), validationErrors,
    documents:source.map(x=>({sourceKey:x._id,type:x._type,title:x.name || x.title || x._id, ...(x.price!==undefined?{price:x.price}:{} )})),
  };
  const engineHash = hash((await readFile(new URL('./seed-import.mjs', import.meta.url), 'utf8')) + (await readFile(new URL('./seed-plan.mjs', import.meta.url), 'utf8')));
  plan.engineHash = engineHash;
  plan.digest = hash({ source, slots, images, schemaHash:plan.schemaHash, engineHash, inventory:existing.documents, authenticatedAudit });
  plan.ready = authenticatedAudit && existing.documents.length === 0 && validationErrors.length === 0;
  await writeFile(join(output,'plan.json'),JSON.stringify(plan,null,2));
  await writeFile(join(output,'candidate-validation.ndjson'), candidate.map(x=>JSON.stringify(x)).join('\n')+'\n');
  const summary = `# Plan de importación Salitre\n\nProyecto: ${PROJECT} · Dataset: ${DATASET}\n\nAuditoría autenticada de borradores/publicados: ${authenticatedAudit}\nDocumentos existentes: ${existing.documents.length}\nCandidatos publicados (no borradores): ${source.length}\nFotos únicas: ${images.length} · colocaciones: ${slots.length}\nErrores de validación: ${validationErrors.length}\nListo para solicitar confirmación: ${plan.ready}\n\nHuella del plan: \`${plan.digest}\`\n\n${JSON.stringify(plan.counts,null,2)}\n\n${existing.documents.length ? 'BLOQUEADO: existen documentos; no se sobrescribe ni se importa parcialmente.' : 'Solo se crearán documentos si se confirma expresamente este plan.'}\n\nLos IDs ordinarios se asignarán al crear con Sanity; las referencias se resolverán con los IDs devueltos. Los assets de la validación aún no se han subido.\n`;
  await writeFile(join(output,'SUMMARY.md'),summary);
  if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY,summary,{flag:'a'});
  console.log(summary);
  if (mode === 'audit') {
    assert.equal(validationErrors.length,0,'Consulta plan.json: existen errores de datos/esquema');
    // Termina aquí: auditar nunca carga assets ni crea documentos.
  } else {
    assertImportAllowed(plan, process.env.SANITY_SEED_CONFIRMATION, process.env.SANITY_SEED_PLAN_DIGEST);
    const realAssets = new Map();
    for (const image of images) {
      if (image.reusedAsset) realAssets.set(image.source,image.reusedAsset);
      else {
        const asset = await client.assets.upload('image',buffers.get(image.source),{contentType:'image/jpeg',filename:`salitre-${image.sha256.slice(0,12)}.jpg`});
        realAssets.set(image.source,asset._id);created.assets.push(asset._id);await receipt({status:'uploading-images'});
      }
    }
    // Comprobación nueva justo antes de crear los documentos.
    const beforeWrite = await client.fetch('count(*[!(_type match "sanity.*")])');
    assert.equal(beforeWrite,0,'Han aparecido documentos desde la auditoría; se cancela sin sobrescribir');
    const categories = new Map();
    for (const original of source.filter(x=>x._type==='category')) {
      const { _id, ...document } = original;
      const saved = await client.create(document); // Sanity asigna el ID.
      categories.set(_id,saved._id);created.documents.push(saved._id);await receipt({status:'creating-categories'});
    }
    const documents = buildDocuments(source,slots,realAssets,categories).filter(x=>x._type!=='category');
    let tx = client.transaction();
    for (const original of documents) {
      const { _id, ...document } = original;
      tx = tx.create(SINGLETONS.includes(_id) ? original : document);
    }
    const result = await tx.commit({ returnDocuments:false });
    created.documents.push(...result.results.map(x=>x.id));
    await receipt({status:'created'});
    // Lectura real desde la misma capa que utiliza Astro, sin depender de mocks.
    const stdout = execFileSync('npm',['run','check:cms'],{cwd:frontend,encoding:'utf8',env:{...process.env,SANITY_PROJECT_ID:PROJECT,SANITY_DATASET:DATASET,SANITY_API_READ_TOKEN:token,SANITY_USE_MOCK:'false'}});
    assert.ok(stdout.includes('"renderedSource":"sanity"'),'Astro no confirma lectura desde CMS');
    console.log(stdout);
    execFileSync('npm',['run','build'],{cwd:frontend,stdio:'inherit',env:{...process.env,ASTRO_TELEMETRY_DISABLED:'1',SANITY_PROJECT_ID:PROJECT,SANITY_DATASET:DATASET,SANITY_API_READ_TOKEN:token,SANITY_USE_MOCK:'false'}});
    execFileSync('npm',['run','check:build'],{cwd:frontend,stdio:'inherit'});
    await receipt({status:'verified', publishedDocuments:created.documents.length});
    console.log('Importación y consumo real en Astro verificados. Comprueba los documentos en Studio y reconstruye Pages si no hay webhook.');
  }
} catch (error) {
  await receipt({ status:created.documents.length||created.assets.length?'partial-failure':'not-imported' });
  // No vuelca objetos del SDK ni cabeceras. Los detalles de validación se guardan sin credenciales.
  console.error(error instanceof Error && error.name === 'AssertionError' ? error.message : 'La preparación/importación falló. Revisa el resumen y el recibo; no se reintenta ni sobrescribe automáticamente.');
  process.exitCode = 1;
}
