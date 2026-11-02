/**
 * Brand copy gate: em dashes (U+2014) are banned in UI copy, docs, and
 * generated artifacts. This scans the repo and exits non-zero on any hit, so
 * the ban cannot regress. Runs as part of `npm run check`.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, resolve, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// The whole repo. In webable26 this list was scoped because other threads
// owned files mid-flight; here nothing is, so nothing is exempt.
const SCOPES = ['packages', 'apps', 'scripts', 'docs', 'examples', '.github', 'README.md', 'CHANGELOG.md', 'CONTRIBUTING.md', 'PRIVACY.md', 'EMBED.md', 'SECURITY.md']
const EXTS = new Set(['.ts', '.tsx', '.mjs', '.css', '.md', '.html', '.json', '.yml'])

function* walk(dir) {
  // A scope can be a single file (README.md). readdirSync on a file throws,
  // which the catch below would read as "nothing here" and skip silently.
  try {
    if (statSync(dir).isFile()) {
      yield dir
      return
    }
  } catch {
    return
  }
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const entry of entries) {
    if (entry === 'node_modules') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* walk(full)
    else if (EXTS.has(extname(entry))) yield full
  }
}

let failures = 0
for (const scope of SCOPES) {
  for (const file of walk(join(root, scope))) {
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (line.includes('\u2014')) {
        failures++
        console.error(`${file.slice(root.length + 1)}:${i + 1}: em dash found`)
      }
    })
  }
}

if (failures > 0) {
  console.error(`\n${failures} em dash${failures === 1 ? '' : 'es'} in the repo. Replace with a comma, colon, or period.`)
  process.exit(1)
}
console.log('no-em-dash: clean')
