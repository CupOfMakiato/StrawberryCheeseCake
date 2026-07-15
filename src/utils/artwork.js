import { resolveTrackImage } from './playlist-media.js'
import { resolveImageSource } from './file-path.js'
import { normalizeTrackRecord } from './track-record.js'
import { audioService as defaultAudioService } from '../services/audio-service.js'

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
