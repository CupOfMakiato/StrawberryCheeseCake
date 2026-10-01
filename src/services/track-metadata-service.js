import { playerState } from '../utils/player-state.js'
import { normalizeTrackRecord } from '../utils/track-record.js'
import { sessionService } from './session-service.js'
import { audioService } from './audio-service.js'

// Match MusicHub's four-worker hydration, preserving order and using the
// existing audioService cache rather than a second metadata cache.
export async function resolvePlaylistTracksMetadata(
    tracks,
    { includeImage = true, signal, onTrackResolved } = {},
) {
    if (!Array.isArray(tracks)) return []
    const resolved = new Array(tracks.length)
    let cursor = 0
    async function worker() {
        while (cursor < tracks.length && !signal?.aborted) {
            const index = cursor++
            const track = normalizeTrackRecord(tracks[index])
            if (!track) continue
            let metadata
            try {
                metadata = await audioService.resolveTrackMetadata(track.filePath, { includeImage })
            } catch {
                /* Keep the stored record when a file cannot be read. */
            }
            if (signal?.aborted) return
            resolved[index] = {
                ...track,
                title: metadata?.title || track.title,
                artist: metadata?.artist || track.artist,
                album: metadata?.album || track.album,
                image: metadata?.image || track.image,
            }
            onTrackResolved?.(resolved[index], index)
        }
    }
    await Promise.all(Array.from({ length: Math.min(4, tracks.length) }, worker))
    return signal?.aborted ? [] : resolved.filter(Boolean)
}

export const trackMetadataService = (() => {
    async function loadSavedCurrentTrackWithSession() {
        const [savedSession, recentTracks] = await Promise.all([
            sessionService.loadPlaylist(),
            sessionService.loadRecentTracks(),
        ])

        const playlist = Array.isArray(savedSession?.playlist) ? savedSession.playlist : []
        const currentTrackIndex = Number.isInteger(savedSession?.currentTrackIndex)
            ? savedSession.currentTrackIndex
            : -1
        const filePath =
            playlist[currentTrackIndex] ||
            (typeof savedSession?.currentTrack?.filePath === 'string'
                ? savedSession.currentTrack.filePath
                : '')

        if (!filePath) {
            return { savedSession, track: null }
        }

        const recentTrack = Array.isArray(recentTracks)
            ? recentTracks.find((track) => track.filePath === filePath)
            : null

        const track = normalizeTrackRecord({
            ...(recentTrack || {}),
            ...(savedSession?.currentTrack || {}),
            filePath,
        })

        return { savedSession, track }
    }

    async function restoreSavedCurrentTrack() {
        const { savedSession, track } = await loadSavedCurrentTrackWithSession()
        if (!track?.filePath) {
            return null
        }

        const playlist = Array.isArray(savedSession?.playlist) ? savedSession.playlist : []
        const currentTrackIndex = Number.isInteger(savedSession?.currentTrackIndex)
            ? savedSession.currentTrackIndex
            : playlist.indexOf(track.filePath)

        if (playlist.length) {
            playerState.setPlaylist(playlist)
        }

        if (currentTrackIndex >= 0) {
            playerState.setCurrentTrackIndex(currentTrackIndex)
        }

        const playbackPosition = Number(savedSession?.playbackPosition)
        if (Number.isFinite(playbackPosition) && playbackPosition >= 0) {
            playerState.setProgress({ currentTime: playbackPosition, duration: 0, percent: 0 })
        }

        playerState.setCurrentTrack(track)
        return track
    }

    return {
        restoreSavedCurrentTrack,
    }
})()
