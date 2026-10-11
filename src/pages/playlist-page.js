import {
    applyPlaylistStyles,
    createPlaylistLoading,
    createIcons,
    getDataAttributeIndex,
    renderTrackRow,
    canUsePlaylistVirtualizer,
    createPlaylistVirtualizer,
    loadPlaylistVirtualCore,
    createPlaylistScrollController,
} from '../components/playlist/rendering.js'
import { createPlaylistActionsController } from '../components/playlist/interactions.js'
import {
    getPlaylistTrackFilePath,
    isPlaylistDurationPersisting,
    primePlaylistDurationCache,
} from '../services/playlist-duration-cache.js'
import {
    isPlaylistArtworkPersisting,
    primePlaylistArtworkCache,
} from '../services/playlist-artwork-cache.js'
import { attachUndoShortcut, detachUndoShortcut, clearUndo } from '../services/undo-service.js'
import { extractPlaylistFilePaths } from '../utils/playlist-media.js'
import { sessionService } from '../services/session-service.js'
import { audioService } from '../services/audio-service.js'
import { playerState } from '../utils/player-state.js'
import { createPlaylistDurationController } from '../components/playlist/duration.js'
import { createPlaylistArtworkController } from '../components/playlist/artwork.js'
import { createPlaylistHeaderController } from '../components/playlist/header.js'

const PLAYLIST_TRACK_ROW_HEIGHT = 60
const PLAYLIST_TRACK_OVERSCAN = 12
const PLAYLIST_VIRTUAL_ROW_CACHE_LIMIT = 240

function waitForPlaylistSkeletonPaint() {
    if (typeof window.requestAnimationFrame !== 'function') {
        return new Promise((resolve) => window.setTimeout(resolve, 0))
    }
    return new Promise((resolve) => {
        window.requestAnimationFrame(() => window.setTimeout(resolve, 0))
    })
}

