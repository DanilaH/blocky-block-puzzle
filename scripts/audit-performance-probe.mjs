// Bounded performance research. In-memory Vite transforms only; app sources untouched.
import { createServer, build, preview } from "vite";
import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { gzipSync } from "node:zlib";
const root = process.cwd();
const output = path.resolve(
  process.env.PROBE_OUTPUT || "docs/qa/performance-probe-047/screen.json",
);
const conditions = JSON.parse(
  process.env.PROBE_CONDITIONS ||
    '[{"kind":"allclear","units":0},{"kind":"allclear-no-theme","units":0},{"kind":"multi","units":0},{"kind":"theme","units":0},{"kind":"normal","units":0},{"kind":"idle","units":0}]',
);
const rounds = Number(process.env.PROBE_ROUNDS || 3),
  repeats = Number(process.env.PROBE_REPEATS || 2);
const fixtures = process.env.PROBE_FIXTURE_FILE
  ? JSON.parse(await fs.readFile(process.env.PROBE_FIXTURE_FILE, "utf8"))
  : null;
const production = process.env.PROBE_BUILD === "production",
  trace = process.env.PROBE_TRACE === "1";
const plugin = {
  name: "diagnostic-probe-only",
  enforce: "pre",
  transform(source, id) {
    if (id.split("?")[0] !== path.join(root, "src/main.ts")) return;
    if (
      !source.includes("  if (import.meta.hot)") ||
      !source.includes("const svg =")
    )
      throw Error("Probe injection anchor missing");
    let code = source.replace(
      "const svg =",
      `import {installProbe,attachRuntime} from '${path.join(root, "scripts/performance-probe/browser.mjs")}';\ninstallProbe({BoardScene});\nconst svg =`,
    );
    code = code.replace(
      "  function presentationTheme() {",
      "  function presentationTheme() {\n    if ((window as any).__probeOptions?.freezeTheme) return 0;",
    );
    code = code.replace(
      "const revealVariant = (store.state.wardrobe?.discoveries ?? 1) % 3;",
      "const revealVariant = (window as any).__probeOptions.revealVariant ?? ((store.state.wardrobe?.discoveries ?? 1) % 3);",
    );
    code = code.replace(
      '                presentReward(\n                  \"all-clear\",',
      '                (window as any).__perfProbe.mark(\"allclear-reveal\");\n                presentReward(\n                  \"all-clear\",',
    );
    code = code.replace(
      "  if (import.meta.hot)",
      `
  attachRuntime({scene,store,festival,atmosphere,
    state:()=>({game:store.state.game,wardrobe:store.state.wardrobe,shownTheme:presentationTheme()}),
    async reset(kind) {
      await store.waitIdle(); cancelDrag(); cancelHint(); stopPraise(); stopCosmetics();
      const g = {...newGame(1234,'probe-'+crypto.randomUUID(),'flow-v4'),moves:10,streak:5,scoringVersion:'festival-v4',seriesBonusVersion:1};
      g.tray=[{shapeId:'O3-0',color:2,used:false},{shapeId:'S1-0',color:3,used:false},{shapeId:'S1-0',color:4,used:false}];
      if (kind==='multi'||kind.startsWith('allclear')) {
        for(let y=0;y<8;y++)for(let x=0;x<8;x++)if((y<3&&x>=3)||(x<3&&y>=3))g.board[y*8+x]=(x+y)%6+1;
        if(kind==='multi')g.board[63]=3;
      } else {g.tray[0]={shapeId:'S1-0',color:2,used:false};}
      const fixture = (window as any).__probeOptions.fixtures?.[(window as any).__probeOptions.fixtureIndex];
      if(fixture) Object.assign(g,structuredClone(fixture.before),{gameId:'probe-'+crypto.randomUUID()});
      await store.update(p=>({...p,revision:p.revision+1,tutorialStep:4,game:g,progressionBest:100000,best:100000,festivalBest:100000,wardrobe:{selected:0,unlocked:[0],discoveries:1},settings:{...p.settings,calm:false,sound:false,haptics:false,musicVolume:0,effectsVolume:0}}),'probe-reset');
      scoreTarget=scoreShown=0; render(false);
    },
    async trigger(kind) {
      if(kind==='idle')return;
      if(kind==='theme') {await store.update(p=>({...p,revision:p.revision+1,wardrobe:{selected:5,unlocked:[0,5],discoveries:2}}),'probe-theme-only');render(true);return;}
      const fixture = (window as any).__probeOptions.fixtures?.[(window as any).__probeOptions.fixtureIndex];
      await commit(fixture?.move ?? {slot:0,x:0,y:0},currentGame().revision);
    }
  });
  if (import.meta.hot)`,
    );
    return code;
  },
};
let server, browser;
const results = [];
const manifest = {
  schemaVersion: 1,
  sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim(),
  runtimeSourceCommit:
    process.env.PROBE_RUNTIME_COMMIT ||
    "561e8c7196572203f138ad970076de47bc6827c9",
  fixtureFile: process.env.PROBE_FIXTURE_FILE || null,
  started: new Date().toISOString(),
  production,
  trace,
  rounds,
  repeats,
  conditions,
  measurement:
    "rAF, Phaser update/render submission CPU and GL call counters; not physical Android FPS",
  audio: "muted in every condition",
  input:
    "none unless explicit drag option; direct real commit for fixture placement",
};
const save = async () => {
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify({ manifest, results }, null, 2));
};
function stats(rows) {
  const values = rows.map((x) => x.ms).sort((a, b) => a - b);
  return {
    count: values.length,
    median: values[Math.floor(values.length * 0.5)] ?? null,
    p95: values[Math.floor(values.length * 0.95)] ?? null,
    max: values.at(-1) ?? null,
    total: values.reduce((a, b) => a + b, 0),
    over25: values.filter((x) => x > 25).length,
    over50: values.filter((x) => x > 50).length,
  };
}
try {
  await fs.mkdir(path.dirname(output), { recursive: true });
  if (production) {
    const outDir = path.join("/tmp", "blocky-probe-production");
    await build({
      root,
      plugins: [plugin],
      build: { outDir, emptyOutDir: true },
      logLevel: "warn",
    });
    server = await preview({
      root,
      build: { outDir },
      preview: { host: "127.0.0.1", port: 5194, strictPort: true },
    });
  } else {
    server = await createServer({
      root,
      plugins: [plugin],
      server: { host: "127.0.0.1", port: 5194, strictPort: true },
      logLevel: "warn",
    });
    await server.listen();
  }
  browser = await chromium.launch();
  manifest.browserVersion = browser.version();
  for (let round = 0; round < rounds; round++) {
    const order = round % 2 ? [...conditions].reverse() : conditions;
    for (const condition of order) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        ...(condition.androidUA
          ? {
              userAgent:
                "Mozilla/5.0 (Linux; Android 13; Pixel 6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36",
            }
          : {}),
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.addInitScript(
        (options) => {
          window.__probeOptions = options;
        },
        {
          ...condition,
          fixtures,
          freezeTheme: condition.kind === "allclear-no-theme",
          drag: !!condition.drag,
        },
      );
      await page.goto("http://127.0.0.1:5194");
      await page.waitForFunction(
        () =>
          window.__perfProbe?.runtime &&
          window.__perfProbe?.scene?.ink &&
          !document.querySelector("#app").inert,
      );
      const cdp = await context.newCDPSession(page);
      await cdp.send("Performance.enable");
      for (let repeat = 0; repeat < repeats; repeat++) {
        await page.evaluate(async (condition) => {
          const p = window.__perfProbe;
          await p.runtime.reset(condition.kind);
          const nodes = p.scene.game.renderer.renderNodes;
          if (condition.units)
            nodes.setMaxParallelTextureUnits(condition.units);
        }, condition);
        // Reset transitions finish outside the measurement. Context/GL pools survive.
        await page.waitForTimeout(2100);
        if (trace)
          await cdp.send("Tracing.start", {
            categories:
              "devtools.timeline,disabled-by-default-devtools.timeline,blink.user_timing,cc,gpu,viz,benchmark",
            transferMode: "ReturnAsStream",
          });
        const before = (await cdp.send("Performance.getMetrics")).metrics;
        const row = await page.evaluate(
          async ({ condition, duration }) =>
            window.__perfProbe.run(condition.kind, duration),
          { condition, duration: Number(process.env.PROBE_DURATION || 2200) },
        );
        const after = (await cdp.send("Performance.getMetrics")).metrics;
        row.condition = condition;
        row.round = round;
        row.repeat = repeat;
        row.cold = repeat === 0;
        row.errors = [...errors];
        row.summary = {
          raf: stats(row.raf),
          draw: stats(row.draws),
          renderSubmission: stats(row.renders),
          steps: stats(row.steps),
          maxDrawCallsPerRender: Math.max(
            0,
            ...row.renders.map(
              (x) => (x.calls.drawElements || 0) + (x.calls.drawArrays || 0),
            ),
          ),
        };
        row.metrics = Object.fromEntries(
          [
            "LayoutCount",
            "LayoutDuration",
            "RecalcStyleCount",
            "RecalcStyleDuration",
            "ScriptDuration",
            "TaskDuration",
          ].map((n) => [
            n,
            (after.find((m) => m.name === n)?.value || 0) -
              (before.find((m) => m.name === n)?.value || 0),
          ]),
        );
        if (errors.length) throw Error("Page errors: " + errors.join("; "));
        const humanFixture = fixtures?.[condition.fixtureIndex];
        if (humanFixture && row.final.game.score !== humanFixture.expectedScore)
          throw Error("Human fixture score mismatch");
        if (
          condition.kind !== "idle" &&
          condition.kind !== "theme" &&
          row.final.game.moves !==
            (fixtures?.[condition.fixtureIndex]?.before.moves ?? 10) + 1
        )
          throw Error("Fixture placement did not commit");
        if (
          condition.kind.startsWith("allclear") &&
          row.final.game.board.some(Boolean)
        )
          throw Error("Fixture did not clear board");
        if (condition.kind === "allclear" && row.final.shownTheme !== 5)
          throw Error("Theme was not revealed");
        if (
          condition.kind === "allclear-no-theme" &&
          row.final.shownTheme !== 0
        )
          throw Error("Theme freeze failed");
        if (trace) {
          const finished = new Promise((resolve) =>
            cdp.once("Tracing.tracingComplete", resolve),
          );
          await cdp.send("Tracing.end");
          const { stream } = await finished;
          let bytes = "";
          for (;;) {
            const part = await cdp.send("IO.read", { handle: stream });
            bytes += part.data;
            if (part.eof) break;
          }
          await cdp.send("IO.close", { handle: stream });
          const destination = output.replace(
            /\.json$/,
            `-${results.length}.trace.json.gz`,
          );
          await fs.writeFile(destination, gzipSync(bytes));
          row.traceFile = path.basename(destination);
          const t = JSON.parse(bytes).traceEvents;
          row.traceSummary = t
            .filter((e) => e.ph === "X" && e.dur)
            .sort((a, b) => b.dur - a.dur)
            .slice(0, 45)
            .map((e) => ({
              name: e.name,
              cat: e.cat,
              pid: e.pid,
              tid: e.tid,
              at: e.ts / 1000,
              ms: e.dur / 1000,
            }));
        }
        results.push(row);
        await save();
        console.log(
          JSON.stringify({
            condition,
            round,
            repeat,
            desktop: row.manifest.desktop,
            units: row.manifest.maxParallelTextureUnits,
            raf: row.summary.raf,
            gl: row.gl,
            maxDrawCallsPerRender: row.summary.maxDrawCallsPerRender,
            marks: row.marks.map((m) => ({
              name: m.name,
              at: Math.round(m.at - row.start),
            })),
          }),
        );
      }
      await context.close();
    }
  }
  manifest.completed = new Date().toISOString();
  await save();
} finally {
  await browser?.close();
  await server?.close();
}
