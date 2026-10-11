import { open } from '@tauri-apps/plugin-dialog'
import { readFile, writeFile, mkdir, BaseDirectory } from '@tauri-apps/plugin-fs'
import { appDataDir, join } from '@tauri-apps/api/path'

export async function selectPlaylistImage() {
    const path = await open({
        multiple: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }],
    })
    if (!path) return ''
    const bytes = await readFile(path)
    const extension = path.split('.').pop().toLowerCase()
    const relative = `artwork/playlist-${crypto.randomUUID()}.${extension}`
    await mkdir('artwork', { baseDir: BaseDirectory.AppData, recursive: true })
    await writeFile(relative, bytes, { baseDir: BaseDirectory.AppData })
    return join(await appDataDir(), relative)
}

export async function probeAudioDuration(filePath, signal) {
    if (!filePath || signal?.aborted) return null
    let url
    try {
        const bytes = await readFile(filePath)
        if (signal?.aborted) return null
        url = URL.createObjectURL(new Blob([bytes]))
        return await new Promise((resolve) => {
            const audio = new Audio()
            audio.preload = 'metadata'
            const finish = () => {
                const duration = Number(audio.duration)
                audio.removeEventListener('loadedmetadata', finish)
                audio.removeEventListener('error', finish)
                signal?.removeEventListener('abort', finish)
                clearTimeout(timeout)
                audio.removeAttribute('src')
                audio.load()
                resolve(
                    !signal?.aborted && Number.isFinite(duration) && duration > 0 ? duration : null,
                )
            }
            const timeout = setTimeout(finish, 15000)
            audio.addEventListener('loadedmetadata', finish, { once: true })
            audio.addEventListener('error', finish, { once: true })
            signal?.addEventListener('abort', finish, { once: true })
            audio.src = url
        })
    } catch {
        return null
    } finally {
        if (url) URL.revokeObjectURL(url)
    }
}
