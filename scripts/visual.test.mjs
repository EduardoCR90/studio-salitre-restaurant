import {test} from 'node:test';
import assert from 'node:assert/strict';
import {storedThemeSchema,themePresets,presetNames,variantsForBlock} from '../schemaTypes/visual.ts';
import {blockTypes} from '../schemaTypes/blocks.ts';
import {theme} from '../schemaTypes/restaurant.ts';
test('Studio and the portable backend/rendering contract expose the same optional visual model',()=>{
 assert.deepEqual(storedThemeSchema.parse({preset:'modern'}),{preset:'modern'});
 assert.deepEqual(theme.fields.find(f=>f.name==='preset').options.list.map(item=>item.value),presetNames);
 for(const preset of presetNames)assert.equal(storedThemeSchema.safeParse(themePresets[preset]).success,true);
 assert.equal(storedThemeSchema.safeParse({paper:'red;display:none'}).success,false);
 for(const block of blockTypes){assert.equal(block.fields.find(f=>f.name==='enabled').type,'boolean');assert.deepEqual(block.fields.find(f=>f.name==='variant').options.list.map(item=>item.value),variantsForBlock(block.name));}
});
