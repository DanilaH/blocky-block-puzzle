import {createServer} from 'vite';
export async function goalRuntime(){
  const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true},server:{middlewareMode:true}});
  try{
    const R=await server.ssrLoadModule('/src/core/rules.ts');
    const D=await server.ssrLoadModule('/src/core/goal-director.ts');
    const H=await server.ssrLoadModule('/src/core/rhythm.ts');
    const P=await server.ssrLoadModule('/scripts/difficulty/players.ts');
    const A=await server.ssrLoadModule('/scripts/difficulty/analyze.ts');
    return {server,R,D,H,P,A};
  }catch(error){await server.close();throw error;}
}
