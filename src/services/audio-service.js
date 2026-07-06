import { Howl, Howler } from 'howler'
import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js'
import { playerState as state } from '../utils/player-state.js'
import { sessionService } from './session-service.js'
import {
    // toFileUrl,
    getBaseName,
} from '../utils/file-path.js'
import { readFile, writeFile, mkdir, BaseDirectory } from '@tauri-apps/plugin-fs'
import { appDataDir, join } from '@tauri-apps/api/path'

export const audioService = (() => {
    const DEFAULT_VOLUME = 0.5
    const METADATA_DEBUG_ENABLED = true
    const VOLUME_DEBUG_ENABLED = true
    const UNKNOWN_TITLE_LABEL = 'Unknown Title'
    const UNKNOWN_ARTIST_LABEL = 'Unknown Artist'
    const UNKNOWN_ALBUM_LABEL = 'Unknown Album'
    const METADATA_CACHE_LIMIT = 240
    const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3', '.wav']
    const ARTWORK_DIR_NAME = 'artwork'
    const metadataCache = new Map()
    const artworkCache = new Map()
    const metadataInFlight = new Map()
    let artworkDirPromise = null

    let currentSound = null
    let playbackPersistTimer = null
    let progressUpdateTimer = null
    let lastLoggedVolume = null

    function normalizeVolume(value) {
        const parsed = Number(value)
        if (!Number.isFinite(parsed)) return DEFAULT_VOLUME
        return Math.max(0, Math.min(1, parsed))
    }

    function logMetadataDebug(filePath, phase, payload = {}) {
        if (!METADATA_DEBUG_ENABLED) return
        void filePath
        void phase
        void payload
        // console.log('[metadata-debug]', {
        //     phase,
        //     filePath,
        //     // fileName,
        //     ...payload,
        // })
    }

    function logVolumeDebug(...args) {
        if (!VOLUME_DEBUG_ENABLED) return
        try {
            console.log('[audio-debug]', ...args)
        } catch {
            // ignore
        }
    }

    function buildFallbackTrackData(filePath) {
        return {
            title: getBaseName(filePath),
            artist: UNKNOWN_ARTIST_LABEL,
            album: UNKNOWN_ALBUM_LABEL,
            image: null,
        }
    }

    function buildResolvedMetadataFromTags(rawTags, fallbackTitle) {
        return {
            title: rawTags?.title || fallbackTitle || UNKNOWN_TITLE_LABEL,
            artist: rawTags?.artist || UNKNOWN_ARTIST_LABEL,
            album: rawTags?.album || UNKNOWN_ALBUM_LABEL,
            image: rawTags?.image || null,
        }
    }

    function getMetadataErrorMessage(error) {
        return error?.info || error?.type || String(error || 'unknown error')
    }

    function isSupportedAudioFile(filePath) {
        if (typeof filePath !== 'string') {
            return false
        }

        const normalizedPath = filePath.trim().toLowerCase()
        return SUPPORTED_AUDIO_EXTENSIONS.some((extension) => normalizedPath.endsWith(extension))
    }

    function revokeArtworkUrl(url) {
        if (typeof url === 'string' && url.startsWith('blob:')) {
            try {
                URL.revokeObjectURL(url)
            } catch {
                // Ignore — URL may have already been revoked
            }
        }
    }

    function rememberMetadata(filePath, metadata) {
        if (metadataCache.has(filePath)) {
            metadataCache.delete(filePath)
        }

        metadataCache.set(filePath, {
            ...metadata,
            image: null,
        })

        if (metadataCache.size <= METADATA_CACHE_LIMIT) {
            return
        }

        const oldestKey = metadataCache.keys().next().value
        if (oldestKey) {
            metadataCache.delete(oldestKey)
        }
    }

    function rememberArtwork(filePath, image) {
        if (artworkCache.has(filePath)) {
            revokeArtworkUrl(artworkCache.get(filePath))
            artworkCache.delete(filePath)
        }

        artworkCache.set(filePath, image || '')

        if (artworkCache.size <= METADATA_CACHE_LIMIT) {
            return
        }

        const oldestKey = artworkCache.keys().next().value
        if (oldestKey) {
            revokeArtworkUrl(artworkCache.get(oldestKey))
            artworkCache.delete(oldestKey)
        }
    }

    async function hashTrackPath(filePath) {
        const value = String(filePath || '')
        const encoder = new TextEncoder()

        if (globalThis.crypto?.subtle?.digest) {
            const digest = await globalThis.crypto.subtle.digest(
                'SHA-1',
                encoder.encode(value),
            )
            return Array.from(new Uint8Array(digest))
                .map((byte) => byte.toString(16).padStart(2, '0'))
                .join('')
        }

        return Array.from(value)
            .map((char) => char.codePointAt(0).toString(16).padStart(2, '0'))
            .join('')
    }

    function getArtworkExtension(format) {
        const normalized = String(format || '').toLowerCase()

        if (normalized.includes('png')) return '.png'
        if (normalized.includes('webp')) return '.webp'
        if (normalized.includes('gif')) return '.gif'
        if (normalized.includes('jpeg') || normalized.includes('jpg')) return '.jpg'

        return '.img'
    }

    async function ensureArtworkDirectory() {
        if (!artworkDirPromise) {
            artworkDirPromise = (async () => {
                await mkdir(ARTWORK_DIR_NAME, {
                    baseDir: BaseDirectory.AppData,
                    recursive: true,
                })

                const baseDir = await appDataDir()
                return join(baseDir, ARTWORK_DIR_NAME)
            })().catch((error) => {
                artworkDirPromise = null
                throw error
            })
        }

        return artworkDirPromise
    }

    async function persistArtwork(filePath, picture) {
        const data = picture?.data
        if (!filePath || !data) {
            return null
        }

        try {
            await ensureArtworkDirectory()
            const fileName = `${await hashTrackPath(filePath)}${getArtworkExtension(
                picture?.format,
            )}`
            const relativePath = `${ARTWORK_DIR_NAME}/${fileName}`
            const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
            await writeFile(relativePath, bytes, { baseDir: BaseDirectory.AppData })

            const baseDir = await appDataDir()
            return join(baseDir, relativePath)
        } catch (error) {
            console.error('Failed to persist artwork:', error)
            return null
        }
    }

    async function readMetadata(filePath, fallbackTitle, { includeImage = false } = {}) {
        try {
            const bytes = await readFile(filePath)
            const blob = new Blob([bytes]) // keep the Blob

            const rawTags = await new Promise((resolve, reject) => {
                jsmediatags.read(blob, {
                    onSuccess: (tag) => resolve(tag.tags),
                    onError: reject,
                })
            })

            let image = null
            if (includeImage && rawTags?.picture) {
                image = await persistArtwork(filePath, rawTags.picture)
            }

            return buildResolvedMetadataFromTags(
                { title: rawTags?.title, artist: rawTags?.artist, album: rawTags?.album, image },
                fallbackTitle,
            )
        } catch (error) {
            logMetadataDebug(filePath, 'metadata-read-error', {
                fallbackTitle,
                error: getMetadataErrorMessage(error),
            })
            return null
        }
    }

    function stopPlaybackPersistTracking() {
        if (playbackPersistTimer) {
            window.clearInterval(playbackPersistTimer)
            playbackPersistTimer = null
        }
        if (progressUpdateTimer) {
            window.clearInterval(progressUpdateTimer)
            progressUpdateTimer = null
        }
    }

    function savePlaybackSnapshot(positionOverride) {
        if (!state || !sessionService?.savePlaylist) return
        const { playlist, currentTrackIndex } = state.getState()
        if (!Array.isArray(playlist) || playlist.length === 0 || currentTrackIndex < 0) return

        const position = Number.isFinite(Number(positionOverride))
            ? Number(positionOverride)
            : Number(currentSound?.seek?.() || 0)

        const currentTrackPath = playlist[currentTrackIndex]
        let currentTrackOccurrence = 0
        if (currentTrackPath && Array.isArray(playlist)) {
            currentTrackOccurrence = playlist
                .slice(0, currentTrackIndex + 1)
                .reduce((count, filePath) => (filePath === currentTrackPath ? count + 1 : count), 0)
        }

        if (typeof sessionService.savePlaybackPosition === 'function') {
            sessionService.savePlaybackPosition(
                currentTrackIndex,
                Math.max(0, position),
                currentTrackPath,
                currentTrackOccurrence,
            )
            return
        }

        sessionService.savePlaylist(playlist, currentTrackIndex, Math.max(0, position))
    }

    function startPlaybackPersistTracking() {
        stopPlaybackPersistTracking()
        playbackPersistTimer = window.setInterval(() => {
            savePlaybackSnapshot()
        }, 1000)
        // update UI progress regularly while playing
        progressUpdateTimer = window.setInterval(() => {
            try {
                if (!currentSound || typeof currentSound.seek !== 'function') return
                const currentTime = Number(currentSound.seek() || 0)
                const duration = Number(currentSound.duration() || 0)
                const percent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0
                state.setProgress({ currentTime, duration, percent })
            } catch {
                // ignore occasional seek errors
            }
        }, 500)
    }

    async function resolveTrackMetadata(filePath, options = {}) {
        if (!filePath) {
            return buildFallbackTrackData(filePath)
        }

        const includeImage = options.includeImage === true
        if (!includeImage && metadataCache.has(filePath)) {
            return metadataCache.get(filePath)
        }

        if (includeImage && artworkCache.has(filePath)) {
            return {
                ...(metadataCache.get(filePath) || buildFallbackTrackData(filePath)),
                image: artworkCache.get(filePath) || null,
            }
        }

        const cacheKey = `${includeImage ? 'image' : 'text'}:${filePath}`
        if (metadataInFlight.has(cacheKey)) {
            return metadataInFlight.get(cacheKey)
        }

        const fallback = buildFallbackTrackData(filePath)
        const metadataPromise = readMetadata(filePath, fallback.title, { includeImage })
            .then((metadata) => {
                const safeMetadata = {
                    title: metadata?.title || fallback.title,
                    artist: metadata?.artist || fallback.artist,
                    album: metadata?.album || fallback.album,
                    image: includeImage ? metadata?.image || null : null,
                }
                rememberMetadata(filePath, safeMetadata)
                if (includeImage) {
                    rememberArtwork(filePath, safeMetadata.image)
                }
                metadataInFlight.delete(cacheKey)
                return safeMetadata
            })
            .catch((error) => {
                metadataInFlight.delete(cacheKey)
                logMetadataDebug(filePath, 'metadata-cache-error', { error: String(error) })
                return fallback
            })

        metadataInFlight.set(cacheKey, metadataPromise)
        return metadataPromise
    }

    function getTrackDisplayData(filePath) {
        if (!filePath) {
            return buildFallbackTrackData(filePath)
        }

        return metadataCache.get(filePath) || buildFallbackTrackData(filePath)
    }

    async function prewarmMetadataForNextTrack(currentIndex, playlist) {
        if (!Array.isArray(playlist)) {
            return
        }

        const nextFilePath = playlist[currentIndex + 1]
        if (!nextFilePath) {
            return
        }

        resolveTrackMetadata(nextFilePath, { includeImage: false }).catch(() => {
            // Ignore prewarm failures; playback should not be blocked by metadata.
        })
    }

    async function restoreSavedPlaylist({ playlist, currentTrackIndex, playbackPosition } = {}) {
        if (!Array.isArray(playlist) || playlist.length === 0) {
            return
        }

        const normalizedPlaylist = playlist.filter(isSupportedAudioFile)
        if (normalizedPlaylist.length === 0) {
            return
        }

        const index = Number.isInteger(currentTrackIndex) ? currentTrackIndex : 0
        if (index < 0 || index >= normalizedPlaylist.length) {
            return
        }

        const filePath = normalizedPlaylist[index]
        state.setPlaylist(normalizedPlaylist)
        state.setCurrentTrack({ filePath, ...buildFallbackTrackData(filePath) })
        state.setCurrentTrackIndex(index)

        if (Number.isFinite(Number(playbackPosition)) && playbackPosition >= 0) {
            state.setProgress({ currentTime: Number(playbackPosition), duration: 0, percent: 0 })
        }

        try {
            const trackData = await resolveTrackMetadata(filePath, { includeImage: true })
            const { playlist: latestPlaylist, currentTrackIndex: latestIndex } = state.getState()
            const isSameTrack =
                Array.isArray(latestPlaylist) &&
                latestPlaylist[latestIndex] === filePath &&
                latestIndex === index

            if (isSameTrack) {
                state.setCurrentTrack(trackData)
            }
        } catch {
            // Metadata enrichment failure should not impact restore.
        }
    }

    async function restoreSavedPlaylistFromStore() {
        if (!sessionService?.loadPlaylist) {
            return
        }

        try {
            const savedSession = await sessionService.loadPlaylist()
            await restoreSavedPlaylist(savedSession)
        } catch (error) {
            console.error('Failed to restore saved playlist from store:', error)
        }
    }

    function clearCurrentMusic() {
        if (!currentSound) return
        currentSound.stop()
        currentSound.unload()
        currentSound = null
        stopPlaybackPersistTracking()
        if (state) {
            state.setIsPlaying(false)
            state.setProgress({ currentTime: 0, duration: 0, percent: 0 })
        }
    }

    function playNextInQueue({ reason = 'next' } = {}) {
        if (!state) return
        const { currentTrackIndex, playlist, loopEnabled } = state.getState()

        if (reason === 'ended' && loopEnabled && Number.isInteger(currentTrackIndex)) {
            if (currentTrackIndex >= 0 && currentTrackIndex < playlist.length) {
                playTrackAtIndex(currentTrackIndex, {
                    autoplay: true,
                    startAtSeconds: 0,
                    addToRecentTracks: false,
                })
                return
            }
        }

        const nextIndex = currentTrackIndex + 1
        if (nextIndex >= playlist.length) {
            if (currentSound) {
                currentSound.stop()
                currentSound.unload()
                currentSound = null
            }
            stopPlaybackPersistTracking()
            state.setIsPlaying(false)
            state.setProgress({ currentTime: 0, duration: 0, percent: 0 })
            return
        }
        playTrackAtIndex(nextIndex)
    }

    function getMimeType(path) {
        const lower = path.toLowerCase()

        if (lower.endsWith('.mp3')) return 'audio/mpeg'
        if (lower.endsWith('.wav')) return 'audio/wav'

        return 'application/octet-stream'
    }

    async function playTrackAtIndex(index, options = {}) {
        if (!state) return
        const { playlist } = state.getState()
        if (index < 0 || index >= playlist.length) return
        const autoplay = options.autoplay !== false
        const addToRecentTracks = options.addToRecentTracks !== false
        const startAtSeconds = Math.max(0, Number(options.startAtSeconds) || 0)

        const filePath = playlist[index]
        const fallbackTrackData = metadataCache.get(filePath) || buildFallbackTrackData(filePath)

        const bytes = await readFile(filePath)

        const blob = new Blob([bytes], {
            type: getMimeType(filePath),
        })

        const objectUrl = URL.createObjectURL(blob)

        state.setCurrentTrackIndex(index)
        state.setCurrentTrack(fallbackTrackData)

        // Save current track index and playlist
        sessionService?.savePlaylist(playlist, index, startAtSeconds)

        // Add to recent tracks
        if (addToRecentTracks && sessionService?.prependRecentTrack) {
            const recentTrack = {
                filePath,
                title: fallbackTrackData.title,
                artist: fallbackTrackData.artist,
                album: fallbackTrackData.album,
                image: fallbackTrackData.image,
                playedAt: new Date().toISOString(),
            }
            sessionService.prependRecentTrack(recentTrack).catch((error) => {
                console.error('Failed to update recent tracks:', error)
            })
        }

        if (currentSound) {
            savePlaybackSnapshot()
            stopPlaybackPersistTracking()
            try {
                currentSound.stop()
                if (typeof currentSound.unload === 'function') {
                    currentSound.unload()
                }
            } catch (err) {
                console.error('Error unloading previous Howl', err)
            }
            currentSound = null
        }

        const { volume } = state.getState()

        currentSound = new Howl({
            src: [objectUrl],
            html5: true,
            volume,
            onload: () => {
                if (startAtSeconds > 0 && currentSound) {
                    currentSound.seek(startAtSeconds)
                    const duration = currentSound.duration() || 0
                    const percent =
                        duration > 0 ? Math.min(100, (startAtSeconds / duration) * 100) : 0
                    state.setProgress({ currentTime: startAtSeconds, duration, percent })
                }
            },
            onplay: () => {
                state.setIsPlaying(true)
                startPlaybackPersistTracking()
            },
            onpause: () => {
                state.setIsPlaying(false)
                savePlaybackSnapshot()
                stopPlaybackPersistTracking()
            },
            onend: () => playNextInQueue({ reason: 'ended' }),
            onseek: () => {
                savePlaybackSnapshot()
            },
        })

        if (autoplay) {
            currentSound.play()
        } else {
            state.setIsPlaying(false)
            state.setProgress({ currentTime: startAtSeconds, percent: 0 })
        }

        // Resolve rich metadata in background so playback is not blocked by file reads/decoding.
        const expectedFilePath = filePath
        resolveTrackMetadata(filePath, { includeImage: true })
            .then((trackData) => {
                const { playlist: latestPlaylist, currentTrackIndex } = state.getState()
                const isSameTrack =
                    Array.isArray(latestPlaylist) &&
                    currentTrackIndex >= 0 &&
                    latestPlaylist[currentTrackIndex] === expectedFilePath

                if (isSameTrack) {
                    state.setCurrentTrack(trackData)
                }

                if (addToRecentTracks && sessionService?.prependRecentTrack && isSameTrack) {
                    sessionService.prependRecentTrack({
                        filePath: expectedFilePath,
                        title: trackData.title,
                        artist: trackData.artist,
                        album: trackData.album,
                        image: trackData.image,
                        playedAt: new Date().toISOString(),
                    })
                }
            })
            .catch(() => {
                // Metadata enrichment failure should not impact playback.
            })

        prewarmMetadataForNextTrack(index, playlist)
    }

    function togglePlayPause() {
        if (!currentSound) {
            const { playlist, currentTrackIndex } = state?.getState?.() || {}
            if (
                Array.isArray(playlist) &&
                currentTrackIndex >= 0 &&
                currentTrackIndex < playlist.length
            ) {
                playTrackAtIndex(currentTrackIndex, {
                    autoplay: true,
                    startAtSeconds: 0,
                    addToRecentTracks: false,
                })
            }
            return
        }
        if (currentSound.playing()) {
            currentSound.pause()
        } else {
            currentSound.play()
        }
    }

    function startPlaylist(filePaths) {
        if (!state) return
        if (!Array.isArray(filePaths) || filePaths.length === 0) return
        const audioFilePaths = filePaths.filter(isSupportedAudioFile)
        if (audioFilePaths.length === 0) return

        state.setPlaylist(audioFilePaths)

        // Save playlist for next session
        sessionService?.savePlaylist(audioFilePaths, 0)

        playTrackAtIndex(0)
    }

    function startSingleTrack(filePath) {
        if (!isSupportedAudioFile(filePath)) {
            return
        }

        startPlaylist([filePath])
    }

    function playPrevious() {
        if (!state) return
        const { currentTrackIndex } = state.getState()
        const prevIndex = currentTrackIndex - 1
        if (prevIndex >= 0) {
            playTrackAtIndex(prevIndex)
        }
    }

    function setVolume(volume) {
        const normalizedVolume = normalizeVolume(volume)
        if (Howler) {
            Howler.volume(normalizedVolume)
        }
        state.setVolume(normalizedVolume)
        sessionService?.saveVolume(normalizedVolume)
    }

    async function initializeVolumeFromStore() {
        if (!sessionService?.loadSavedVolume) {
            setVolume(DEFAULT_VOLUME)
            return
        }

        try {
            const savedVolume = await sessionService.loadSavedVolume()
            setVolume(savedVolume)
        } catch (error) {
            console.error('Failed to load saved volume:', error)
            setVolume(DEFAULT_VOLUME)
        }
    }

    initializeVolumeFromStore()
    restoreSavedPlaylistFromStore()

    // subscribe to playerState changes and log volume updates for debugging
    try {
        lastLoggedVolume = state.getState().volume
        state.subscribe((snapshot) => {
            try {
                if (
                    snapshot &&
                    typeof snapshot.volume === 'number' &&
                    snapshot.volume !== lastLoggedVolume
                ) {
                    logVolumeDebug('playerState.volume.changed', {
                        current: snapshot.volume,
                    })
                    lastLoggedVolume = snapshot.volume
                }
            } catch {
                // ignore
            }
        })
    } catch {
        // ignore subscription errors
    }

    window.addEventListener('beforeunload', () => {
        savePlaybackSnapshot()
        stopPlaybackPersistTracking()
        if (currentSound) {
            currentSound.unload()
            currentSound = null
        }
    })

    function getCurrentSound() {
        return currentSound
    }

    return {
        playTrackAtIndex,
        startPlaylist,
        startSingleTrack,
        togglePlayPause,
        playNext: (options = {}) => playNextInQueue(options),
        playPrevious: () => {
            playPrevious()
        },
        setVolume,
        getCurrentSound,
        clearCurrentMusic,
        getTrackDisplayData,
        resolveTrackMetadata,
        restoreSavedPlaylist,
        restoreSavedPlaylistFromStore,
        debugVolume: () => {
            try {
                return {
                    stateVolume: state.getState().volume,
                    howlerVolume:
                        Howler && typeof Howler.volume === 'function' ? Howler.volume() : null,
                    currentSoundVolume:
                        currentSound && typeof currentSound.volume === 'function'
                            ? currentSound.volume()
                            : null,
                }
            } catch {
                return null
            }
        },
    }
})()

// Expose for easy debugging in DevTools
try {
    if (typeof window !== 'undefined' && window) {
        window.audioService = audioService
    }
} catch {
    // ignore
}
