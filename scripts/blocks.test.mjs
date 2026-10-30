import {test} from 'node:test';
import assert from 'node:assert/strict';
import {blockNames,blockTypes,validLink} from '../schemaTypes/blocks.ts';

test('enlaces editoriales rechazan protocolos, URLs incompletas y destinos de red relativos',()=>{
 for(const value of ['/carta/','/eventos/#programa','https://example.com/reservar']) assert.equal(validLink(value),true,value);
 for(const value of ['//example.com','javascript:alert(1)','http://example.com','https://','data:text/html,test','/ruta con espacios',undefined]) assert.equal(validLink(value),false,String(value));
});

test('todos los bloques están registrados con nombre estable y campos editoriales únicos',()=>{
 assert.equal(blockNames.length,10);
 assert.deepEqual(blockTypes.map(t=>t.name),[...blockNames]);
 for(const block of blockTypes) {
  const fields=block.fields.map(f=>f.name);
  assert.equal(new Set(fields).size,fields.length,block.name);
  assert.ok(fields.includes('variant'),block.name);
  assert.ok(block.preview,block.name);
 }
});
