import { resolvePlaylistImage, resolveTrackImage } from '../utils/playlist-media.js'
import { resolveImageSource } from '../utils/file-path.js'
import { normalizeTrackRecord } from '../utils/track-record.js'
import { audioService as defaultAudioService } from './audio-service.js'

export async function resolveTrackArtwork(track, { audioService = defaultAudioService } = {}) {
    const normalizedTrack = normalizeTrackRecord(track)
    if (!normalizedTrack?.filePath) {
        return ''
    }

    const existingImage = resolveTrackImage(normalizedTrack)
    if (existingImage) {
        return resolveImageSource(existingImage)
    }

    if (typeof audioService?.resolveTrackMetadata !== 'function') {
        return ''
    }

    const metadata = await audioService.resolveTrackMetadata(normalizedTrack.filePath, {
        includeImage: true,
    })
    return resolveImageSource(metadata?.image)
}

export async function resolvePlaylistArtwork(playlist) {
    const existingImage = resolvePlaylistImage(playlist)
    if (existingImage) return resolveImageSource(existingImage)
    const firstTrack = playlist?.tracks?.find((track) => normalizeTrackRecord(track)?.filePath)
    return firstTrack ? resolveTrackArtwork(firstTrack) : ''
}
