import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertImportAllowed, CONFIRMATION, hash, buildDocuments, downloadUrl, jpegDimensions } from './seed-plan.mjs';
const digest = 'a'.repeat(64);
const valid = () => ({ digest, authenticatedAudit:true, existing:{documents:[]}, validationErrors:[], projectId:'hfa8zkyw', dataset:'production' });
test('sin confirmación expresa no se permite importar',()=>{
  assert.throws(()=>assertImportAllowed(valid(),undefined,digest));
  assert.throws(()=>assertImportAllowed(valid(),'sí',digest));
});
test('un plan modificado, sin auditoría de borradores o con datos existentes bloquea la importación',()=>{
  assert.throws(()=>assertImportAllowed(valid(),CONFIRMATION,'b'.repeat(64)));
  assert.throws(()=>assertImportAllowed({...valid(),authenticatedAudit:false},CONFIRMATION,digest));
  assert.throws(()=>assertImportAllowed({...valid(),existing:{documents:[{_id:'drafts.restaurant-settings'}]}},CONFIRMATION,digest));
  assert.throws(()=>assertImportAllowed({...valid(),validationErrors:[{message:'dato inválido'}]},CONFIRMATION,digest));
  assert.throws(()=>assertImportAllowed({...valid(),dataset:'otro'},CONFIRMATION,digest));
  assert.doesNotThrow(()=>assertImportAllowed(valid(),CONFIRMATION,digest));
});
test('referencias de platos e imágenes usan los IDs devueltos por Sanity',()=>{
  const source=[{_id:'dish-1',_type:'dish',category:{_type:'reference',_ref:'entrantes'}}];
  const slots=[{document:'dish-1',field:'image',image:{url:'https://images.unsplash.com/example',alt:'Plato'}}];
  const result=buildDocuments(source,slots,new Map([[slots[0].image.url,'image-returned-id']]),new Map([['entrantes','sanity-returned-category']]));
  assert.equal(result[0].category._ref,'sanity-returned-category');
  assert.equal(result[0].image.asset._ref,'image-returned-id');
  assert.equal(source[0].category._ref,'entrantes');
});
test('solo se descargan fuentes HTTPS conocidas y se rechazan imágenes inválidas',()=>{
  assert.throws(()=>downloadUrl('https://other.example/private'));
  assert.throws(()=>downloadUrl('http://images.unsplash.com/photo'));
  assert.throws(()=>jpegDimensions(Buffer.from('not an image')));
  assert.equal(new URL(downloadUrl('https://images.unsplash.com/photo?auto=format')).searchParams.get('fm'),'jpg');
  assert.notEqual(hash('a'),hash('b'));
});
