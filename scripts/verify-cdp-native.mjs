import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "vite";
import { chromium } from "@playwright/test";
const root = fileURLToPath(new URL("..", import.meta.url));
const cache = await fs.mkdtemp(path.join(os.tmpdir(), "blocky-cdp-check-"));
const jar = process.env.BLOCKY_JSON_JAR || path.join(cache, "json.jar");
if (!process.env.BLOCKY_JSON_JAR)
  execFileSync("curl", [
    "-fLsS",
    "--max-time",
    "30",
    "https://repo.maven.apache.org/maven2/org/json/json/20240303/json-20240303.jar",
    "-o",
    jar,
  ]);
if (
  createHash("sha256")
    .update(await fs.readFile(jar))
    .digest("hex") !==
  "3cf6cd6892e32e2b4c1c39e0f52f5248a2f5b37646fdfbb79a66b46b618414ed"
)
  throw Error("JSON dependency checksum mismatch");
const classes = path.join(cache, "classes");
await fs.mkdir(classes);
const source = path.join(
  root,
  "android/app/src/main/java/com/danilah/blocky/dev/cdp",
);
const files = (await fs.readdir(source))
  .filter((x) => x.endsWith(".java"))
  .map((x) => path.join(source, x));
files.push(
  path.join(
    root,
    "android/app/src/test/java/com/danilah/blocky/dev/cdp/CdpHarness.java",
  ),
);
const compile = ["-proc:none", "-cp", jar, "-d", classes, ...files];
if (process.env.BLOCKY_ECJ_JAR)
  execFileSync(
    "java",
    ["-jar", process.env.BLOCKY_ECJ_JAR, "-17", ...compile],
    { stdio: "inherit" },
  );
else
  execFileSync("javac", ["--release", "17", ...compile], { stdio: "inherit" });
const output =
  process.env.BLOCKY_CDP_OUTPUT || path.join(root, "artifacts/native-cdp");
await fs.mkdir(output, { recursive: true });
const server = await createServer({
  server: { host: "127.0.0.1", port: 5197, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({
  args: ["--remote-debugging-port=9224"],
});
try {
  const page = await browser.newPage({ viewport: { width: 392, height: 872 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://localhost:5197/?clearTrace=full");
  await page.waitForSelector("#full-start:enabled");
  for (const mode of ["preflight", "clear"]) {
    const text = await new Promise((resolve, reject) => {
      let stdout = "";
      const p = spawn("java", [
        "-cp",
        classes + path.delimiter + jar,
        "com.danilah.blocky.dev.cdp.CdpHarness",
        "9224",
        path.join(output, mode),
        mode,
      ]);
      p.stdout.on("data", (x) => (stdout += x));
      p.stderr.pipe(process.stderr);
      p.on("exit", (c) =>
        c === 0 ? resolve(stdout) : reject(Error("Native CDP exit " + c)),
      );
    });
    const proof = JSON.parse(text.trim());
    await fs.writeFile(
      path.join(output, mode + "-proof.json"),
      JSON.stringify(
        {
          environment:
            "Linux Chromium; Java client used by Android. Transport/attribution functionality only.",
          proof,
          errors,
        },
        null,
        2,
      ) + "\n",
    );
    if (errors.length) throw Error(errors.join("\n"));
    console.log(JSON.stringify({ mode, ...proof }));
  }
} finally {
  await browser.close();
  await server.close();
}
