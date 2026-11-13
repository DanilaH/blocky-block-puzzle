import sharp from 'sharp';
import fs from 'node:fs/promises';
// Offline palette variants of our own atlas. Preserve alpha and highlight geometry.
const colors=['#619de9','#eea8c5','#bda7e8','#edc566','#bce3e7','#ecedf5'];
await fs.mkdir('public/assets/theme-tiles',{recursive:true});
for(const material of ['plastic','enamel','chrome']) for(let i=0;i<colors.length;i++) {
 const {data,info}=await sharp(`public/assets/classic-tiles/${material}-5.webp`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const rgb=[1,3,5].map(n=>parseInt(colors[i].slice(n,n+2),16));
 for(let p=0;p<data.length;p+=4){
  const light=(data[p]*.2126+data[p+1]*.7152+data[p+2]*.0722)/120;
  for(let c=0;c<3;c++)data[p+c]=Math.round(Math.min(255,light<1?rgb[c]*light:rgb[c]+(255-rgb[c])*Math.min(1,(light-1)/.9)));
 }
 await sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).webp({quality:90,alphaQuality:100}).toFile(`public/assets/theme-tiles/${material}-${i+7}.webp`);
}
