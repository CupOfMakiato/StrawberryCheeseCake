import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { sessionService } from '../services/session-service'
import { resolvePlaylistTracksMetadata } from '../services/track-metadata-service'
import { normalizeTrackRecord } from '../utils/track-record'
import { musicButtonClasses, musicSurfaceClasses } from './music-ui'

// MusicHub's fixed menus escape scrolling lists, flip above their trigger,
// and dismiss on outside click, scrolling, resize, or Escape.
export function FloatingMenu({ anchor, point, className, items, onClose }) {
    const ref = useRef(null)
    const [position, setPosition] = useState({ left: 8, top: 8 })

    useLayoutEffect(() => {
        const menu = ref.current
        const rect = anchor?.getBoundingClientRect()
        const width = menu.offsetWidth
        const height = menu.offsetHeight
        let left = point?.x ?? rect.right - width
        let top = point?.y ?? rect.bottom + 6
        if (!point && top + height > window.innerHeight - 8) top = rect.top - height - 6
        left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
        top = Math.max(8, Math.min(top, window.innerHeight - height - 8))
        setPosition({ left, top })
        menu.querySelector('button:not(:disabled)')?.focus({ preventScroll: true })
    }, [anchor, point])

    useEffect(() => {
        const outside = (event) => {
            if (!ref.current?.contains(event.target) && !anchor?.contains(event.target)) onClose()
        }
        const dismiss = (event) => {
            if (!ref.current?.contains(event.target)) onClose()
        }
        document.addEventListener('pointerdown', outside)
        document.addEventListener('scroll', dismiss, true)
        window.addEventListener('resize', dismiss)
        return () => {
            document.removeEventListener('pointerdown', outside)
            document.removeEventListener('scroll', dismiss, true)
            window.removeEventListener('resize', dismiss)
        }
    }, [anchor, onClose])

    function handleKeyDown(event) {
        if (event.key === 'Escape') {
            event.preventDefault()
            onClose()
            anchor?.focus({ preventScroll: true })
        } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
            event.preventDefault()
            const buttons = Array.from(ref.current.querySelectorAll('button:not(:disabled)'))
            const current = buttons.indexOf(document.activeElement)
            const index =
                event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? buttons.length - 1
                      : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) %
                        buttons.length
            buttons[index]?.focus({ preventScroll: true })
        } else if (event.key === 'Tab') onClose()
    }

    return createPortal(
        <div
            ref={ref}
            className={`musicContextMenu is-open fixed right-auto bottom-auto z-2200 box-border grid max-w-[calc(100vw-16px)] gap-1.5 rounded-lg border border-[#d9dee7] bg-white p-1.5 shadow-[0_8px_18px_rgba(23,31,56,0.12)] ${musicSurfaceClasses} ${className}`}
            role="menu"
            style={position}
            onKeyDown={handleKeyDown}
        >
            {items.map((item) => (
                <button
                    key={item.label}
                    className={`${musicButtonClasses} text-left ${item.className}`}
                    type="button"
                    role="menuitem"
                    onClick={item.onSelect}
                >
                    {item.label}
                </button>
            ))}
        </div>,
        document.body,
    )
}

