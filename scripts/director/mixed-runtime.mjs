import {createServer} from 'vite';
export async function mixedRuntime(){
 const server=await createServer({configFile:false,optimizeDeps:{noDiscovery:true},server:{middlewareMode:true}});
 try{
  const R=await server.ssrLoadModule('/src/core/rules.ts'),D=await server.ssrLoadModule('/src/core/mixed-director.ts'),H=await server.ssrLoadModule('/src/core/rhythm.ts');
  const P=await server.ssrLoadModule('/scripts/difficulty/players.ts'),A=await server.ssrLoadModule('/scripts/difficulty/analyze.ts');
  const MP=await server.ssrLoadModule('/scripts/director/mixed-players.ts');
  const V=await server.ssrLoadModule('/scripts/director/verify-mixed-deal.ts');
  return {server,R,D,H,P,A,MP,V};
 }catch(error){await server.close();throw error;}
}