export function initializePlaylistPage(root, playlistId) {
    let disposed = false
    let hydrateRun = 0
    const loading = createPlaylistLoading(root)
    applyPlaylistStyles(root)
    createIcons({ nodes: [root] })
    const title = root.querySelector('#' + 'playlistTitle')
    const trackCountElement = root.querySelector('#' + 'playlistTrackCount')
    const durationElement = root.querySelector('#' + 'playlistDuration')
    const image = root.querySelector('#' + 'playlistImage')
    const imageEditButton = root.querySelector('#' + 'playlistImageEditBtn')
    const body = root.querySelector('#' + 'playlistTrackBody')
    const playButton = root.querySelector('#' + 'playlistPlayBtn')
    const trackContainer = root.querySelector('#' + 'playlistTrackContainer')

    if (
        !title ||
        !trackCountElement ||
        !durationElement ||
        !image ||
        !imageEditButton ||
        !body ||
        !playButton ||
        !trackContainer
    ) {
        return
    }

    let playlists = []
    let activePlaylistId = playlistId || null
    let virtualizer = null
    let activeRenderedMode = null
    let paddingTopRow = null
    let paddingBottomRow = null
    const virtualRowCache = new Map()
    let renderedTrackIndexes = new Set()
    let playbackSnapshot = playerState.getState()
    let nowPlayingTrackIndex = -1

    const playlistScroll = createPlaylistScrollController({
        trackContainer,
        image,
        getVirtualizer: () => virtualizer,
        onRender: () => {
            const activePlaylist = getActivePlaylist()
            if (activePlaylist) {
                renderTracks(activePlaylist, 'virtual-change')
            }
        },
    })
    const playlistDuration = createPlaylistDurationController({
        body,
        durationElement,
        getPlaylists: () => playlists,
        getActivePlaylist,
        isTrackRendered: (index) => renderedTrackIndexes.has(index),
        onDurationCellUpdate: (index, duration) => {
            const key = getPlaylistTrackFilePath(getActivePlaylist()?.tracks?.[index])
            const cached = virtualRowCache.get(key)
            if (cached) {
                cached.duration = duration
            }
        },
    })
    const playlistArtwork = createPlaylistArtworkController({
        getActivePlaylist,
        audioService,
    })
    const playlistActions = createPlaylistActionsController({
        body,
        getActivePlaylist,
        getPlaylists: () => playlists,
        onSave: savePlaylistsAndRender,
        onRender: render,
        audioService,
    })
    const playlistHeader = createPlaylistHeaderController({
        title,
        trackCountElement,
        durationElement,
        image,
        imageEditButton,
        getActivePlaylist,
        getPlaylists: () => playlists,
        onSave: savePlaylistsAndRender,
    })

    function showError(message) {
        let alert = root.querySelector('[role=alert]')
        if (!alert) {
            alert = document.createElement('p')
            alert.setAttribute('role', 'alert')
            alert.className = 'mt-3 text-[13px] text-[#b42318]'
            trackContainer.before(alert)
        }
        alert.textContent = message
        alert.hidden = !message
        root.removeAttribute('aria-busy')
    }

    function renderPlayButtonIcon() {
        const existingIcon = playButton.querySelector('i')
        if (existingIcon) {
            existingIcon.setAttribute('data-lucide', 'play')
        }

        createIcons({ nodes: [playButton] })
    }

    function getActivePlaylist() {
        return playlists.find((playlist) => playlist.id === activePlaylistId) || null
    }

    function getNowPlayingTrackIndex(activePlaylist = getActivePlaylist()) {
        const queue = playbackSnapshot?.playlist || []
        const currentPath = getPlaylistTrackFilePath(queue[playbackSnapshot?.currentTrackIndex])
        return currentPath
            ? (activePlaylist?.tracks || []).findIndex(
                  (track) => getPlaylistTrackFilePath(track) === currentPath,
              )
            : -1
    }

    function applyNowPlayingHighlight() {
        body.querySelectorAll('.playlistTrackRow').forEach((row) => {
            const rowTrackIndex = getDataAttributeIndex(row, 'data-track-index')
            const isNowPlaying = rowTrackIndex !== null && rowTrackIndex === nowPlayingTrackIndex

            if (row.classList.contains('isNowPlaying') === isNowPlaying) return
            row.classList.toggle('isNowPlaying', isNowPlaying)
            if (isNowPlaying) {
                row.setAttribute('aria-current', 'true')
            } else {
                row.removeAttribute('aria-current')
            }
        })
    }

    function setActivePlaylistState(nextActivePlaylistId) {
        activePlaylistId = nextActivePlaylistId || null
    }

    async function savePlaylistsAndRender(
        updatedPlaylists,
        {
            activeId = activePlaylistId,
            errorMessage = 'Failed to save playlists',
            renderOptions,
            renderAfterSave = true,
        } = {},
    ) {
        if (disposed) return false
        const saved = await sessionService.saveUserPlaylists(updatedPlaylists)
        if (!saved) {
            console.error(errorMessage)
            showError(errorMessage)
            return false
        }

        if (disposed) return true
        showError('')
        playlists = updatedPlaylists
        setActivePlaylistState(activeId)
        if (renderAfterSave) {
            render(renderOptions)
        }
        return true
    }

    function resetVirtualRows() {
        playlistDuration.cancelPendingDurationCellUpdates()
        playlistArtwork.cancelArtworkHydration()
        virtualRowCache.clear()
        paddingTopRow = null
        paddingBottomRow = null
    }

    function syncBodyChildren(nodes) {
        let cursor = body.firstElementChild

        nodes.forEach((node) => {
            if (cursor === node) {
                cursor = cursor.nextElementSibling
                return
            }

            body.insertBefore(node, cursor)
        })

        while (body.children.length > nodes.length) {
            body.removeChild(body.lastElementChild)
        }
    }

    function renderPaddingRow(className, height) {
        const row = document.createElement('tr')
        row.className = className
        const cell = document.createElement('td')
        cell.className = 'border-0 p-0'
        cell.colSpan = 7
        cell.style.height = `${height}px`
        row.appendChild(cell)
        return row
    }

    function ensurePaddingRow(row, className, height) {
        const paddingRow = row || renderPaddingRow(className, height)
        const cell = paddingRow.firstElementChild
        if (cell?.style.height !== `${height}px`) {
            cell.style.height = `${height}px`
        }
        return paddingRow
    }

    function getCachedVirtualRow({ index, track, duration, rowHeight }) {
        const key = getPlaylistTrackFilePath(track)
        const cached = virtualRowCache.get(key)
        const draggingRow = playlistActions.getDraggingRow()
        if (draggingRow?.dataset.trackId === key) return { node: draggingRow, created: false }
        if (
            cached?.track?.filePath === track?.filePath &&
            cached.duration === duration &&
            cached.rowHeight === rowHeight &&
            cached.track.title === track.title &&
            cached.track.artist === track.artist &&
            cached.track.album === track.album
        ) {
            if (cached.index === index) return { node: cached.node, created: false }
            cached.index = index
            cached.node.setAttribute('data-track-index', String(index))
            cached.node
                .querySelectorAll('[data-track-index]')
                .forEach((el) => el.setAttribute('data-track-index', String(index)))
            cached.node
                .querySelector('[data-duration-index]')
                ?.setAttribute('data-duration-index', String(index))
            cached.node.querySelector('.playlistTrackIndexValue').textContent = String(index + 1)
            cached.node
                .querySelector('.playlistTrackIndexPlayBtn')
                .setAttribute('aria-label', 'Play from track ' + (index + 1))
            return { node: cached.node, created: false }
        }

        const normalizedTrack = playlistArtwork.buildTrackRecordForRender(track)
        const node = renderTrackRow({
            index,
            track,
            normalizedTrack,
            duration,
            rowHeight,
        })
        virtualRowCache.set(key, {
            index,
            track,
            duration,
            rowHeight,
            node,
        })

        return { node, created: true }
    }

    function trimVirtualRowCache(renderedIndexes) {
        if (virtualRowCache.size <= PLAYLIST_VIRTUAL_ROW_CACHE_LIMIT) {
            return
        }

        const rendered = Array.from(renderedIndexes)
        const anchor = rendered.length
            ? Math.round((Math.min(...rendered) + Math.max(...rendered)) / 2)
            : 0

        Array.from(virtualRowCache.keys())
            .filter((key) => !renderedIndexes.has(virtualRowCache.get(key).index))
            .sort(
                (a, b) =>
                    Math.abs(virtualRowCache.get(b).index - anchor) -
                    Math.abs(virtualRowCache.get(a).index - anchor),
            )
            .slice(0, virtualRowCache.size - PLAYLIST_VIRTUAL_ROW_CACHE_LIMIT)
            .forEach((index) => virtualRowCache.delete(index))
    }

    function renderTracks(activePlaylist, reason = 'render') {
        const tracks = activePlaylist?.tracks || []
        if (reason !== 'virtual-change')
            nowPlayingTrackIndex = getNowPlayingTrackIndex(activePlaylist)

        if (!tracks.length) {
            resetVirtualRows()
            renderedTrackIndexes = new Set()
            activeRenderedMode = 'empty'
            body.innerHTML = ''
            const tr = document.createElement('tr')
            const td = document.createElement('td')
            td.colSpan = 7
            td.className = 'playlistEmptyRow'
            td.textContent = 'No tracks in this playlist yet.'
            tr.appendChild(td)
            body.appendChild(tr)
            applyPlaylistStyles(tr)
            applyNowPlayingHighlight()
            if (virtualizer && typeof virtualizer.setOptions === 'function') {
                virtualizer.setOptions({
                    ...virtualizer.options,
                    count: 0,
                })
            }
            return
        }

        if (tracks.length > 80 && canUsePlaylistVirtualizer()) {
            if (activeRenderedMode !== 'virtual') {
                resetVirtualRows()
                activeRenderedMode = 'virtual'
            }

            const scrollMargin = playlistScroll.getScrollMargin({
                force: reason !== 'virtual-change',
            })
            if (!virtualizer) {
                virtualizer = createPlaylistVirtualizer({
                    count: tracks.length,
                    getScrollElement: playlistScroll.getScrollElement,
                    getItemKey: (index) =>
                        getPlaylistTrackFilePath(getActivePlaylist()?.tracks?.[index]),
                    estimateSize: () => PLAYLIST_TRACK_ROW_HEIGHT,
                    overscan: PLAYLIST_TRACK_OVERSCAN,
                    scrollMargin,
                    initialOffset: playlistScroll.getScrollTop,
                    initialRect: {
                        width: trackContainer.clientWidth || window.innerWidth || 0,
                        height: playlistScroll.getViewportHeight(),
                    },
                    onChange: playlistScroll.scheduleRender,
                })
            } else if (typeof virtualizer.setOptions === 'function') {
                const options = virtualizer.options || {}
                if (
                    options.count !== tracks.length ||
                    options.scrollMargin !== scrollMargin ||
                    reason !== 'virtual-change'
                ) {
                    virtualizer.setOptions({
                        ...options,
                        count: tracks.length,
                        scrollMargin,
                        getItemKey: (index) => getPlaylistTrackFilePath(tracks[index]),
                    })
                }
            }

            const virtualItems = virtualizer.getVirtualItems().slice()
            // Sortable requires its source node to survive offscreen AutoScroll.
            const draggingRow = playlistActions.getDraggingRow()
            const draggingIndex = getDataAttributeIndex(draggingRow, 'data-track-index')
            if (
                draggingIndex !== null &&
                !virtualItems.some((item) => item.index === draggingIndex)
            ) {
                virtualItems.push({ index: draggingIndex, size: PLAYLIST_TRACK_ROW_HEIGHT })
                virtualItems.sort((a, b) => a.index - b.index)
            }
            const renderedNodes = []
            const createdRows = []
            const renderedIndexes = new Set()

            const firstVirtualItem = virtualItems[0]
            const lastVirtualItem = virtualItems[virtualItems.length - 1]
            const paddingTop = firstVirtualItem
                ? firstVirtualItem.index * PLAYLIST_TRACK_ROW_HEIGHT
                : 0
            const paddingBottom = lastVirtualItem
                ? (tracks.length - lastVirtualItem.index - 1) * PLAYLIST_TRACK_ROW_HEIGHT
                : 0

            if (paddingTop > 0) {
                paddingTopRow = ensurePaddingRow(paddingTopRow, 'virtual-padding-top', paddingTop)
                renderedNodes.push(paddingTopRow)
            } else {
                paddingTopRow = null
            }

            let previousIndex = firstVirtualItem?.index - 1
            virtualItems.forEach((virtualItem) => {
                const index = virtualItem.index
                if (index > previousIndex + 1) {
                    renderedNodes.push(
                        renderPaddingRow(
                            'virtual-padding-gap',
                            (index - previousIndex - 1) * PLAYLIST_TRACK_ROW_HEIGHT,
                        ),
                    )
                }
                previousIndex = index
                const track = tracks[index]
                const duration = playlistDuration.getTrackDurationFromRecord(track)

                const rowResult = getCachedVirtualRow({
                    index,
                    track,
                    duration,
                    rowHeight: virtualItem.size,
                })
                renderedIndexes.add(index)
                renderedNodes.push(rowResult.node)
                if (rowResult.created) {
                    createdRows.push(rowResult.node)
                }
            })

            if (paddingBottom > 0) {
                paddingBottomRow = ensurePaddingRow(
                    paddingBottomRow,
                    'virtual-padding-bottom',
                    paddingBottom,
                )
                renderedNodes.push(paddingBottomRow)
            } else {
                paddingBottomRow = null
            }

            renderedTrackIndexes = renderedIndexes
            trimVirtualRowCache(renderedIndexes)

            syncBodyChildren(renderedNodes)

            playlistArtwork.applyRowDecorations(createdRows)
            playlistArtwork.scheduleArtworkHydration(renderedNodes)
        } else {
            if (activeRenderedMode !== 'full') {
                resetVirtualRows()
                activeRenderedMode = 'full'
            }

            if (virtualizer?.destroy) {
                virtualizer.destroy()
            }
            virtualizer = null

            const fragment = document.createDocumentFragment()
            const renderedRows = []
            const createdRows = []
            const nextRenderedTrackIndexes = new Set()
            for (let i = 0; i < tracks.length; i++) {
                const track = tracks[i]
                const duration = playlistDuration.getTrackDurationFromRecord(track)
                const { node: row, created } = getCachedVirtualRow({
                    index: i,
                    track,
                    duration,
                })

                renderedRows.push(row)
                if (created) createdRows.push(row)
                nextRenderedTrackIndexes.add(i)
                fragment.appendChild(row)
            }

            renderedTrackIndexes = nextRenderedTrackIndexes
            body.replaceChildren(fragment)
            playlistArtwork.applyRowDecorations(createdRows)
            playlistArtwork.scheduleArtworkHydration(renderedRows)
        }

        applyNowPlayingHighlight()

        if (reason !== 'virtual-change') {
            playlistActions.attach()
        }
    }

    function render({ skipPlaylistArtworkHydration = false, skipTotalDuration = false } = {}) {
        const activePlaylist = getActivePlaylist()
        playlistHeader.render(activePlaylist, { hydrateArtwork: !skipPlaylistArtworkHydration })
        renderTracks(activePlaylist, 'route-render')
        if (skipTotalDuration && !playlistDuration.isResolving()) {
            playlistDuration.cancelTotalDuration()
        } else {
            playlistDuration.renderTotalDuration(activePlaylist)
        }
        renderPlayButtonIcon()
    }

    async function hydrate() {
        try {
            const run = ++hydrateRun
            root.setAttribute('aria-busy', 'true')
            loading.show()
            await waitForPlaylistSkeletonPaint()
            try {
                await loadPlaylistVirtualCore()
            } catch (error) {
                console.error(
                    'Failed to load TanStack Virtual Core; using full playlist render',
                    error,
                )
            }
            const loadedPlaylists = await sessionService.loadUserPlaylists()
            if (disposed || run !== hydrateRun) return

            playlists = Array.isArray(loadedPlaylists) ? loadedPlaylists : []
            primePlaylistDurationCache(playlists)
            primePlaylistArtworkCache(playlists)

            setActivePlaylistState(activePlaylistId)

            render()

            root.removeAttribute('aria-busy')
            loading.hide()
        } catch (err) {
            console.error(err)

            if (!disposed) {
                loading.hide()
                showError('Failed to load playlist')
            }
        }
    }

    playButton.addEventListener('click', () => {
        const activePlaylist = getActivePlaylist()
        const filePaths = extractPlaylistFilePaths(activePlaylist)
        if (!filePaths.length) {
            return
        }

        audioService.startPlaylist(filePaths)
    })

    const onPlaylistsUpdated = () => {
        if (
            playlistActions.isSavingPlaylistOrder() ||
            playlistHeader.isSavingPlaylistImage() ||
            playlistHeader.isSavingPlaylistCover() ||
            playlistHeader.isSavingPlaylistName() ||
            isPlaylistDurationPersisting() ||
            isPlaylistArtworkPersisting()
        ) {
            return
        }
        if (!disposed) {
            hydrate()
        }
    }
    const unsubscribePlayerState = playerState.subscribe((snapshot) => {
        const previousPath = getPlaylistTrackFilePath(
            playbackSnapshot?.playlist?.[playbackSnapshot?.currentTrackIndex],
        )
        playbackSnapshot = snapshot
        const nextPath = getPlaylistTrackFilePath(snapshot?.playlist?.[snapshot?.currentTrackIndex])
        if (previousPath === nextPath) return
        nowPlayingTrackIndex = getNowPlayingTrackIndex()
        applyNowPlayingHighlight()
    })
    window.addEventListener('user-playlists:updated', onPlaylistsUpdated)
    attachUndoShortcut()
    playlistHeader.attachImageEditHandler()
    playlistHeader.attachTitleEditHandler()
    playlistScroll.observe()

    const cleanup = () => {
        disposed = true
        hydrateRun++
        loading.cleanup()
        playlistDuration.cancelTotalDuration()
        playlistArtwork.cancelArtworkHydration()
        if (typeof unsubscribePlayerState === 'function') {
            unsubscribePlayerState()
        }
        window.removeEventListener('user-playlists:updated', onPlaylistsUpdated)
        playlistScroll.cleanup()
        playlistHeader.cleanup()
        detachUndoShortcut()
        clearUndo()
        playlistActions.detach()
        if (virtualizer) {
            virtualizer.destroy?.()
            virtualizer = null
        }
    }

    hydrate()
    return cleanup
}
