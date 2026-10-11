import {
    clearPlaylistDurationProbePromise,
    getPlaylistDurationProbePromise,
    getPlaylistTrackFilePath,
    getTrackDurationState,
    normalizeDurationValue,
    rememberPlaylistDuration,
    schedulePlaylistDurationPersist,
    setPlaylistDurationProbePromise,
} from '../../services/playlist-duration-cache.js'
import { formatDurationClock, formatDurationVerbose } from '../../utils/duration.js'
import { probeAudioDuration } from '../../services/playlist-media-service.js'
import { normalizeTrackRecord } from '../../utils/track-record.js'

const PLAYLIST_DURATION_WORKERS = 4

async function resolveTrackDuration(track, signal) {
    const knownDuration = getTrackDurationState(track)
    if (knownDuration.known) {
        return knownDuration.duration
    }

    const filePath = getPlaylistTrackFilePath(track)
    if (!filePath) {
        return null
    }

    const existingProbePromise = getPlaylistDurationProbePromise(filePath)
    if (existingProbePromise) {
        await existingProbePromise
        return signal?.aborted ? null : resolveTrackDuration(track, signal)
    }

    const probePromise = probeAudioDuration(filePath, signal)
        .then((duration) => {
            if (!signal?.aborted) rememberPlaylistDuration(filePath, duration)
            clearPlaylistDurationProbePromise(filePath)

            if (normalizeDurationValue(duration) !== null) {
                schedulePlaylistDurationPersist()
            }

            return duration
        })
        .catch((error) => {
            clearPlaylistDurationProbePromise(filePath)
            throw error
        })

    setPlaylistDurationProbePromise(filePath, probePromise)

    return probePromise
}

async function resolveTrackDurationsLimited(tracks, { concurrency = 8, onResolved, signal } = {}) {
    if (!Array.isArray(tracks) || tracks.length === 0) {
        return []
    }

    const results = tracks.map((track) => getTrackDurationState(track).duration)
    const unresolvedIndexes = []
    tracks.forEach((track, index) => {
        if (!getTrackDurationState(track).known) {
            unresolvedIndexes.push(index)
        }
    })

    if (!unresolvedIndexes.length) {
        return results
    }

    let nextIndex = 0

    const workers = Array.from(
        { length: Math.min(concurrency, unresolvedIndexes.length) },
        async () => {
            while (nextIndex < unresolvedIndexes.length && !signal?.aborted) {
                const index = unresolvedIndexes[nextIndex]
                nextIndex += 1

                const duration = await resolveTrackDuration(tracks[index], signal)
                results[index] = duration
                onResolved?.({ index, duration })

                await new Promise((resolve) => setTimeout(resolve, 0))
            }
        },
    )

    await Promise.all(workers)
    return results
}

