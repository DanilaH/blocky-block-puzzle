import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const root=new URL('../docs/qa/usability-0.13/',import.meta.url).pathname;
const b=await chromium.launch(),p=await b.newPage({viewport:{width:390,height:844}});
await p.goto('http://127.0.0.1:5185');await p.locator('#lesson-skip').click();await p.screenshot({path:root+'hint-introduction.png'});
for(let i=0;i<3;i++){const r=await p.locator('.piece').first().boundingBox();await p.mouse.move(r.x+r.width/2,r.y+r.height/2);await p.mouse.down();await p.mouse.move(2,2,{steps:5});await p.mouse.up();await p.waitForTimeout(180);}
await p.screenshot({path:root+'tap-help.png'});
await p.setViewportSize({width:568,height:320});await p.screenshot({path:root+'tap-help-landscape.png'});
const text=await p.locator('#toast').evaluate(e=>({text:e.textContent,width:e.clientWidth,height:e.clientHeight,scrollHeight:e.scrollHeight}));
await fs.writeFile(root+'help-geometry.json',JSON.stringify(text,null,2));
await p.locator('#pause').click();await p.locator('#rules').click();await p.screenshot({path:root+'rules-landscape.png'});await b.close();console.log(text);
