import fs from 'node:fs/promises';
import {stripTypeScriptTypes} from 'node:module';
import {createServer} from 'vite';

export async function orderLoadRuntime(){
  let source=await fs.readFile('src/core/rules.ts','utf8');
  source=source.replace("from './order-director'","from 'virtual:guarded-director'")
    .replace(/from (["'])\.\/([^"']+)\1/g,'from "/src/core/$2"');
  const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true},server:{middlewareMode:true},plugins:[{
    name:'guarded-load-control',
    resolveId(id){if(id==='virtual:guarded-rules'||id==='virtual:guarded-director')return '\0'+id;},
    load(id){
      if(id==='\0virtual:guarded-rules')return stripTypeScriptTypes(source,{mode:'strip'});
      if(id==='\0virtual:guarded-director')return `import {orderDirectorDeal as generate,initialOrderDirector,observeOrderDirector} from '/src/core/order-director';
      export {initialOrderDirector,observeOrderDirector};
      export const orderDirectorDeal=(board,seed,moves,rhythm,saved)=>generate(board,seed,moves,rhythm,saved,{guardLoad:true});`;
    },
  }]});
  try{
    const R=await server.ssrLoadModule('/src/core/rules.ts');
    const G=await server.ssrLoadModule('virtual:guarded-rules');
    const D=await server.ssrLoadModule('/src/core/order-director.ts');
    const H=await server.ssrLoadModule('/src/core/rhythm.ts');
    const P=await server.ssrLoadModule('/scripts/difficulty/players.ts');
    const A=await server.ssrLoadModule('/scripts/difficulty/analyze.ts');
    return {server,R,G,D,H,P,A};
  }catch(error){await server.close();throw error;}
}
