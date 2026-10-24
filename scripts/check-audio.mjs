// Run with Vite on 5173. Captures actual Web Audio output, without phone-quality claims.
import {chromium} from 'playwright-core';
import fs from 'node:fs';
const browser=await chromium.launch();const page=await browser.newPage();
await page.goto('http://127.0.0.1:5173');
const result=await page.evaluate(async()=>{
 const {GameAudio}=await import('/src/game/audio.ts');const audio=new GameAudio();await audio.unlock();
 const c=audio.context,analyser=c.createAnalyser(),destination=c.createMediaStreamDestination();
 analyser.fftSize=2048;audio.master.connect(analyser);audio.master.connect(destination);
 const recorder=new MediaRecorder(destination.stream);const chunks=[];recorder.ondataavailable=e=>chunks.push(e.data);recorder.start();
 const metrics=[];const samples=new Float32Array(analyser.fftSize);
 for(const kind of ['pick','place','place','place','cancel','clear','combo','mega','record','allClear']){
  audio.play(kind,2);let peak=0,voices=0;
  for(let i=0;i<30;i++){await new Promise(r=>setTimeout(r,20));analyser.getFloatTimeDomainData(samples);for(const s of samples)peak=Math.max(peak,Math.abs(s));voices=Math.max(voices,audio.voices.size);}
  metrics.push({kind,peak,voices});
 }
 const stopped=new Promise(r=>recorder.onstop=r);recorder.stop();await stopped;audio.stop();await new Promise(r=>setTimeout(r,30));
 const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());let binary='';for(const b of bytes)binary+=String.fromCharCode(b);
 return {metrics,stoppedVoices:audio.voices.size,state:c.state,base64:btoa(binary)};
});
fs.writeFileSync('docs/qa/sfx-preview-0.3.webm',Buffer.from(result.base64,'base64'));delete result.base64;
fs.writeFileSync('docs/qa/audio-0.3.json',JSON.stringify(result,null,2));console.log(result);await browser.close();
if(result.metrics.some(x=>x.peak===0||x.peak>=1||x.voices>6)||result.stoppedVoices!==0)process.exit(1);
