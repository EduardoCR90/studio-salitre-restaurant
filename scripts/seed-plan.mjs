import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

export const PROJECT = 'hfa8zkyw';
export const DATASET = 'production';
export const TYPES = ['settings', 'story', 'gallery', 'page', 'category', 'dish'];
export const SINGLETONS = ['restaurant-settings', 'restaurant-story', 'restaurant-gallery'];
export const CONFIRMATION = 'CONFIRMAR IMPORTACION SALITRE';
export const hash = value => createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value)).digest('hex');

export function imageSlots(mock) {
  return [
    ...mock.pages.filter(x => x.image).map(x => ({ document: `page-${x.slug}`, field: 'image', image: x.image })),
    ...mock.dishes.filter(x => x.image).map(x => ({ document: `dish-${x._id}`, field: 'image', image: x.image })),
    ...(mock.story.image ? [{ document: 'restaurant-story', field: 'image', image: mock.story.image }] : []),
    ...mock.gallery.map((image, i) => ({ document: 'restaurant-gallery', field: 'images', key: `gallery-${i}`, image })),
  ];
}

export function downloadUrl(source) {
  const url = new URL(source);
  assert.equal(url.origin, 'https://images.unsplash.com', 'Solo se descargan las fotos demo conocidas');
  url.searchParams.delete('auto');
  url.searchParams.set('fm', 'jpg');
  url.searchParams.set('fit', 'max');
  url.searchParams.set('w', '2000');
  return url.href;
}

export function jpegDimensions(bytes) {
  assert.ok(bytes[0] === 255 && bytes[1] === 216, 'La imagen no es JPEG');
  for (let i = 2; i + 8 < bytes.length;) {
    assert.equal(bytes[i], 255, 'JPEG con marcador inválido');
    while (bytes[i] === 255) i++;
    const marker = bytes[i++];
    if (marker === 217 || marker === 218) break;
    const size = bytes.readUInt16BE(i);
    assert.ok(size >= 2 && i + size <= bytes.length, 'JPEG truncado');
    if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
      return { width: bytes.readUInt16BE(i + 5), height: bytes.readUInt16BE(i + 3) };
    }
    i += size;
  }
  throw new Error('No se encontraron dimensiones JPEG');
}

export function documentCounts(documents) {
  return Object.fromEntries(TYPES.map(type => [type, documents.filter(x => x._type === type).length]));
}

export function assertPlanStructure(documents) {
  const ids = new Set(documents.map(x => x._id));
  assert.equal(ids.size, documents.length, 'Claves de origen duplicadas');
  assert.deepEqual(documentCounts(documents), { settings:1, story:1, gallery:1, page:4, category:4, dish:11 });
  for (const id of SINGLETONS) assert.ok(ids.has(id), `Singleton ausente: ${id}`);
  assert.deepEqual(documents.filter(x=>x._type==='page').map(x=>x.slug.current).sort(), ['carta','inicio','reservas','restaurante']);
  const categories = new Set(documents.filter(x=>x._type==='category').map(x=>x._id));
  for (const dish of documents.filter(x=>x._type==='dish')) {
    assert.ok(categories.has(dish.category?._ref), `Referencia inválida: ${dish.name}`);
    assert.ok(Number.isFinite(dish.price) && dish.price >= 0, `Precio inválido: ${dish.name}`);
  }
}

export function buildDocuments(source, slots, assets, categoryIds = new Map()) {
  const documents = structuredClone(source);
  for (const document of documents) {
    if (document.seo) document.seo = { _type: 'seo', ...document.seo };
    if (document._type === 'dish' && categoryIds.size) {
      document.category._ref = categoryIds.get(document.category._ref);
      assert.ok(document.category._ref, 'No se obtuvo el ID real de la categoría');
    }
    for (const slot of slots.filter(x => x.document === document._id)) {
      const assetId = assets.get(slot.image.url);
      assert.ok(assetId, `Falta asset: ${slot.image.alt}`);
      const image = { _type:'editorialImage', asset:{ _type:'reference', _ref:assetId }, alt:slot.image.alt };
      if (slot.field === 'images') document.images.push({ ...image, _key:slot.key });
      else document[slot.field] = image;
    }
  }
  return documents;
}

export function assertImportAllowed(plan, confirmation, expectedDigest) {
  assert.equal(confirmation, CONFIRMATION, 'Falta confirmación expresa: no se escribe en Sanity');
  assert.match(expectedDigest || '', /^[a-f0-9]{64}$/, 'Falta la huella del plan aprobado');
  assert.equal(plan.digest, expectedDigest, 'El plan ha cambiado: revisa y confirma una nueva auditoría');
  assert.equal(plan.authenticatedAudit, true, 'Se requiere auditar también borradores con autenticación');
  assert.equal(plan.existing.documents.length, 0, 'Hay documentos existentes: importación inicial bloqueada');
  assert.equal(plan.validationErrors.length, 0, 'Hay errores de validación');
  assert.equal(plan.projectId, PROJECT);
  assert.equal(plan.dataset, DATASET);
}
