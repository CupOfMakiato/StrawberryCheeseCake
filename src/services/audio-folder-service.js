import { join } from '@tauri-apps/api/path'
import { readDir, stat } from '@tauri-apps/plugin-fs'

const AUDIO_FILE_PATTERN = /\.(mp3|wav)$/i
const FILE_STAT_CONCURRENCY = 4

export async function getOrderedAudioFiles(folderPath) {
    const entries = await readDir(folderPath)
    const audioEntries = entries.filter(
        (entry) => entry?.isFile && AUDIO_FILE_PATTERN.test(entry.name || ''),
    )
    const fileEntries = new Array(audioEntries.length)
    let cursor = 0

    async function worker() {
        while (cursor < audioEntries.length) {
            const index = cursor++
            const entry = audioEntries[index]
            const filePath = await join(folderPath, entry.name)
            const fileInfo = await stat(filePath)
            const addedAt = fileInfo?.birthtime || fileInfo?.mtime || 0

            fileEntries[index] = {
                filePath,
                addedAt: new Date(addedAt).getTime() || 0,
            }
        }
    }

    await Promise.all(
        Array.from({ length: Math.min(FILE_STAT_CONCURRENCY, audioEntries.length) }, worker),
    )

    return fileEntries.sort((a, b) => a.addedAt - b.addedAt).map((entry) => entry.filePath)
}
