import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('YouTube download tools require 64-bit Windows.')
}
const downloads = [
    ['yt-dlp.exe', 'https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.26/yt-dlp.exe', 'f5389d3698ecde4ef06f4e6b1ce0294fe9ac1396228c8990b8d3416d6d177a7d'],
    ['qjs.exe', 'https://github.com/quickjs-ng/quickjs/releases/download/v0.17.0/qjs-windows-x86_64.exe', '2aeabf0092c3262d6b2609824418f7dd7ed1f1df939f73b2b15645230cac0d77'],
    ['quickjs-license.txt', 'https://raw.githubusercontent.com/quickjs-ng/quickjs/v0.17.0/LICENSE', '96f73f9d2a16c21a36b418f06073be26e7d6d5e7c1bc99756b21a4f2c74ef171'],
    ['yt-dlp-third-party-licenses.txt', 'https://raw.githubusercontent.com/yt-dlp/yt-dlp/2026.10.26/THIRD_PARTY_LICENSES.txt', '472aefe951c7db35e1657c1d13fd337140511ed6f2b329205105ad441c5a02b7'],
    ['GPL-3.0-or-later.txt', 'https://raw.githubusercontent.com/spdx/license-list-data/main/text/GPL-3.0-or-later.txt', 'fb981668c18a279e285fc4d83fba1e836cc84dd4daa73c9697d3cfd2d8aca6e0'],
]
const toolsDir = fileURLToPath(new URL('../node_modules/youtube-download-tools/', import.meta.url))
await mkdir(toolsDir, { recursive: true })
for (const [name, url, expected] of downloads) {
    const target = path.join(toolsDir, name)
    const existing = await readFile(target).catch((error) => { if (error.code !== 'ENOENT') throw error })
    if (existing && createHash('sha256').update(existing).digest('hex') === expected) continue
    console.log(`Downloading ${name}...`)
    const response = await fetch(url)
    if (!response.ok) throw new Error(`Failed to download ${name}: HTTP ${response.status}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (createHash('sha256').update(bytes).digest('hex') !== expected) throw new Error(`Checksum mismatch for ${name}`)
    const partial = `${target}.download`
    try {
        await writeFile(partial, bytes)
        await rename(partial, target)
    } finally {
        await rm(partial, { force: true })
    }
}