export function createPlaylistDurationController({
    body,
    durationElement,
    getPlaylists,
    getActivePlaylist,
    isTrackRendered,
    onDurationCellUpdate,
} = {}) {
    let totalDurationRunId = 0
    let durationAbort = null
    let resolvingRunId = null
    let durationCellsRaf = null
    let pendingDurationCellsRunId = null
    const pendingDurationCellIndexes = new Set()

    function rememberActivePlaylistTrackDuration(playlistId, trackIndex, duration) {
        const safeDuration = normalizeDurationValue(duration)
        if (!playlistId || !Number.isInteger(trackIndex) || safeDuration === null) {
            return
        }

        const activePlaylist = (getPlaylists?.() || []).find(
            (playlist) => playlist.id === playlistId,
        )
        const track = activePlaylist?.tracks?.[trackIndex]
        const filePath = getPlaylistTrackFilePath(track)
        if (!activePlaylist || !Array.isArray(activePlaylist.tracks) || !filePath) {
            return
        }

        if (normalizeDurationValue(track?.duration) === safeDuration) {
            return
        }

        const normalizedTrack = normalizeTrackRecord(track)
        if (!normalizedTrack || normalizedTrack.filePath !== filePath) {
            return
        }

        activePlaylist.tracks[trackIndex] = {
            ...normalizedTrack,
            duration: safeDuration,
        }
    }

    function getTrackDurationFromRecord(track) {
        return getTrackDurationState(track).duration
    }

    function updateDurationCell(index, duration) {
        const durationCell = body.querySelector(`td[data-duration-index="${index}"]`)
        if (durationCell) {
            durationCell.textContent = formatDurationClock(duration)
        }

        onDurationCellUpdate?.(index, duration)
    }

    function cancelPendingDurationCellUpdates() {
        if (durationCellsRaf) {
            cancelAnimationFrame(durationCellsRaf)
            durationCellsRaf = null
        }
        pendingDurationCellsRunId = null
        pendingDurationCellIndexes.clear()
    }

    function scheduleDurationCellUpdate(trackIndex, runId = totalDurationRunId) {
        if (runId !== totalDurationRunId) {
            return
        }

        if (pendingDurationCellsRunId !== runId) {
            cancelPendingDurationCellUpdates()
            pendingDurationCellsRunId = runId
        }

        if (Number.isInteger(trackIndex)) {
            pendingDurationCellIndexes.add(trackIndex)
        }

        if (durationCellsRaf) {
            return
        }

        durationCellsRaf = requestAnimationFrame(() => {
            durationCellsRaf = null
            if (runId !== totalDurationRunId) {
                pendingDurationCellsRunId = null
                pendingDurationCellIndexes.clear()
                return
            }
            renderDurationCellUpdates(Array.from(pendingDurationCellIndexes))
            pendingDurationCellsRunId = null
            pendingDurationCellIndexes.clear()
        })
    }

    function renderDurationCellUpdates(trackIndexes) {
        const activePlaylist = getActivePlaylist?.()
        trackIndexes.forEach((trackIndex) => {
            updateDurationCell(
                trackIndex,
                getTrackDurationFromRecord(activePlaylist?.tracks?.[trackIndex]),
            )
        })
    }

    async function renderTotalDuration(activePlaylist) {
        durationAbort?.abort()
        durationAbort = new AbortController()
        if (
            !activePlaylist ||
            !Array.isArray(activePlaylist.tracks) ||
            activePlaylist.tracks.length === 0
        ) {
            totalDurationRunId += 1
            durationElement.textContent = ''
            return
        }

        const knownDurations = activePlaylist.tracks.map((track) => getTrackDurationState(track))
        if (knownDurations.every((duration) => duration.known)) {
            totalDurationRunId += 1
            cancelPendingDurationCellUpdates()
            const totalSeconds = knownDurations.reduce(
                (sum, value) => sum + (Number(value.duration) || 0),
                0,
            )
            durationElement.textContent = `, ${formatDurationVerbose(totalSeconds)}`
            return
        }

        durationElement.textContent = ', ...'
        const runId = ++totalDurationRunId
        resolvingRunId = runId
        const durations = await resolveTrackDurationsLimited(activePlaylist.tracks, {
            concurrency: PLAYLIST_DURATION_WORKERS,
            signal: durationAbort.signal,
            onResolved: (resolvedTrack) => {
                if (runId !== totalDurationRunId) {
                    return
                }

                rememberActivePlaylistTrackDuration(
                    activePlaylist.id,
                    resolvedTrack.index,
                    resolvedTrack.duration,
                )

                if (isTrackRendered?.(resolvedTrack.index) ?? true) {
                    scheduleDurationCellUpdate(resolvedTrack.index, runId)
                }
            },
        })

        if (runId !== totalDurationRunId) {
            return
        }
        resolvingRunId = null

        const totalSeconds = durations.reduce((sum, value) => sum + (Number(value) || 0), 0)
        durationElement.textContent = `, ${formatDurationVerbose(totalSeconds)}`
    }

    function cancelTotalDuration() {
        durationAbort?.abort()
        totalDurationRunId += 1
        cancelPendingDurationCellUpdates()
    }

    return {
        isResolving: () => resolvingRunId === totalDurationRunId,
        renderTotalDuration,
        getTrackDurationFromRecord,
        scheduleDurationCellUpdate,
        cancelPendingDurationCellUpdates,
        cancelTotalDuration,
    }
}
