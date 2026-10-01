import { useEffect, useState } from 'react'
import musicPlaceholder from '../assets/music-placeholder.png'
import { resolvePlaylistArtwork, resolveTrackArtwork } from '../utils/artwork'
import { resolvePlaylistImage, resolveTrackImage } from '../utils/playlist-media'
import { resolveImageSource } from '../utils/file-path'

export default function MusicArtwork({ track, playlist, ...props }) {
    const storedImage = resolveImageSource(
        playlist ? resolvePlaylistImage(playlist) : resolveTrackImage(track),
    )
    const [source, setSource] = useState(storedImage || musicPlaceholder)

    useEffect(() => {
        let cancelled = false
        setSource(storedImage || musicPlaceholder)
        if (!storedImage) {
            const resolution = playlist
                ? resolvePlaylistArtwork(playlist)
                : resolveTrackArtwork(track)
            resolution
                .then((image) => {
                    if (!cancelled && image) setSource(image)
                })
                .catch(() => {})
        }
        return () => {
            cancelled = true
        }
    }, [storedImage, track, playlist])

    return (
        <img
            {...props}
            src={source}
            draggable={false}
            onError={() => setSource(musicPlaceholder)}
        />
    )
}
