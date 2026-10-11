import { resolveImageSource } from '../../utils/file-path.js'
import { createIcons, getDataAttributeIndex, bindImageFallbacks } from './rendering.js'
import { resolveTrackArtwork } from '../../services/artwork-service.js'
import { normalizeTrackRecord } from '../../utils/track-record.js'
import { getPlaylistTrackFilePath } from '../../services/playlist-duration-cache.js'
import {
    clearTrackArtworkResolvePromise,
    getCachedTrackArtwork,
    getTrackArtworkResolvePromise,
    normalizeArtworkValue,
    rememberTrackArtwork,
    schedulePlaylistArtworkPersist,
    setTrackArtworkResolvePromise,
} from '../../services/playlist-artwork-cache.js'

export function createPlaylistArtworkController({ getActivePlaylist, audioService } = {}) {
    const pendingArtworkRows = new Set()
    const startedArtworkRows = new WeakSet()
    let activeArtworkReads = 0
    let hydrationRun = 0
    let artworkHydrationHandle = null
    let artworkHydrationUsesIdleCallback = false

    function rememberActivePlaylistTrackArtwork(trackIndex, artwork) {
        const activePlaylist = getActivePlaylist?.()
        const image = normalizeArtworkValue(artwork)
        if (!activePlaylist || !Array.isArray(activePlaylist.tracks) || !image) {
            return
        }

        const track = activePlaylist.tracks[trackIndex]
        const normalizedTrack = normalizeTrackRecord(track)
        if (!normalizedTrack?.filePath) {
            return
        }

        activePlaylist.tracks[trackIndex] = {
            ...normalizedTrack,
            image,
        }
    }

    async function hydrateTrackArtworkRow(row, run) {
        const trackIndex = getDataAttributeIndex(row, 'data-track-index')
        const imageElement = row.querySelector('.playlistTrackCover')
        const activePlaylist = getActivePlaylist?.()
        const playlistId = activePlaylist?.id || null
        const track = trackIndex === null ? null : activePlaylist?.tracks?.[trackIndex]
        if (!track || !imageElement) {
            return
        }

        const filePath = getPlaylistTrackFilePath(track)
        const currentTrackIndex = () => getDataAttributeIndex(row, 'data-track-index')
        const isCurrentTrack = () => {
            const latestPlaylist = getActivePlaylist?.()
            const latestTrack = latestPlaylist?.tracks?.[currentTrackIndex()]

            return (
                Boolean(playlistId) &&
                latestPlaylist?.id === playlistId &&
                getPlaylistTrackFilePath(latestTrack) === filePath
            )
        }
        const cachedArtwork = getCachedTrackArtwork(track)
        if (cachedArtwork) {
            imageElement.src = resolveImageSource(cachedArtwork)
            if (isCurrentTrack()) {
                rememberActivePlaylistTrackArtwork(trackIndex, cachedArtwork)
            }
            return
        }

        if (!filePath) {
            return
        }

        let artworkPromise = getTrackArtworkResolvePromise(filePath)
        if (!artworkPromise) {
            artworkPromise = resolveTrackArtwork(track, { audioService })
            setTrackArtworkResolvePromise(filePath, artworkPromise)
        }

        try {
            const artwork = await artworkPromise
            clearTrackArtworkResolvePromise(filePath)
            const image = normalizeArtworkValue(artwork)
            if (!image) {
                return
            }

            if (run !== hydrationRun || !isCurrentTrack()) {
                return
            }

            const cachedImage = rememberTrackArtwork(filePath, image)
            if (!cachedImage) {
                return
            }

            if (imageElement.isConnected) {
                imageElement.src = resolveImageSource(cachedImage)
            }
            rememberActivePlaylistTrackArtwork(currentTrackIndex(), cachedImage)
            schedulePlaylistArtworkPersist()
        } catch {
            clearTrackArtworkResolvePromise(filePath)
        }
    }

    function buildTrackRecordForRender(track) {
        const normalizedTrack = normalizeTrackRecord(track)
        const cachedArtwork = getCachedTrackArtwork(normalizedTrack || track)

        if (!normalizedTrack || !cachedArtwork || normalizedTrack.image === cachedArtwork) {
            return normalizedTrack
        }

        return {
            ...normalizedTrack,
            image: cachedArtwork,
        }
    }

    function cancelArtworkHydration() {
        hydrationRun++
        if (artworkHydrationHandle !== null) {
            if (
                artworkHydrationUsesIdleCallback &&
                typeof window.cancelIdleCallback === 'function'
            ) {
                window.cancelIdleCallback(artworkHydrationHandle)
            } else {
                window.clearTimeout(artworkHydrationHandle)
            }
        }

        artworkHydrationHandle = null
        artworkHydrationUsesIdleCallback = false
        pendingArtworkRows.clear()
    }

    function flushPendingArtworkHydration() {
        artworkHydrationHandle = null
        artworkHydrationUsesIdleCallback = false

        const rows = []
        for (const row of pendingArtworkRows) {
            if (!row.isConnected) pendingArtworkRows.delete(row)
            else rows.push(row)
        }
        const viewport = rows[0]?.closest('.appShell')?.getBoundingClientRect()
        if (!viewport) return
        // Read geometry together, then load visible covers before the overscan rows.
        const prioritized = rows
            .map((row) => {
                const rect = row.getBoundingClientRect()
                return {
                    row,
                    distance: Math.max(viewport.top - rect.bottom, rect.top - viewport.bottom, 0),
                }
            })
            .sort((a, b) => a.distance - b.distance)
        for (const { row } of prioritized) {
            if (activeArtworkReads >= 2) break
            pendingArtworkRows.delete(row)
            startedArtworkRows.add(row)
            activeArtworkReads++
            hydrateTrackArtworkRow(row, hydrationRun).finally(() => {
                activeArtworkReads--
                scheduleArtworkHydration([])
            })
        }
    }

    function scheduleArtworkHydration(rows) {
        rows.forEach((row) => {
            if (
                row?.isConnected &&
                row.matches('.playlistTrackRow') &&
                !startedArtworkRows.has(row)
            ) {
                const track =
                    getActivePlaylist?.()?.tracks?.[getDataAttributeIndex(row, 'data-track-index')]
                if (getCachedTrackArtwork(track)) startedArtworkRows.add(row)
                else pendingArtworkRows.add(row)
            }
        })

        if (
            !pendingArtworkRows.size ||
            artworkHydrationHandle !== null ||
            activeArtworkReads >= 2
        ) {
            return
        }

        if (typeof window.requestIdleCallback === 'function') {
            artworkHydrationUsesIdleCallback = true
            artworkHydrationHandle = window.requestIdleCallback(flushPendingArtworkHydration, {
                timeout: 600,
            })
            return
        }

        artworkHydrationHandle = window.setTimeout(flushPendingArtworkHydration, 80)
    }

    function applyRowDecorations(rows) {
        if (!rows.length) {
            return
        }

        createIcons({
            nodes: rows.flatMap((row) => Array.from(row.querySelectorAll('[data-lucide]'))),
        })
        rows.forEach((row) => {
            bindImageFallbacks({
                scope: row,
                selector: '.playlistTrackCover',
            })
        })
        scheduleArtworkHydration(rows)
    }

    return {
        buildTrackRecordForRender,
        applyRowDecorations,
        scheduleArtworkHydration,
        cancelArtworkHydration,
    }
}
