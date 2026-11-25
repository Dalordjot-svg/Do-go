import { cp, readdir, readFile, rm } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const project = new URL('../', import.meta.url)
const output = new URL('dist/', project)
const html = await readFile(new URL('index.html', output), 'utf8')
const files = await readdir(output)
const expected = ['assets', 'icons', 'index.html', 'manifest.webmanifest', 'registerSW.js', 'sw.js']

if (!html.includes('src="./assets/') || expected.some(file => !files.includes(file)) ||
    !files.some(file => /^workbox-[\da-f]+\.js$/.test(file))) {
  throw new Error('Сначала соберите полноценный PWA через npm run build.')
}

for (const directory of ['assets', 'icons']) {
  await rm(new URL(directory, project), { recursive: true, force: true })
}
for (const file of await readdir(project)) {
  if (/^workbox-[\da-f]+\.js$/.test(file)) await rm(new URL(file, project))
}
for (const file of files) {
  if (!expected.includes(file) && !/^workbox-[\da-f]+\.js$/.test(file)) continue
  await cp(fileURLToPath(new URL(file, output)), fileURLToPath(new URL(file, project)), { recursive: true })
}
