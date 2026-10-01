import { useEffect, useMemo, useState } from 'react'
import { Play } from 'lucide-react'
import musicPlaceholder from '../assets/IMG_6103.webp'
import { audioService } from '../services/audio-service'
import { playerState } from '../utils/player-state'
import { resolveTrackArtwork } from '../utils/artwork'
import { DEFAULT_TRACK_ARTIST, DEFAULT_TRACK_TITLE } from '../utils/track-record'
import { resolveImageSource } from '../utils/file-path'

const UPCOMING_LIMIT = 200

function getQueueSnapshot() {
    const { playlist, currentTrackIndex, currentTrack } = playerState.getState()
    return { playlist, currentTrackIndex, currentTrack }
}

function isSameQueueSnapshot(previous, next) {
    return (
        previous.playlist === next.playlist &&
        previous.currentTrackIndex === next.currentTrackIndex &&
        previous.currentTrack?.filePath === next.currentTrack?.filePath &&
        previous.currentTrack?.title === next.currentTrack?.title &&
        previous.currentTrack?.artist === next.currentTrack?.artist &&
        previous.currentTrack?.image === next.currentTrack?.image
    )
}

function getTrackData(filePath, snapshot) {
    const track = audioService.getTrackDisplayData(filePath)
    return snapshot?.currentTrack?.filePath === filePath
        ? { ...track, ...snapshot.currentTrack, filePath }
        : { ...track, filePath }
}

const Queue = () => {
    const [snapshot, setSnapshot] = useState(getQueueSnapshot)
    const [artworkByPath, setArtworkByPath] = useState({})

    useEffect(
        () =>
            playerState.subscribe((nextState) => {
                const nextSnapshot = {
                    playlist: nextState.playlist,
                    currentTrackIndex: nextState.currentTrackIndex,
                    currentTrack: nextState.currentTrack,
                }
                setSnapshot((previous) =>
                    isSameQueueSnapshot(previous, nextSnapshot) ? previous : nextSnapshot,
                )
            }),
        [],
    )

    const playlist = Array.isArray(snapshot.playlist) ? snapshot.playlist : []
    const currentTrackIndex = Number.isInteger(snapshot.currentTrackIndex)
        ? snapshot.currentTrackIndex
        : -1
    const nowPlayingPath = currentTrackIndex >= 0 ? playlist[currentTrackIndex] : ''
    const upcoming = useMemo(() => {
        const start = currentTrackIndex >= 0 ? currentTrackIndex + 1 : 0
        return playlist
            .slice(start, start + UPCOMING_LIMIT)
            .map((filePath, offset) => ({ filePath, index: start + offset }))
    }, [currentTrackIndex, playlist])
    const visibleTracks = useMemo(
        () => [
            ...(nowPlayingPath ? [{ filePath: nowPlayingPath, index: currentTrackIndex }] : []),
            ...upcoming,
        ],
        [currentTrackIndex, nowPlayingPath, upcoming],
    )

    useEffect(() => {
        let cancelled = false
        const missing = visibleTracks.filter(
            ({ filePath }) =>
                filePath &&
                !artworkByPath[filePath] &&
                !resolveImageSource(getTrackData(filePath, snapshot).image),
        )

        async function hydrateArtwork() {
            for (const { filePath } of missing) {
                try {
                    const artwork = await resolveTrackArtwork({ filePath })
                    if (!cancelled && artwork) {
                        setArtworkByPath((prev) => ({ ...prev, [filePath]: artwork }))
                    }
                } catch (error) {
                    console.error('Failed to resolve queue artwork:', error)
                }
            }
        }

        hydrateArtwork()

        return () => {
            cancelled = true
        }
    }, [visibleTracks, snapshot, artworkByPath])

    function renderQueueItem({ filePath, index, active = false }) {
        const track = getTrackData(filePath, snapshot)
        const title = track.title || DEFAULT_TRACK_TITLE
        const artist = track.artist || DEFAULT_TRACK_ARTIST
        const coverSrc =
            resolveImageSource(track.image || artworkByPath[filePath]) || musicPlaceholder

        return (
            <li
                key={`${filePath}-${index}`}
                className={`group flex items-center gap-3 rounded-lg border px-3 py-2.5 shadow-sm ${
                    active ? 'border-[#d5194b] bg-rose-50' : 'border-slate-200 bg-white'
                }`}
            >
                <button
                    type="button"
                    aria-label={`Play ${title}`}
                    className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100"
                    onClick={() => audioService.playTrackAtIndex(index)}
                >
                    <img
                        src={coverSrc}
                        alt=""
                        className="h-full w-full object-cover"
                        draggable={false}
                    />
                    <span className="absolute inset-0 flex items-center justify-center bg-slate-950/55 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
                        <Play size={17} fill="currentColor" aria-hidden="true" />
                    </span>
                </button>

                <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => audioService.playTrackAtIndex(index)}
                >
                    <div className="truncate text-sm font-semibold text-slate-900">{title}</div>
                    <div className="truncate text-xs text-slate-500">{artist}</div>
                </button>
            </li>
        )
    }

    return (
        <main className="app-scroll space-y-5 pb-4">
            <header>
                <h2 className="text-2xl font-semibold text-slate-950">Play Queue</h2>
                <p className="mt-1 text-sm text-slate-500">
                    Current play order from your active session.
                </p>
            </header>

            {playlist.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-5 text-sm text-slate-500">
                    No tracks in queue yet. Play a playlist, folder to see the queue pops.
                </div>
            ) : (
                <>
                    <section className="space-y-2">
                        <h3 className="text-sm font-semibold text-slate-900">Now playing</h3>
                        <ul className="space-y-2">
                            {nowPlayingPath ? (
                                renderQueueItem({
                                    filePath: nowPlayingPath,
                                    index: currentTrackIndex,
                                    active: true,
                                })
                            ) : (
                                <li className="text-sm text-slate-500">
                                    No track is currently selected.
                                </li>
                            )}
                        </ul>
                    </section>

                    <section className="space-y-2">
                        <h3 className="text-sm font-semibold text-slate-900">Next up</h3>
                        {upcoming.length ? (
                            <ul className="space-y-2">{upcoming.map(renderQueueItem)}</ul>
                        ) : (
                            <div className="text-sm text-slate-500">No upcoming tracks.</div>
                        )}
                    </section>
                </>
            )}
        </main>
    )
}

export default Queue
