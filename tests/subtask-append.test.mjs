import assert from 'node:assert/strict';
import test from 'node:test';
import { appendSuggestedSubTasks } from '../app/subtask-append.ts';
const task = (title, id='existing') => ({id,title,sortOrder:7000,createdAt:'old',updatedAt:'old',completedAt:'done'});
test('append preserves existing data, creates local IDs/time and ordered incomplete children', () => {
 const old=[task('existing')]; let id=0;
 const result=appendSuggestedSubTasks(old,['new','next'],()=>`new-${++id}`,'now');
 assert.equal(result[0],old[0]); assert.equal(old.length,1);
 assert.deepEqual(result.slice(1), [
 {id:'new-1',title:'new',sortOrder:8000,createdAt:'now',updatedAt:'now',completedAt:''},
 {id:'new-2',title:'next',sortOrder:9000,createdAt:'now',updatedAt:'now',completedAt:''},
 ]);
});
test('append revalidates duplicates, title lengths and latest available slots',()=>{
 const old=Array.from({length:99},(_,i)=>task(`item${i}`,`${i}`));
 const result=appendSuggestedSubTasks(old,['ＩＴＥＭ０',' ', 'x'.repeat(161), 'new','other'],()=> 'new','now');
 assert.equal(result.length,100); assert.equal(result[99].title,'new');
 assert.equal(appendSuggestedSubTasks(result,['more'],()=> 'unused').length,100);
});
test('append caps batch at eight and normalizes whitespace / width / case',()=>{
 const result=appendSuggestedSubTasks([task('Ａ  b')],['a b',' A B ','new','NEW','n2','n3','n4','n5','ignored'],()=> 'id');
 assert.deepEqual(result.map(x=>x.title),['Ａ  b','new','n2','n3','n4','n5']);
});
