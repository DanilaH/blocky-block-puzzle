import fs from 'node:fs/promises';
import sharp from 'sharp';
import {prepareImageAsset,validatePreparedImage} from '../tools/vendor/mini-games-kit/pipeline.ts';
import {trimTransparentWebp,inspectRuntimeImageBudget} from '../tools/vendor/mini-games-kit/runtime-images.ts';
const assets={};
for(const id of ['all-clear','series']) {
 const source=await fs.readFile(`assets-src/rewards/${id}.png`);
 const prepared=await prepareImageAsset(source,{canvas:320,padding:12,webpQuality:88,backgroundRemoval:'preserve'});
 const check=await validatePreparedImage(prepared.buffer,{canvas:320,minTransparentPadding:8});
 if(check.errors.length)throw Error(check.errors.join(', '));
 const trimmed=await trimTransparentWebp(prepared.buffer,{webpQuality:88,alphaThreshold:1,gutter:4,minPixelSavingRatio:.02,maxVisibleRgbMae:8,maxAlphaMae:1});
 await fs.writeFile(`public/assets/rewards/${id}.webp`,trimmed.buffer);
 const avif=await sharp(source).resize(320,320,{fit:'contain',background:'#00000000'}).avif({quality:65}).toBuffer();
 assets[id]={frame:trimmed.frame,bytes:trimmed.buffer.length,avifComparisonBytes:avif.length};
}
const budget=await inspectRuntimeImageBudget(Object.keys(assets).map(id=>({id,file:`public/assets/rewards/${id}.webp`,category:'session-required'})));
if(budget.encodedBytes>80000||budget.estimatedRgbaBytes>820000)throw Error('Reward budget exceeded');
await fs.writeFile('assets-src/rewards/manifest.json',JSON.stringify({assets,budget},null,2)+'\n');console.log({assets,budget});
