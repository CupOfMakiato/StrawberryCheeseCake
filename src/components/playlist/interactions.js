import { getDataAttributeIndex, cursorClasses } from './rendering.js'
import Sortable from 'sortablejs'
import { pushUndo } from '../../services/undo-service.js'

// Sortable drag-and-drop implementation
// using sortablejs for drag-and-drop reordering of playlist tracks


function isValidTrackIndex(index, tracks) {
    return Number.isInteger(index) && index >= 0 && index < tracks.length
}

function hasUniqueValidTrackIndices(indices, tracks) {
    if (!Array.isArray(indices) || indices.length !== tracks.length) return false

    const uniqueIndices = new Set(indices)
    return (
        uniqueIndices.size === indices.length &&
        indices.every((index) => isValidTrackIndex(index, tracks))
    )
}

export function createPlaylistSortable({ body, getActivePlaylist, getPlaylists, onReorder } = {}) {
    if (!body) return { destroy: () => {} }
    if (typeof Sortable !== 'function') return { destroy: () => {} }

    let sortable = null
    let draggingRow = null
    let insertion = null
    let cancelled = false
    let destroying = false
    const onKeyDown = (event) => {
        if (event.key === 'Escape' && draggingRow) {
            cancelled = true
            sortable?._onDrop(new Event('mouseup', { bubbles: true }))
        }
    }
    document.addEventListener('keydown', onKeyDown)
    const setDraggingCursor = (isDragging) => {
        document.documentElement?.classList.toggle(cursorClasses.grabbing, Boolean(isDragging))
        document.body?.classList.toggle(cursorClasses.grabbing, Boolean(isDragging))
    }

    try {
        sortable = Sortable.create(body, {
            animation: 150,
            dataIdAttr: 'data-track-id',
            draggable: 'tr.playlistTrackRow',
            filter: 'button, a, input, textarea, select, .playlistTrackMenu, .playlistTrackActions',
            forceFallback: true,
            fallbackClass: 'playlistTrackRow--fallbackDragging',
            fallbackOnBody: true,
            preventOnFilter: true,
            ghostClass: 'playlistTrackRow--dragging',
            onStart: (event) => {
                draggingRow = event.item
                insertion = null
                cancelled = false
                setDraggingCursor(true)
                try {
                    const interactive = body.querySelectorAll(
                        '.playlistTrackIndexPlayBtn, .playlistTrackMoreBtn',
                    )
                    interactive.forEach((el) => {
                        try {
                            el.disabled = true
                        } catch (e) {
                            void e
                        }
                    })
                } catch (e) {
                    console.error('Error disabling interactive elements for drag', e)
                }
            },
            onMove: (event) => {
                if (event.related?.matches('.playlistTrackRow')) {
                    insertion = { id: event.related.dataset.trackId, after: event.willInsertAfter }
                }
            },
            onEnd: (evt) => {
                draggingRow = null
                setDraggingCursor(false)
                if (destroying) return
                try {
                    try {
                        const interactive = body.querySelectorAll(
                            '.playlistTrackIndexPlayBtn, .playlistTrackMoreBtn',
                        )
                        interactive.forEach((el) => {
                            try {
                                el.disabled = false
                            } catch (e) {
                                void e
                            }
                        })
                    } catch (e) {
                        console.error('Error re-enabling interactive elements after drag', e)
                    }

                    const activePlaylist = getActivePlaylist()
                    if (!activePlaylist || !Array.isArray(activePlaylist.tracks)) return
                    const drop = evt.originalEvent
                    const rect = body.getBoundingClientRect()
                    const outside =
                        drop &&
                        Number.isFinite(drop.clientX) &&
                        (drop.clientX < rect.left ||
                            drop.clientX > rect.right ||
                            drop.clientY < Math.max(0, rect.top) ||
                            drop.clientY > Math.min(window.innerHeight, rect.bottom))
                    if (cancelled || outside) {
                        onReorder(getPlaylists(), { cancelled: true })
                        return
                    }

                    const rows = Array.from(body.querySelectorAll('tr.playlistTrackRow'))

                    // Try fast path: if DOM contains all rows, rebuild order directly
                    const visibleIndices = rows
                        .map((row) => getDataAttributeIndex(row, 'data-track-index'))
                        .filter((v) => v !== null)

                    let newTracks = null

                    const buildMovedTracks = () => {
                        // Virtualized list: compute new order by moving the dragged item in the full array
                        const sourceIndex = getDataAttributeIndex(evt.item, 'data-track-index')

                        if (!isValidTrackIndex(sourceIndex, activePlaylist.tracks)) {
                            console.warn('Could not determine source index after drag')
                            return null
                        }

                        const newIndexInRows = rows.indexOf(evt.item)
                        if (newIndexInRows === -1) {
                            console.warn('Could not determine dragged row position after drag')
                            return null
                        }

                        // Determine global insertion index
                        let insertionGlobal = null

                        // A scroll render can restore DOM order during dragging.
                        // Remember Sortable's global target, never its viewport index.
                        if (insertion) {
                            const target = activePlaylist.tracks.findIndex(
                                (track) => track.filePath === insertion.id,
                            )
                            if (target >= 0) insertionGlobal = target + Number(insertion.after)
                        }

                        const nextRow = rows[newIndexInRows + 1]
                        if (insertionGlobal !== null) {
                            // Use the target recorded by Sortable above.
                        } else if (nextRow) {
                            const nextGlobal = getDataAttributeIndex(nextRow, 'data-track-index')
                            if (!isValidTrackIndex(nextGlobal, activePlaylist.tracks)) {
                                console.warn('Could not determine valid next row index after drag')
                                return null
                            }
                            insertionGlobal = nextGlobal
                        } else {
                            const prevRow = rows[newIndexInRows - 1]
                            if (prevRow) {
                                const prevGlobal = getDataAttributeIndex(
                                    prevRow,
                                    'data-track-index',
                                )
                                if (!isValidTrackIndex(prevGlobal, activePlaylist.tracks)) {
                                    console.warn(
                                        'Could not determine valid previous row index after drag',
                                    )
                                    return null
                                }
                                insertionGlobal = prevGlobal + 1
                            }
                        }

                        // Fallback: if still null, append to end
                        if (insertionGlobal === null) insertionGlobal = activePlaylist.tracks.length
                        if (
                            !Number.isInteger(insertionGlobal) ||
                            insertionGlobal < 0 ||
                            insertionGlobal > activePlaylist.tracks.length
                        ) {
                            console.warn('Reorder produced invalid insertion index - aborting save')
                            return null
                        }

                        // Build new tracks by moving sourceIndex -> insertionGlobal
                        const copy = activePlaylist.tracks.slice()
                        const [moved] = copy.splice(sourceIndex, 1)
                        if (moved === undefined) {
                            console.warn('Reorder produced an empty moved track - aborting save')
                            return null
                        }
                        let destIndex = insertionGlobal
                        if (sourceIndex < destIndex) destIndex--
                        if (destIndex < 0) destIndex = 0
                        if (destIndex > copy.length) destIndex = copy.length
                        copy.splice(destIndex, 0, moved)
                        return copy
                    }

                    if (visibleIndices.length === activePlaylist.tracks.length) {
                        if (hasUniqueValidTrackIndices(visibleIndices, activePlaylist.tracks)) {
                            newTracks = visibleIndices.map((idx) => activePlaylist.tracks[idx])
                        } else {
                            console.warn(
                                'Invalid visible track indices after drag - falling back to move reorder',
                            )
                            newTracks = buildMovedTracks()
                        }
                    } else {
                        newTracks = buildMovedTracks()
                    }

                    if (
                        !Array.isArray(newTracks) ||
                        newTracks.length !== activePlaylist.tracks.length ||
                        newTracks.some((track) => track === undefined)
                    ) {
                        console.warn('Reorder produced mismatched track count - aborting save')
                        return
                    }

                    const updatedPlaylists = getPlaylists().map((playlist) => {
                        if (playlist.id !== activePlaylist.id) return playlist
                        return {
                            ...playlist,
                            tracks: newTracks,
                            updatedAt: new Date().toISOString(),
                        }
                    })

                    if (typeof onReorder === 'function') {
                        try {
                            onReorder(updatedPlaylists)
                        } catch (e) {
                            console.error('Error in onReorder callback', e)
                        }
                    }
                } catch (err) {
                    console.error('Error while handling playlist reorder', err)
                }
            },
        })
    } catch (err) {
        console.error('Failed to initialize Sortable', err)
    }

    return {
        getDraggingRow: () => draggingRow,
        destroy() {
            destroying = true
            if (draggingRow) sortable?._onDrop(new Event('mouseup', { bubbles: true }))
            document.removeEventListener('keydown', onKeyDown)
            setDraggingCursor(false)
            if (sortable && typeof sortable.destroy === 'function') {
                try {
                    sortable.destroy()
                } catch (e) {
                    console.error('Failed to destroy Sortable instance', e)
                }
            }
            sortable = null
        },
    }
}

