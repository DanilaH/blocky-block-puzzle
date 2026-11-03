import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {inspectRuntimeImageBudget,validateLogicalTrimFrame} from '../tools/vendor/mini-games-kit/runtime-images.ts';
const m=JSON.parse(await fs.readFile('src/game/vfx-manifest.json','utf8'));
for(const [id,a] of Object.entries(m.assets)) {
 const file=`public/assets/vfx/${id}.webp`, meta=await sharp(file).metadata();
 assert.equal(meta.format,'webp');assert.equal(meta.hasAlpha,true);
 assert(validateLogicalTrimFrame(a.frame));
 assert.equal(meta.width,a.frame.width);assert.equal(meta.height,a.frame.height);
 assert.equal((await fs.stat(file)).size,a.bytes);
 const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let visible=0,transparent=0;
 for(let y=0;y<info.height;y++)for(let x=0;x<info.width;x++) {
  const alpha=data[(y*info.width+x)*4+3];
  if(alpha>4)visible++;if(alpha===0)transparent++;
  if(x===0||y===0||x===info.width-1||y===info.height-1)assert(alpha<=4,`${id}: clipped alpha edge`);
 }
 assert(visible>100);assert(transparent>info.width*info.height*.03);
}
const budget=await inspectRuntimeImageBudget(Object.keys(m.assets).map(id=>({id,file:`public/assets/vfx/${id}.webp`,category:'session-required'})));
assert.deepEqual(budget,m.budget);assert(budget.encodedBytes<=100000);assert(budget.estimatedRgbaBytes<=2000000);
console.log('VFX alpha, trim frames, encoded / RGBA budgets OK:',budget);

// Selected production tiles: alpha survives, no cut edges, no unused study sets.
const tileNames = (await fs.readdir('public/assets/tile-study')).sort();
assert.deepEqual(tileNames, ['chrome','enamel','plastic'].flatMap(m=>Array.from({length:6},(_,i)=>`${m}-${i+1}.webp`)));
for (const name of tileNames) {
 const meta = await sharp(`public/assets/tile-study/${name}`).metadata();
 assert.equal(meta.width,128);assert.equal(meta.height,128);assert.equal(meta.hasAlpha,true);
 const {validatePreparedImage}=await import('../tools/vendor/mini-games-kit/pipeline.ts');
 const check=await validatePreparedImage(await fs.readFile(`public/assets/tile-study/${name}`),{canvas:128,minTransparentPadding:1});
 assert.deepEqual(check.errors,[]);
}
const tileBudget=await inspectRuntimeImageBudget(tileNames.map(id=>({id,file:`public/assets/tile-study/${id}`,category:id.split('-')[0]})));
assert(tileBudget.encodedBytes<100000);assert.equal(tileBudget.estimatedRgbaBytes,1179648);
console.log('Selected tile alpha and budgets OK:',tileBudget);

// Campaign assets: original generated masters, offline WebP, bounded decode cost.
const adventureNames=['cove','gem','key','locked','open'];
let advBytes=0,advRgba=0;
for(const name of adventureNames){
 const file=`public/adventure/${name}.webp`,m=await sharp(file).metadata();
 assert.equal(m.format,'webp');assert.equal(m.width,name==='cove'?960:128);assert.equal(m.height,m.width);
 advBytes+=(await fs.stat(file)).size;advRgba+=m.width*m.height*4;
 if(name!=='cove'){
  assert.equal(m.hasAlpha,true);
  const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  let transparent=0;for(let i=3;i<data.length;i+=4)if(data[i]===0)transparent++;
  assert(transparent>info.width*info.height*.03);
 }
}
assert(advBytes<300000);assert(advRgba<4000000);
console.log('Campaign encoded / RGBA bytes:',advBytes,advRgba);

// Classic has its own atlas; campaign deliberately retains the original material.
const classicNames=(await fs.readdir('public/assets/classic-tiles')).sort();
assert.deepEqual(classicNames,tileNames);
for(const name of classicNames){
 const file=`public/assets/classic-tiles/${name}`,meta=await sharp(file).metadata();
 assert.equal(meta.width,128);assert.equal(meta.height,128);assert.equal(meta.hasAlpha,true);
 const {validatePreparedImage}=await import('../tools/vendor/mini-games-kit/pipeline.ts');
 const result=await validatePreparedImage(await fs.readFile(file),{canvas:128,minTransparentPadding:1});
 assert.deepEqual(result.errors,[],name);
}
const classicBudget=await inspectRuntimeImageBudget(classicNames.map(name=>({id:name.replace('.webp',''),file:`public/assets/classic-tiles/${name}`,category:name.split('-')[0]})));
assert.deepEqual(classicBudget,JSON.parse(await fs.readFile('assets-src/classic-tiles/budget.json','utf8')));
assert(classicBudget.encodedBytes<=100000);assert(classicBudget.estimatedRgbaBytes<=1200000);
console.log('Classic tile alpha / budget OK:',classicBudget);
