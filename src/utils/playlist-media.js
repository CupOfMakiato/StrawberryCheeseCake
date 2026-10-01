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

export function resolvePlaylistImage(playlist) {
    if (!playlist || typeof playlist !== 'object') return ''
    const candidates = [
        playlist.banner,
        playlist.cover,
        playlist.fallbackCover,
        playlist.image,
        playlist.artwork,
        ...(Array.isArray(playlist.tracks) ? playlist.tracks.map(resolveTrackImage) : []),
    ]
    return candidates.map(normalizePlaylistImageValue).find(Boolean) || ''
}

export function extractPlaylistFilePaths(playlist) {
    return Array.isArray(playlist?.tracks)
        ? playlist.tracks
              .map((track) => (typeof track === 'string' ? track : track?.filePath))
              .filter(Boolean)
        : []
}
