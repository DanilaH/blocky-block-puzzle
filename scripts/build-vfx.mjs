import fs from 'node:fs/promises';
import sharp from 'sharp';
import {prepareImageAsset,validatePreparedImage} from '../tools/vendor/mini-games-kit/pipeline.ts';
import {trimTransparentWebp,inspectRuntimeImageBudget} from '../tools/vendor/mini-games-kit/runtime-images.ts';
const root='public/assets/vfx/';
await fs.mkdir(root,{recursive:true});
const assets={}, comparisons=[];
for(const [id,canvas] of [['flash',192],['streak',512],['chip',96],['ring',512]]) {
  // Always rebuild from pristine RGBA masters, never repeatedly encode runtime output.
  const source=await fs.readFile(`assets-src/vfx/${id}.png`);
  const prepared=await prepareImageAsset(source,{canvas,padding:8,webpQuality:88,backgroundRemoval:'preserve'});
  const validation=await validatePreparedImage(prepared.buffer,{canvas,minTransparentPadding:4});
  if(validation.errors.length)throw new Error(id+': '+validation.errors.join(', '));
  const trim=await trimTransparentWebp(prepared.buffer,{webpQuality:88,alphaThreshold:1,gutter:3,minPixelSavingRatio:0.02,maxVisibleRgbMae:8,maxAlphaMae:1});
  const frame=trim.frame??{logicalWidth:canvas,logicalHeight:canvas,x:0,y:0,width:canvas,height:canvas};
  await fs.writeFile(root+id+'.webp',trim.buffer);
  // Codec comparison only; WebP candidate is explicitly recorded as source.
  const avif=await sharp(trim.buffer).avif({quality:65,effort:6}).toBuffer();
  comparisons.push({id,webp:trim.buffer.length,avif:avif.length,avifProvenance:'WebP candidate; comparison only, not shipped',sourceBytes:source.length});
  assets[id]={frame,bytes:trim.buffer.length};
}
const budget=await inspectRuntimeImageBudget(Object.keys(assets).map(id=>({id,file:root+id+'.webp',category:'session-required'})));
if(budget.encodedBytes>100000||budget.estimatedRgbaBytes>2000000)throw new Error('VFX budget exceeded');
await fs.writeFile('src/game/vfx-manifest.json',JSON.stringify({version:1,assets,budget},null,2)+'\n');
await fs.writeFile('assets-src/vfx/codec-report.json',JSON.stringify(comparisons,null,2)+'\n');
console.log(JSON.stringify({assets,budget,comparisons},null,2));