// The same dialogs and Notice feedback as the reference. A native dialog
// supplies focus containment and a top layer above the player and menus.
export function PlaylistDialog({ action, onClose, onNotice }) {
    const ref = useRef(null)
    const headingId = useId()
    const descriptionId = useId()
    const inputId = useId()
    const [name, setName] = useState(action.folder?.name || '')
    const [tracks, setTracks] = useState(() =>
        (action.folder?.tracks || [action.track]).map(normalizeTrackRecord).filter(Boolean),
    )
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState('')
    const saving = useRef(false)
    const controller = useRef(null)
    const isFolder = Boolean(action.folder)
    const title =
        action.kind === 'notice'
            ? 'Notice'
            : action.kind === 'view'
              ? action.folder.name
              : action.kind === 'create'
                ? isFolder
                    ? 'Create Playlist From Folder'
                    : 'Create New Playlist'
                : isFolder
                  ? 'Add All To Playlist'
                  : 'Add To Playlist'
    const description =
        action.kind === 'notice'
            ? action.message
            : action.kind === 'view'
              ? `${tracks.length} songs from your selected folder.`
              : action.kind === 'select'
                ? isFolder
                    ? `Add ${tracks.length} tracks from ${action.folder.name}.`
                    : 'Select a playlist for this track.'
                : ''

    useEffect(() => {
        const previousFocus = action.anchor || document.activeElement
        const dialog = ref.current
        dialog.showModal()
        return () => {
            controller.current?.abort()
            dialog.close()
            if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true })
        }
    }, [])

    useEffect(() => {
        if (action.kind !== 'view') return
        const hydration = new AbortController()
        resolvePlaylistTracksMetadata(action.folder.tracks, {
            includeImage: false,
            signal: hydration.signal,
            onTrackResolved: (track, index) =>
                setTracks((previous) => previous.map((item, i) => (i === index ? track : item))),
        }).catch(() => {})
        return () => hydration.abort()
    }, [action])

    async function save(playlist) {
        if (saving.current) return
        saving.current = true
        setIsSaving(true)
        setError('')
        const operation = new AbortController()
        controller.current = operation
        try {
            const resolvedTracks = isFolder
                ? await resolvePlaylistTracksMetadata(action.folder.tracks, {
                      signal: operation.signal,
                  })
                : tracks
            if (operation.signal.aborted) return
            if (!resolvedTracks.length)
                throw new Error('No usable tracks were found. Choose another item.')
            if (action.kind === 'create') {
                const created = await sessionService.createUserPlaylistWithTracks({
                    name,
                    tracks: resolvedTracks,
                })
                if (!created) throw new Error('Could not create the playlist. Please try again.')
                if (!operation.signal.aborted)
                    onNotice(
                        isFolder
                            ? `Created playlist: ${created.name} with ${resolvedTracks.length} songs.`
                            : `Created playlist: ${created.name} and added this track.`,
                    )
            } else {
                const saved = isFolder
                    ? await sessionService.addTracksToUserPlaylist(playlist.id, resolvedTracks)
                    : await sessionService.addTrackToUserPlaylist(playlist.id, resolvedTracks[0])
                if (!saved)
                    throw new Error(
                        `Could not add to playlist: ${playlist.name}. Please try again.`,
                    )
                if (!operation.signal.aborted)
                    onNotice(
                        isFolder
                            ? `Added ${resolvedTracks.length} songs to playlist: ${playlist.name}`
                            : `Added to playlist: ${playlist.name}`,
                    )
            }
        } catch (failure) {
            if (!operation.signal.aborted)
                setError(failure.message || 'Could not save the playlist. Please try again.')
        } finally {
            saving.current = false
            if (!operation.signal.aborted) setIsSaving(false)
        }
    }

    function dismiss() {
        if (!saving.current) onClose()
    }

    return createPortal(
        <dialog
            ref={ref}
            className={`recentModalDialog fixed inset-auto top-1/2 left-1/2 z-1001 m-0 box-content max-h-[calc(100dvh-54px)] w-[min(420px,calc(100vw-54px))] max-w-none -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[10px] border border-[#d8dee8] bg-white p-3.5 shadow-[0_12px_32px_rgba(18,28,47,0.24)] backdrop:bg-[rgba(8,17,36,0.38)] ${musicSurfaceClasses}`}
            aria-labelledby={headingId}
            aria-describedby={description ? descriptionId : undefined}
            onCancel={(event) => {
                event.preventDefault()
                dismiss()
            }}
            onClick={(event) => {
                if (event.target !== event.currentTarget) return
                const bounds = event.currentTarget.getBoundingClientRect()
                if (
                    event.clientX < bounds.left ||
                    event.clientX > bounds.right ||
                    event.clientY < bounds.top ||
                    event.clientY > bounds.bottom
                )
                    dismiss()
            }}
        >
            <h3 className="m-0 text-[18px] font-bold" id={headingId}>
                {title}
            </h3>
            {description && (
                <p className="mt-2 mb-0 text-[14px] text-[#4f5a6a]" id={descriptionId}>
                    {description}
                </p>
            )}
            {action.kind === 'create' && (
                <form
                    onSubmit={(event) => {
                        event.preventDefault()
                        save()
                    }}
                >
                    <label
                        className="recentModalFieldLabel mt-2.5 block text-[13px] text-[#344054]"
                        htmlFor={inputId}
                    >
                        Playlist Name
                    </label>
                    <input
                        id={inputId}
                        className="recentModalInput mt-1.5 box-border w-full cursor-(--cursor-text)! rounded-lg border border-[#ccd5df] px-2.5 py-2.25 caret-(--accent-color)"
                        maxLength={100}
                        placeholder="My Playlist"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        disabled={isSaving}
                        autoFocus
                    />
                    {error && (
                        <p
                            className="playlistActionError mt-2.5 mb-0 text-[14px] text-(--hover-color)"
                            role="alert"
                        >
                            {error}
                        </p>
                    )}
                    <div className="recentModalActions mt-3 flex justify-end gap-2">
                        <button
                            className={`recentModalConfirmBtn ${musicButtonClasses}`}
                            type="submit"
                            disabled={isSaving}
                        >
                            {isSaving ? 'Creating...' : 'Create'}
                        </button>
                        <button
                            className={`recentModalCancelBtn ${musicButtonClasses}`}
                            type="button"
                            disabled={isSaving}
                            onClick={dismiss}
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            )}
            {action.kind === 'select' && (
                <>
                    <div
                        className="recentPlaylistSelectList mt-2.5 grid max-h-55 gap-2 overflow-y-auto"
                        aria-busy={isSaving}
                    >
                        {action.playlists.map((playlist) => (
                            <button
                                key={playlist.id}
                                className={`recentPlaylistSelectBtn flex w-full items-center justify-between gap-2.5 text-left wrap-anywhere ${musicButtonClasses}`}
                                type="button"
                                disabled={isSaving}
                                onClick={() => save(playlist)}
                            >
                                {playlist.name}
                                <span className="shrink-0 text-[12px] opacity-90">
                                    {playlist.tracks.length} songs
                                </span>
                            </button>
                        ))}
                    </div>
                    {isSaving && (
                        <p className="mt-2 mb-0 text-[14px] text-[#4f5a6a]" role="status">
                            Adding tracks...
                        </p>
                    )}
                    {error && (
                        <p
                            className="playlistActionError mt-2.5 mb-0 text-[14px] text-(--hover-color)"
                            role="alert"
                        >
                            {error}
                        </p>
                    )}
                    <div className="recentModalActions mt-3 flex justify-end gap-2">
                        <button
                            type="button"
                            className={`recentModalCancelBtn ${musicButtonClasses}`}
                            disabled={isSaving}
                            onClick={dismiss}
                        >
                            Cancel
                        </button>
                    </div>
                </>
            )}
            {action.kind === 'view' && (
                <ul className="recentModalTrackList mt-2.5 mb-0 grid max-h-60 list-none gap-1.5 overflow-y-auto p-0">
                    {tracks.map((track, index) => (
                        <li
                            className="recentModalTrackRow rounded-lg border border-[#d8dee8] p-2"
                            key={`${track.filePath}-${index}`}
                        >
                            <div className="recentModalTrackTitle truncate text-[13px] font-semibold text-[#1f2937]">
                                {track.title}
                            </div>
                            <div className="recentModalTrackMeta mt-0.75 truncate text-[12px] text-[#4f5a6a]">
                                {track.artist}
                            </div>
                        </li>
                    ))}
                </ul>
            )}
            {['view', 'notice'].includes(action.kind) && (
                <div className="recentModalActions mt-3 flex justify-end gap-2">
                    <button
                        type="button"
                        className={`recentModalConfirmBtn ${musicButtonClasses}`}
                        onClick={dismiss}
                    >
                        {action.kind === 'notice' ? 'OK' : 'Close'}
                    </button>
                </div>
            )}
        </dialog>,
        document.body,
    )
}
