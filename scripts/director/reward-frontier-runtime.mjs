import fs from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {createServer} from 'vite';
import {rewardFrontierSource} from './reward-frontier-source.mjs';

export async function frontierRuntime() {
  const source = rewardFrontierSource(await fs.readFile('src/core/flow-dealer.ts','utf8'));
  const server = await createServer({configFile:false,optimizeDeps:{noDiscovery:true},server:{middlewareMode:true},plugins:[{
    name:'offline-reward-frontier',
    resolveId(id) {if(id==='virtual:reward-frontier')return '\0reward-frontier';},
    load(id) {if(id==='\0reward-frontier')return stripTypeScriptTypes(source,{mode:'strip'});},
  }]});
  try {
    const R=await server.ssrLoadModule('/src/core/rules.ts');
    const F=await server.ssrLoadModule('/src/core/flow-dealer.ts');
    const N=await server.ssrLoadModule('virtual:reward-frontier');
    const H=await server.ssrLoadModule('/src/core/rhythm.ts');
    const P=await server.ssrLoadModule('/scripts/difficulty/players.ts');
    return {server,R,F,N,H,P};
  } catch(error) {await server.close();throw error;}
}
