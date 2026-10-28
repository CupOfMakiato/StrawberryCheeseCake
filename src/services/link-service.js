import { invoke } from '@tauri-apps/api/core'

export function beginYouTubeDownload(id) {
    return invoke('begin_youtube_download', { id })
}

export function downloadYouTubeVideo(id, source, destination) {
    return invoke('download_youtube_video', { id, source, destination })
}

export function cancelYouTubeDownload(id) {
    return invoke('cancel_youtube_download', { id })
}

export function releaseYouTubeDownload(id) {
    return invoke('release_youtube_download', { id })
}
