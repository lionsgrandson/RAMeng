// Release preparation: keep the currently deployed public module graph for one
// deployment so already-open tabs can still import their matching lazy chunks.
// No credentials, API calls, or customer data are accessed.
import {mkdir,writeFile} from 'node:fs/promises'
const base = 'https://rameng-crm.rameng-crm-worker.workers.dev'
const directory = 'artifacts/release-assets'
await mkdir(directory,{recursive:true})
const files = new Map()
let bytes = 0
async function collect(path) {
  if (files.has(path)) return
  if (files.size >= 40) throw Error('Public asset graph exceeds release retention bound')
  files.set(path,'')
  const response = await fetch(base + path,{signal:AbortSignal.timeout(15000),cache:'no-store'})
  if (!response.ok || !(response.headers.get('content-type') || '').match(/javascript|css|html/)) throw Error(`Cannot retain deployed asset: ${path}`)
  const source = await response.text(); bytes += Buffer.byteLength(source)
  if (bytes > 15*1024*1024) throw Error('Public asset graph exceeds byte bound')
  files.set(path,source)
  for (const match of source.matchAll(/["']((?:\/?assets\/|\.\/)?[a-zA-Z0-9_-]+\.(?:js|css))["']/g)) {
    const name = match[1].replace(/^\/?assets\//,'').replace(/^\.\//,'')
    await collect(`/assets/${name}`)
  }
}
await collect('/')
const names = []
for (const [path,source] of files) if (path.startsWith('/assets/')) {const name=path.slice(8);names.push(name);await writeFile(`${directory}/${name}`,source)}
if (!names.some(name=>name.startsWith('RichTextEditor-'))) throw Error('The deployed lazy editor graph was not captured')
await writeFile(`${directory}/manifest.json`,JSON.stringify(names))
console.log(`Retained ${names.length} deployed public assets (${bytes} bytes); no KV operations`)
