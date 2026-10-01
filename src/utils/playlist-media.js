export function normalizePlaylistImageValue(value) {
    if (typeof value !== 'string') {
        return ''
    }

    const image = value.trim()
    if (
        !image ||
        image.startsWith('data:image/') ||
        image.startsWith('blob:') ||
        image.startsWith('file:')
    ) {
        return ''
    }

    return image
}

export function resolveTrackImage(track) {
    if (!track || typeof track !== 'object') {
        return ''
    }

    const candidates = [track.image, track.artwork, track.cover, track.picture]
    return candidates.map(normalizePlaylistImageValue).find(Boolean) || ''
}
