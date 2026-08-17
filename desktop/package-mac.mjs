/**
 * Package Articulate Desktop for macOS via electron-builder.
 *
 * Stages a clean app directory containing ONLY the Electron shell
 * (no Next.js app, no web node_modules, no secrets).
 *
 * Usage:
 *   node desktop/package-mac.mjs --publish never
 *   node desktop/package-mac.mjs --publish always
 *
 * Signing (optional for local verification):
 *   CSC_LINK=/path/to/DeveloperID.p12
 *   CSC_KEY_PASSWORD=...
 *   APPLE_API_KEY=/path/to/AuthKey_XXX.p8
 *   APPLE_API_KEY_ID=...
 *   APPLE_API_ISSUER=...
 *   APPLE_TEAM_ID=...
 */

import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, "..")
const stageDir = path.join(__dirname, ".stage")
const desktopPkg = JSON.parse(
  fs.readFileSync(path.join(__dirname, "package.json"), "utf8"),
)

const publishIdx = process.argv.findIndex(
  (a) => a === "--publish" || a.startsWith("--publish="),
)
let publishMode = "never"
if (publishIdx >= 0) {
  const arg = process.argv[publishIdx]
  if (arg.startsWith("--publish=")) {
    publishMode = arg.split("=")[1] === "always" ? "always" : "never"
  } else {
    publishMode = process.argv[publishIdx + 1] === "always" ? "always" : "never"
  }
}
const isRelease = publishMode === "always"
const hasSigningCreds = Boolean(process.env.CSC_LINK || process.env.CSC_NAME)

function rmrf(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name)
    const to = path.join(dest, entry.name)
    if (entry.isDirectory()) copyDir(from, to)
    else fs.copyFileSync(from, to)
  }
}

// Clean stage
rmrf(stageDir)
fs.mkdirSync(stageDir, { recursive: true })

const stagedPkg = {
  name: "articulate-desktop",
  productName: "Articulate",
  version: desktopPkg.version,
  description: desktopPkg.description,
  author: desktopPkg.author,
  license: desktopPkg.license,
  private: true,
  main: "dist/main.js",
  homepage: desktopPkg.homepage,
  dependencies: {},
}
fs.writeFileSync(path.join(stageDir, "package.json"), JSON.stringify(stagedPkg, null, 2))

copyDir(path.join(__dirname, "dist"), path.join(stageDir, "dist"))
copyDir(path.join(__dirname, "resources"), path.join(stageDir, "resources"))

// Entitlements + icon must live inside projectDir so codesign can resolve them.
const stageBuild = path.join(stageDir, "build")
fs.mkdirSync(stageBuild, { recursive: true })
fs.copyFileSync(
  path.join(__dirname, "build", "icon.icns"),
  path.join(stageBuild, "icon.icns"),
)
fs.copyFileSync(
  path.join(__dirname, "build", "entitlements.mac.plist"),
  path.join(stageBuild, "entitlements.mac.plist"),
)

const stageModules = path.join(stageDir, "node_modules")
fs.mkdirSync(stageModules, { recursive: true })
const electronSrc = path.join(root, "node_modules", "electron")
const electronLink = path.join(stageModules, "electron")
try {
  fs.symlinkSync(electronSrc, electronLink, "junction")
} catch {
  fs.mkdirSync(electronLink, { recursive: true })
  fs.copyFileSync(
    path.join(electronSrc, "package.json"),
    path.join(electronLink, "package.json"),
  )
}

const env = {
  ...process.env,
  // Unsigned local builds only — when CSC_LINK is set, allow signing.
  ...(!isRelease && !hasSigningCreds ? { CSC_IDENTITY_AUTO_DISCOVERY: "false" } : {}),
}

const configPath = path.join(stageDir, "electron-builder.yml")
const entitlementsAbs = path.join(stageBuild, "entitlements.mac.plist")
const iconAbs = path.join(stageBuild, "icon.icns")

const generatedConfig = `appId: com.whyarticulate.articulate
productName: Articulate
copyright: Copyright © Articulate / Why Articulate
executableName: Articulate

directories:
  output: ${JSON.stringify(path.join(__dirname, "release"))}
  buildResources: ${JSON.stringify(stageBuild)}

files:
  - dist/**/*
  - resources/**/*
  - package.json
  - "!**/node_modules/**"
  - "!**/*.map"
  - "!build/**"

asar: true
npmRebuild: false
nodeGypRebuild: false
electronVersion: 36.9.5

mac:
  category: public.app-category.business
  icon: ${JSON.stringify(iconAbs)}
  target:
    - target: dmg
      arch:
        - universal
    - target: zip
      arch:
        - universal
  hardenedRuntime: true
  gatekeeperAssess: false
  entitlements: ${JSON.stringify(entitlementsAbs)}
  entitlementsInherit: ${JSON.stringify(entitlementsAbs)}
  extendInfo:
    NSHumanReadableCopyright: Copyright © Articulate / Why Articulate
    CFBundleDisplayName: Articulate
    CFBundleName: Articulate
  notarize: true

dmg:
  title: Articulate \${version}
  artifactName: Articulate.\${ext}
  contents:
    - x: 180
      y: 200
      type: file
    - x: 460
      y: 200
      type: link
      path: /Applications
  window:
    width: 640
    height: 400

artifactName: Articulate-\${version}-mac.\${ext}

publish:
  provider: github
  owner: articulate-app
  repo: Articulate
  releaseType: release
`
fs.writeFileSync(configPath, generatedConfig)

const args = [
  "electron-builder",
  "--projectDir",
  stageDir,
  "--config",
  configPath,
  "--mac",
  "--universal",
  `--publish=${publishMode}`,
]

console.log(`[desktop] packaging Articulate ${desktopPkg.version} (${publishMode})`)
console.log(`[desktop] stage → ${stageDir}`)
console.log(`[desktop] signing → ${hasSigningCreds || isRelease ? "enabled" : "disabled (unsigned)"}`)

const result = spawnSync("npx", args, {
  cwd: root,
  env,
  stdio: "inherit",
  shell: false,
})

process.exit(result.status ?? 1)
