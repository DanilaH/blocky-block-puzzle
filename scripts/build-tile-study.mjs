import fs from 'node:fs/promises';
import sharp from 'sharp';
import {prepareImageAsset,validatePreparedImage} from '../tools/vendor/mini-games-kit/pipeline.ts';
import {inspectRuntimeImageBudget} from '../tools/vendor/mini-games-kit/runtime-images.ts';
const rows=[];
for(const style of ['plastic','enamel','caramel']) {
 const input=`assets-src/tile-study/${style}.png`,m=await sharp(input).metadata();
 const width=m.width/3,height=m.height/2;
 if(!Number.isInteger(width)||!Number.isInteger(height))throw Error('Nonintegral atlas cells');
 for(let i=0;i<6;i++) {
  const crop=await sharp(input).extract({left:i%3*width,top:Math.floor(i/3)*height,width,height}).png().toBuffer();
  const p=await prepareImageAsset(crop,{canvas:128,padding:4,webpQuality:90,backgroundRemoval:'preserve'});
  const check=await validatePreparedImage(p.buffer,{canvas:128,minTransparentPadding:3});
  if(check.errors.length)throw Error(style+': '+check.errors.join(','));
  // Only 4px canonical gutters; physical trim offers little saving and would
  // complicate identical board/DOM pivots. Preserve 128x128 canvas intentionally.
  const file=`public/assets/tile-study/${style}-${i+1}.webp`;
  await fs.writeFile(file,p.buffer);rows.push({id:`${style}-${i+1}`,file,category:style});
 }
}
const budget=await inspectRuntimeImageBudget(rows);
if(budget.encodedBytes>160000)throw Error('Study budget exceeded');
await fs.writeFile('assets-src/tile-study/budget.json',JSON.stringify(budget,null,2)+'\n');
console.log(budget);
