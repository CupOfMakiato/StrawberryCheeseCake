import { playerState } from '../utils/player-state.js'
import { normalizeTrackRecord } from '../utils/track-record.js'
import { sessionService } from './session-service.js'

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
