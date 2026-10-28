import { invoke } from '@tauri-apps/api/core'

export function convertMp4ToMp3(source, destination) {
    return invoke('convert_mp4_to_mp3', { source, destination })
}
