import { Howl, Howler } from 'howler'
import jsmediatags from 'jsmediatags/dist/jsmediatags.min.js'
import { playerState as state } from '../utils/player-state.js'
import { sessionService } from './session-service.js'
import { getBaseName } from '../utils/file-path.js'
import { readFile, writeFile, mkdir, BaseDirectory } from '@tauri-apps/plugin-fs'
import { appDataDir, join } from '@tauri-apps/api/path'

export const audioService = (() => {
    const DEFAULT_VOLUME = 0.5
    const UNKNOWN_TITLE_LABEL = 'Unknown Title'
    const UNKNOWN_ARTIST_LABEL = 'Unknown Artist'
    const UNKNOWN_ALBUM_LABEL = 'Unknown Album'
    const METADATA_CACHE_LIMIT = 240
    const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3', '.wav']
    const ARTWORK_DIR_NAME = 'artwork'
    const ARTWORK_WEBP_QUALITY = 0.85
    const metadataCache = new Map()
    const artworkCache = new Map()
    const metadataInFlight = new Map()
    let artworkDirPromise = null

    let currentSound = null
    let playbackPersistTimer = null
    let progressUpdateTimer = null

    function normalizeVolume(value) {
        const parsed = Number(value)
        if (!Number.isFinite(parsed)) return DEFAULT_VOLUME
        return Math.max(0, Math.min(1, parsed))
    }

    function fallbackTrack(filePath) {
        return {
            title: getBaseName(filePath),
            artist: UNKNOWN_ARTIST_LABEL,
            album: UNKNOWN_ALBUM_LABEL,
            image: null,
        }
    }

    function mergeTrackData(filePath, nextTrack = {}) {
        const previousTrack = state.getState().currentTrack
        const previous =
            previousTrack?.filePath === filePath
                ? previousTrack
                : { filePath, ...fallbackTrack(filePath) }
        const fallback = fallbackTrack(filePath)

        return {
            filePath,
            title:
                nextTrack.title && nextTrack.title !== fallback.title
                    ? nextTrack.title
                    : previous.title || fallback.title,
            artist:
                nextTrack.artist && nextTrack.artist !== fallback.artist
                    ? nextTrack.artist
                    : previous.artist || fallback.artist,
            album:
                nextTrack.album && nextTrack.album !== fallback.album
                    ? nextTrack.album
                    : previous.album || fallback.album,
            image: nextTrack.image || previous.image || fallback.image,
        }
    }

    function tagsToTrack(rawTags, fallbackTitle) {
        return {
            title: rawTags?.title || fallbackTitle || UNKNOWN_TITLE_LABEL,
            artist: rawTags?.artist || UNKNOWN_ARTIST_LABEL,
            album: rawTags?.album || UNKNOWN_ALBUM_LABEL,
            image: rawTags?.image || null,
        }
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
            } catch (error) {
                console.error('Failed to revoke artwork URL:', error)
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
            const digest = await globalThis.crypto.subtle.digest('SHA-1', encoder.encode(value))
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

    async function encodeArtworkAsWebp(picture) {
        const bytes =
            picture?.data instanceof Uint8Array ? picture.data : new Uint8Array(picture?.data || [])
        const source = new Blob([bytes], { type: picture?.format || 'image/jpeg' })
        const bitmap = await createImageBitmap(source)
        const canvas = document.createElement('canvas')
        canvas.width = bitmap.width
        canvas.height = bitmap.height
        canvas.getContext('2d').drawImage(bitmap, 0, 0)
        bitmap.close?.()

        const webp = await new Promise((resolve) =>
            canvas.toBlob(resolve, 'image/webp', ARTWORK_WEBP_QUALITY),
        )

        if (!webp) {
            return null
        }

        return new Uint8Array(await webp.arrayBuffer())
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
            const webpBytes = await encodeArtworkAsWebp(picture)
            const extension = webpBytes ? '.webp' : getArtworkExtension(picture?.format)
            const fileName = `${await hashTrackPath(filePath)}${extension}`
            const relativePath = `${ARTWORK_DIR_NAME}/${fileName}`
            const bytes = webpBytes || (data instanceof Uint8Array ? data : new Uint8Array(data))
            await writeFile(relativePath, bytes, { baseDir: BaseDirectory.AppData })

            const baseDir = await appDataDir()
            return join(baseDir, relativePath)
        } catch (error) {
            console.error('Failed to persist artwork:', error)
            return null
        }
    }

    async function readMetadata(filePath, fallbackTitle, { includeImage = false } = {}) {
        if (getAudioType(filePath).format !== 'mp3') {
            return tagsToTrack(null, fallbackTitle)
        }

        try {
            const bytes = await readFile(filePath)
            const blob = new Blob([bytes])

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

            return tagsToTrack(
                { title: rawTags?.title, artist: rawTags?.artist, album: rawTags?.album, image },
                fallbackTitle,
            )
        } catch (error) {
            console.log('Failed to read metadata:', filePath, error)
            return null
        }
    }

    function stopPlaybackTimers() {
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
        const { playlist, currentTrackIndex, currentTrack } = state.getState()
        if (!Array.isArray(playlist) || playlist.length === 0 || currentTrackIndex < 0) return

        const position = Number.isFinite(Number(positionOverride))
            ? Number(positionOverride)
            : Number(currentSound?.seek?.() || 0)

        sessionService.savePlaylist(
            playlist,
            currentTrackIndex,
            Math.max(0, position),
            currentTrack,
        )
    }

    function startPlaybackTimers() {
        stopPlaybackTimers()
        playbackPersistTimer = window.setInterval(() => {
            savePlaybackSnapshot()
        }, 1000)

        progressUpdateTimer = window.setInterval(() => {
            try {
                if (!currentSound || typeof currentSound.seek !== 'function') return
                const currentTime = Number(currentSound.seek() || 0)
                const duration = Number(currentSound.duration() || 0)
                const percent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0
                state.setProgress({ currentTime, duration, percent })
            } catch (error) {
                console.error('Failed to update playback progress:', error)
            }
        }, 500)
    }

    async function resolveTrackMetadata(filePath, options = {}) {
        if (!filePath) {
            return fallbackTrack(filePath)
        }

        const includeImage = options.includeImage === true
        if (!includeImage && metadataCache.has(filePath)) {
            return metadataCache.get(filePath)
        }

        if (includeImage && artworkCache.has(filePath)) {
            return {
                ...(metadataCache.get(filePath) || fallbackTrack(filePath)),
                image: artworkCache.get(filePath) || null,
            }
        }

        const cacheKey = `${includeImage ? 'image' : 'text'}:${filePath}`
        if (metadataInFlight.has(cacheKey)) {
            return metadataInFlight.get(cacheKey)
        }

        const fallback = fallbackTrack(filePath)
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
            .catch(() => {
                metadataInFlight.delete(cacheKey)
                return fallback
            })

        metadataInFlight.set(cacheKey, metadataPromise)
        return metadataPromise
    }

    function getTrackDisplayData(filePath) {
        if (!filePath) {
            return fallbackTrack(filePath)
        }

        return metadataCache.get(filePath) || fallbackTrack(filePath)
    }

    async function prewarmMetadataForNextTrack(currentIndex, playlist) {
        if (!Array.isArray(playlist)) {
            return
        }

        const nextFilePath = playlist[currentIndex + 1]
        if (!nextFilePath) {
            return
        }

        resolveTrackMetadata(nextFilePath, { includeImage: false }).catch(() => {})
    }

    async function restoreSavedPlaylist({
        playlist,
        currentTrackIndex,
        playbackPosition,
        currentTrack,
    } = {}) {
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
        const savedTrack =
            currentTrack?.filePath === filePath
                ? { filePath, ...fallbackTrack(filePath), ...currentTrack }
                : null
        state.setPlaylist(normalizedPlaylist)
        state.setCurrentTrack(savedTrack || { filePath, ...fallbackTrack(filePath) })
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
                state.setCurrentTrack(mergeTrackData(filePath, trackData))
            }
        } catch (error) {
            console.error('Failed to restore track metadata:', error)
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

    function clearTrack() {
        if (!currentSound) return
        currentSound.stop()
        currentSound.unload()
        currentSound = null
        stopPlaybackTimers()
        if (state) {
            state.setIsPlaying(false)
            state.setProgress({ currentTime: 0, duration: 0, percent: 0 })
        }
    }

    function playNext({ reason = 'next' } = {}) {
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
            stopPlaybackTimers()
            state.setIsPlaying(false)
            state.setProgress({ currentTime: 0, duration: 0, percent: 0 })
            return
        }
        playTrackAtIndex(nextIndex)
    }

    const AUDIO_TYPE_MAP = {
        '.mp3': { mime: 'audio/mpeg', format: 'mp3' },
        '.wav': { mime: 'audio/wav', format: 'wav' },
    }

    function getAudioType(filePath) {
        const lower = String(filePath || '').toLowerCase()
        for (const [ext, info] of Object.entries(AUDIO_TYPE_MAP)) {
            if (lower.endsWith(ext)) return info
        }
        return { mime: 'application/octet-stream', format: null }
    }

    async function playTrackAtIndex(index, options = {}) {
        if (!state) return
        const { playlist } = state.getState()
        if (index < 0 || index >= playlist.length) return
        const autoplay = options.autoplay !== false
        const addToRecentTracks = options.addToRecentTracks !== false
        const startAtSeconds = Math.max(0, Number(options.startAtSeconds) || 0)

        const filePath = playlist[index]
        const track = metadataCache.get(filePath) || fallbackTrack(filePath)

        const bytes = await readFile(filePath)

        const blob = new Blob([bytes], {
            type: getAudioType(filePath),
        })

        const objectUrl = URL.createObjectURL(blob)

        state.setCurrentTrackIndex(index)
        state.setCurrentTrack(mergeTrackData(filePath, track))

        // Save current track index and playlist
        sessionService?.savePlaylist(playlist, index, startAtSeconds, { filePath, ...track })

        // Add to recent tracks
        if (addToRecentTracks && sessionService?.prependRecentTrack) {
            const recentTrack = {
                filePath,
                title: track.title,
                artist: track.artist,
                album: track.album,
                image: track.image,
                playedAt: new Date().toISOString(),
            }
            sessionService.prependRecentTrack(recentTrack).catch((error) => {
                console.error('Failed to update recent tracks:', error)
            })
        }

        if (currentSound) {
            savePlaybackSnapshot()
            stopPlaybackTimers()
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
            format: [getAudioType(filePath).format],
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
                startPlaybackTimers()
            },
            onpause: () => {
                state.setIsPlaying(false)
                savePlaybackSnapshot()
                stopPlaybackTimers()
            },
            onend: () => playNext({ reason: 'ended' }),
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
                    state.setCurrentTrack(mergeTrackData(expectedFilePath, trackData))
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
            .catch((error) => {
                console.error('Failed to resolve track metadata:', error)
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
        sessionService?.savePlaylist(audioFilePaths, 0, 0, {
            filePath: audioFilePaths[0],
            ...fallbackTrack(audioFilePaths[0]),
        })

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

    function seekTo(seconds) {
        const nextTime = Math.max(0, Number(seconds) || 0)
        const duration = Number(
            currentSound?.duration?.() || state.getState().progress.duration || 0,
        )
        const percent = duration > 0 ? Math.min(100, (nextTime / duration) * 100) : 0

        try {
            if (currentSound && typeof currentSound.seek === 'function') {
                currentSound.seek(nextTime)
            }
        } catch (error) {
            console.error('Seek failed:', error)
        }

        state.setProgress({ currentTime: nextTime, duration, percent })
        savePlaybackSnapshot(nextTime)
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

    window.addEventListener('beforeunload', () => {
        savePlaybackSnapshot()
        stopPlaybackTimers()
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
        playNext,
        playPrevious,
        seekTo,
        setVolume,
        getCurrentSound,
        clearCurrentMusic: clearTrack,
        getTrackDisplayData,
        resolveTrackMetadata,
        restoreSavedPlaylist,
        restoreSavedPlaylistFromStore,
    }
})()
