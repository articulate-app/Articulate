import * as esbuild from "esbuild"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outdir = path.join(__dirname, "dist")

const watch = process.argv.includes("--watch")
const production = process.argv.includes("--production")

const prodUrl =
  process.env.ARTICULATE_DESKTOP_PROD_URL?.trim() ||
  "https://app.whyarticulate.com/auth"

if (production && /localhost|127\.0\.0\.1/i.test(prodUrl)) {
  console.error(
    "[desktop] Refusing production build with localhost ARTICULATE_DESKTOP_PROD_URL:",
    prodUrl,
  )
  process.exit(1)
}

/** @type {import('esbuild').BuildOptions} */
const shared = {
  bundle: true,
  platform: "node",
  target: "node20",
  sourcemap: production ? false : true,
  minify: production,
  external: ["electron"],
  logLevel: "info",
  define: {
    __ARTICULATE_DESKTOP_PROD_URL__: JSON.stringify(prodUrl),
  },
}

async function build() {
  fs.mkdirSync(outdir, { recursive: true })

  // Sync Desktop version from package.json into config at build time when possible.
  // (config.ts also hardcodes DESKTOP_VERSION for runtime — keep them aligned.)

  const mainCtx = await esbuild.context({
    ...shared,
    entryPoints: [path.join(__dirname, "main.ts")],
    outfile: path.join(outdir, "main.js"),
    format: "cjs",
  })

  const preloadCtx = await esbuild.context({
    ...shared,
    entryPoints: [path.join(__dirname, "preload.ts")],
    outfile: path.join(outdir, "preload.js"),
    format: "cjs",
  })

  if (watch) {
    await Promise.all([mainCtx.watch(), preloadCtx.watch()])
    console.log("[desktop] watching…")
  } else {
    await Promise.all([mainCtx.rebuild(), preloadCtx.rebuild()])
    await mainCtx.dispose()
    await preloadCtx.dispose()
    console.log(
      `[desktop] build complete → desktop/dist` +
        (production ? ` (production url=${prodUrl})` : " (dev)"),
    )
  }
}

build().catch((err) => {
  console.error(err)
  process.exit(1)
})
