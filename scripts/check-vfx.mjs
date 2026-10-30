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
