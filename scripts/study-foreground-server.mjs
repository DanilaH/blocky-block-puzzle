import { createServer } from "vite";
import assert from "node:assert/strict";
const once = (code, anchor, value) => {
  assert.equal(code.split(anchor).length, 2, anchor);
  return code.replace(anchor, value);
};
export async function foregroundServer(port = 5199) {
  const server = await createServer({
    cacheDir: "/tmp/blocky-foreground-study-" + port,
    plugins: [
      {
        name: "foreground-study-only",
        enforce: "pre",
        transform(code, id) {
          if (id.split("?")[0].endsWith("/src/game/festival.ts")) {
            code = once(
              code,
              "  private syncViewport() {",
              `  studyPaint?: (g: CanvasRenderingContext2D, now: number) => boolean;
  studyStop?: () => void;
  studyWake(){this.syncViewport();if(!this.frame){this.last=performance.now();this.frame=visualClock.add(t=>this.draw(t));}}
  private syncViewport() {`,
            );
            code = once(
              code,
              "Math.min(1.5, devicePixelRatio)",
              `Math.min(new URLSearchParams(location.search).get('studyPixels')==='native'&&new URLSearchParams(location.search).get('studyRenderer')!=='webgl'?3:1.5,devicePixelRatio)`,
            );
            code = once(
              code,
              "    g.clearRect(0, 0, this.width, this.height);\n    let live",
              "    g.clearRect(0, 0, this.width, this.height);\n    const studyActive=this.studyPaint?.(g,now)??false;\n    let live",
            );
            code = once(
              code,
              "    if (!this.sparks.length && !this.reveals.length) {",
              "    if (!this.sparks.length && !this.reveals.length && !studyActive) {",
            );
            code = once(
              code,
              "  stop() {",
              "  stop() {\n    this.studyStop?.();",
            );
            return code;
          }
          if (!id.split("?")[0].endsWith("/src/main.ts")) return;
          code = once(
            code,
            "import { presentScoreGlow }",
            'import {CanvasForegroundStudy} from "./diagnostics/studies/canvas-foreground";\nimport {presentScoreGlow,setDiagnosticScoreGlow}',
          );
          code = once(
            code,
            '  const rewardAnchor = document.createElement("div");',
            `  setDiagnosticScoreGlow('legacy');
  const studyParams=new URLSearchParams(location.search), studyVariant=studyParams.get('foregroundStudy');
  const foregroundStudy=new CanvasForegroundStudy(festival,['rewards','both'].includes(studyVariant||''),studyParams.get('studyPixels')==='native',['theme','both'].includes(studyVariant||''));
  (window as any).__foregroundPresent=(tier:string,praise:string,points:number)=>{const original=window.setTimeout;window.setTimeout=(()=>0) as any;try{presentReward(tier,praise,points,{x:50,y:48},0,10);}finally{window.setTimeout=original;}};
  (window as any).__foregroundInk=(value:string)=>{
    foregroundStudy.beforeTheme(5,true);document.documentElement.style.setProperty('--world-ink',THEMES[5]!.ink);document.documentElement.dataset.material=THEMES[5]!.material;foregroundStudy.afterTheme();foregroundStudy.setText(el('score'),value);
    el('score').animate([{textShadow:'0 0 18px #8edaff'},{textShadow:'0 2px 2px #00000026'}],{duration:600,easing:'cubic-bezier(.2,.8,.25,1)'});
    el('score').animate([{transform:'scale(1)'},{transform:'scale(1.12)',offset:.3},{transform:'scale(1)'}],{duration:260,easing:'cubic-bezier(.2,.8,.25,1)'});
  };
  const rewardAnchor = document.createElement("div");`,
          );
          code = once(
            code,
            "    const a = target.animate(frames, {",
            "    const a = foregroundStudy.animate(target,frames,duration,delay) ?? target.animate(frames, {",
          );
          code = once(
            code,
            "      node.remove();\n      rewards.delete(node);",
            "      foregroundStudy.remove(node);\n      node.remove();\n      rewards.delete(node);",
          );
          const end = "    timerIds.push(window.setTimeout(finish, duration));";
          code = once(code, end, end + "\n    foregroundStudy.capture(node);");
          code = once(
            code,
            "    later(() => node.remove(), duration);",
            "    later(() => node.remove(), duration);\n    foregroundStudy.capture(node);",
          );
          code = once(
            code,
            "        diagnosticRewardDom = 0;",
            "        diagnosticRewardDom = 0;\n        foregroundStudy.beginSample();",
          );
          const theme =
            "    atmosphere.set(THEMES[nextTheme]!.at, running, scene.calm);";
          code = once(
            code,
            theme,
            "    foregroundStudy.beforeTheme(nextTheme,running && !scene.calm);\n" +
              theme +
              "\n    foregroundStudy.afterTheme();",
          );
          code = once(
            code,
            'el("score").textContent = Math.round(n).toLocaleString("ru");',
            'foregroundStudy.setText(el("score"),Math.round(n).toLocaleString("ru"));',
          );
          const best =
            /el\("best"\)\.textContent = (Math\.max\([\s\S]*?\)\.toLocaleString\("ru"\));/;
          assert(best.test(code));
          code = code.replace(best, 'foregroundStudy.setText(el("best"),$1);');
          return code;
        },
      },
    ],
    server: { host: "127.0.0.1", port, strictPort: true },
  });
  await server.listen();
  return server;
}
