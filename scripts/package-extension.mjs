/**
 * Builds the extension and zips apps/extension/dist into a Chrome Web Store
 * upload (manifest at the zip root). Output: apps/extension/store/webable-extension-vX.Y.Z.zip
 * Run: npm run package:extension
 */
import { execSync } from 'node:child_process'
import { readFileSync, mkdirSync, rmSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
execSync('node apps/extension/build.mjs', { cwd: root, stdio: 'inherit' })

const version = JSON.parse(readFileSync(join(root, 'apps/extension/manifest.json'), 'utf8')).version
const storeDir = join(root, 'apps/extension/store')
mkdirSync(storeDir, { recursive: true })
const out = join(storeDir, `webable-extension-v${version}.zip`)
rmSync(out, { force: true })
// Drop zips from older manifests. One was left behind at v2.5.0 while the
// manifest said 2.6.0, so the newest artifact in the folder was not the one
// that would be uploaded. apps/extension/test/version.test.ts fails on any that
// survive.
for (const f of readdirSync(storeDir)) {
  if (f.endsWith('.zip') && !f.includes(`v${version}`)) rmSync(join(storeDir, f))
}

const dist = join(root, 'extension')
execSync(`cd "${dist}" && zip -qr "${out}" . -x ".*"`, { stdio: 'inherit', shell: '/bin/bash' })
console.log(`\nPackaged → apps/extension/store/webable-extension-v${version}.zip`)