// Delegated row actions and reorder persistence
const REORDER_RENDER_OPTIONS = {
    skipPlaylistArtworkHydration: true,
    skipTotalDuration: true,
}

export function createPlaylistActionsController({
    body,
    getActivePlaylist,
    getPlaylists,
    onSave,
    onRender,
    audioService,
} = {}) {
    let cleanupTrackActions = null
    let sortableInstance = null
    let trackActionsDelegated = false
    let isSavingPlaylistOrder = false

    function closeAllTrackMenus() {
        body.querySelectorAll('.playlistTrackMenu.is-open').forEach((menu) => {
            menu.classList.remove('is-open')
            menu.closest('.playlistTrackActions')?.classList.remove('is-menu-open')
            menu.closest('.playlistTrackActionsCell')?.classList.remove('is-menu-open')
            menu.closest('.playlistTrackRow')?.classList.remove('is-menu-open')
        })
    }

    function attachTrackActionHandlers() {
        if (trackActionsDelegated) return

        const onBodyClick = async (event) => {
            const menuButton = event.target.closest('.playlistTrackMoreBtn')
            if (menuButton && body.contains(menuButton)) {
                event.stopPropagation()
                event.preventDefault()

                const trackIndex = getDataAttributeIndex(menuButton, 'data-track-index')
                if (trackIndex === null) {
                    return
                }

                const menu = body.querySelector(
                    `.playlistTrackMenu[data-track-index="${trackIndex}"]`,
                )
                if (!menu) {
                    return
                }

                const isOpen = menu.classList.contains('is-open')
                closeAllTrackMenus()
                if (!isOpen) {
                    menu.classList.add('is-open')
                    menu.closest('.playlistTrackActions')?.classList.add('is-menu-open')
                    menu.closest('.playlistTrackActionsCell')?.classList.add('is-menu-open')
                    menu.closest('.playlistTrackRow')?.classList.add('is-menu-open')
                }
                return
            }

            const removeButton = event.target.closest('.removeTrackBtn')
            if (removeButton && body.contains(removeButton)) {
                event.stopPropagation()
                event.preventDefault()

                const trackIndex = getDataAttributeIndex(removeButton, 'data-track-index')
                const activePlaylist = getActivePlaylist?.()
                if (!activePlaylist || trackIndex === null) {
                    return
                }

                const nextTracks = Array.isArray(activePlaylist.tracks)
                    ? activePlaylist.tracks.filter((_, index) => index !== trackIndex)
                    : []

                const updatedPlaylists = (getPlaylists?.() || []).map((playlist) => {
                    if (playlist.id !== activePlaylist.id) {
                        return playlist
                    }

                    return {
                        ...playlist,
                        tracks: nextTracks,
                        updatedAt: new Date().toISOString(),
                    }
                })

                await onSave?.(updatedPlaylists, {
                    activeId: activePlaylist.id,
                    errorMessage: 'Failed to save updated playlists when removing track',
                })
                return
            }

            const playButton = event.target.closest('.playlistTrackIndexPlayBtn')
            if (playButton && body.contains(playButton)) {
                event.stopPropagation()
                event.preventDefault()

                const trackIndex = getDataAttributeIndex(playButton, 'data-track-index')
                const activePlaylist = getActivePlaylist?.()
                if (!activePlaylist || trackIndex === null) {
                    return
                }

                const queueFilePaths = Array.isArray(activePlaylist.tracks)
                    ? activePlaylist.tracks
                          .slice(trackIndex)
                          .map((track) => track?.filePath)
                          .filter(Boolean)
                    : []

                if (queueFilePaths.length) {
                    audioService.startPlaylist(queueFilePaths)
                }
            }
        }

        const onDocumentClick = () => {
            closeAllTrackMenus()
        }
        const onKeyDown = (event) => {
            if (event.key === 'Escape') closeAllTrackMenus()
        }

        body.addEventListener('click', onBodyClick)
        document.addEventListener('click', onDocumentClick)
        document.addEventListener('keydown', onKeyDown)
        cleanupTrackActions = () => {
            body.removeEventListener('click', onBodyClick)
            document.removeEventListener('click', onDocumentClick)
            document.removeEventListener('keydown', onKeyDown)
            trackActionsDelegated = false
        }
        trackActionsDelegated = true
    }

    function initializeSortableIfNeeded() {
        if (!body) return

        if (sortableInstance) return

        if (typeof createPlaylistSortable !== 'function') return

        try {
            sortableInstance = createPlaylistSortable({
                body,
                getActivePlaylist,
                getPlaylists,
                onReorder: async (updatedPlaylists, { cancelled = false } = {}) => {
                    if (cancelled) {
                        onRender?.(REORDER_RENDER_OPTIONS)
                        return
                    }
                    const previousPlaylists = (getPlaylists?.() || []).map((p) => ({
                        ...p,
                        tracks: Array.isArray(p.tracks) ? p.tracks.slice() : p.tracks,
                    }))
                    const activePlaylist = getActivePlaylist?.()

                    isSavingPlaylistOrder = true
                    try {
                        const saved = await onSave?.(updatedPlaylists, {
                            activeId: activePlaylist?.id,
                            errorMessage: 'Failed to save reordered playlist',
                            renderOptions: REORDER_RENDER_OPTIONS,
                        })
                        if (!saved) {
                            onRender?.(REORDER_RENDER_OPTIONS)
                            return
                        }

                        pushUndo(
                            async () => {
                                isSavingPlaylistOrder = true
                                try {
                                    const undone = await onSave?.(previousPlaylists, {
                                        activeId: activePlaylist?.id,
                                        errorMessage: 'Failed to undo playlist reorder',
                                        renderOptions: REORDER_RENDER_OPTIONS,
                                    })
                                    if (!undone) {
                                        return
                                    }
                                } catch (err) {
                                    console.error('Error while undoing playlist reorder', err)
                                } finally {
                                    isSavingPlaylistOrder = false
                                }
                            },
                            { label: 'Undo playlist reorder' },
                        )
                    } catch (e) {
                        console.error('Failed to save reordered playlist', e)
                        onRender?.(REORDER_RENDER_OPTIONS)
                        return
                    } finally {
                        isSavingPlaylistOrder = false
                    }
                },
            })
        } catch (err) {
            console.error('Failed to initialize Sortable', err)
        }
    }

    function attach() {
        attachTrackActionHandlers()
        initializeSortableIfNeeded()
    }

    function detach() {
        if (typeof cleanupTrackActions === 'function') {
            cleanupTrackActions()
            cleanupTrackActions = null
        }

        if (sortableInstance && typeof sortableInstance.destroy === 'function') {
            try {
                sortableInstance.destroy()
            } catch (e) {
                console.error('Failed to destroy Sortable instance during cleanup', e)
            }
            sortableInstance = null
        }
    }

    return {
        getDraggingRow: () => sortableInstance?.getDraggingRow?.() || null,
        attach,
        detach,
        closeAllTrackMenus,
        isSavingPlaylistOrder: () => isSavingPlaylistOrder,
    }
}
