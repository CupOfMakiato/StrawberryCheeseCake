import { useEffect, useState } from 'react'
// import { open } from '@tauri-apps/plugin-dialog'
import { ChevronDown, ChevronUp, Ellipsis, Play, Trash2 } from 'lucide-react'
import {
    // useNavigate,
    useParams,
} from 'react-router-dom'
import musicPlaceholder from '../assets/IMG_6103.webp'
import { audioService } from '../services/audio-service'
import { sessionService } from '../services/session-service'
import { resolveImageSource } from '../utils/file-path'
import { resolveTrackImage } from '../utils/playlist-media'
// import { normalizeTrackRecord } from '../utils/track-record'

function handleImageError(event) {
    event.currentTarget.src = musicPlaceholder
}

const Playlist = () => {
    const { playlistId } = useParams()
    // const navigate = useNavigate()
    const [playlist, setPlaylist] = useState(null)
    const [name, setName] = useState('')
    const [isRenaming, setIsRenaming] = useState(false)
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        let isMounted = true

        const refresh = async ({ resetName = false } = {}) => {
            const playlists = await sessionService.loadUserPlaylists()
            if (!isMounted) {
                return
            }

            const current = playlists.find((item) => item.id === playlistId) || null
            setPlaylist(current)
            if (resetName) {
                setName(current?.name || '')
                setIsRenaming(false)
            }
            setIsLoading(false)
        }

        refresh({ resetName: true })
        window.addEventListener('user-playlists:updated', refresh)

        return () => {
            isMounted = false
            window.removeEventListener('user-playlists:updated', refresh)
        }
    }, [playlistId])

    async function updatePlaylist(update) {
        setError('')
        setIsSaving(true)

        try {
            const playlists = await sessionService.loadUserPlaylists()
            const index = playlists.findIndex((item) => item.id === playlistId)
            if (index < 0) {
                setError('This playlist no longer exists.')
                return false
            }

            const nextPlaylists = playlists.slice()
            nextPlaylists[index] = {
                ...update(playlists[index]),
                updatedAt: new Date().toISOString(),
            }

            const saved = await sessionService.saveUserPlaylists(nextPlaylists)
            if (!saved) {
                setError('Could not save the playlist.')
            }
            return saved
        } finally {
            setIsSaving(false)
        }
    }

    async function renamePlaylist() {
        const nextName = name.trim()
        if (!nextName) {
            setName(playlist.name)
            setIsRenaming(false)
            return
        }

        if (nextName === playlist.name) {
            setIsRenaming(false)
            return
        }

        if (await updatePlaylist((current) => ({ ...current, name: nextName }))) {
            setName(nextName)
            setIsRenaming(false)
        }
    }

    async function removeTrack(trackIndex) {
        await updatePlaylist((current) => ({
            ...current,
            tracks: current.tracks.filter((_, index) => index !== trackIndex),
        }))
    }

    async function moveTrack(trackIndex, direction) {
        await updatePlaylist((current) => {
            const tracks = current.tracks.slice()
            const destination = trackIndex + direction
            if (destination < 0 || destination >= tracks.length) {
                return current
            }

            const [track] = tracks.splice(trackIndex, 1)
            tracks.splice(destination, 0, track)
            return { ...current, tracks }
        })
    }

    function playFrom(trackIndex = 0) {
        const filePaths = playlist.tracks
            .slice(trackIndex)
            .map((track) => track.filePath)
            .filter(Boolean)
        audioService.startPlaylist(filePaths)
    }

    if (isLoading) {
        return (
            <main className="grid min-h-40 w-full min-w-0 place-items-center rounded-[12px] border border-[#d8dee8] bg-white p-6 text-center text-[#64748b]">
                Loading playlist...
            </main>
        )
    }

    if (!playlist) {
        return (
            <main className="grid min-h-40 w-full min-w-0 place-items-center rounded-[12px] border border-[#d8dee8] bg-white p-6 text-center text-[#64748b]">
                <p>Playlist not found.</p>
            </main>
        )
    }

    const firstTrackImage = playlist.tracks.map((track) => resolveTrackImage(track)).find(Boolean)
    const playlistImage =
        resolveImageSource(playlist.banner || playlist.cover || firstTrackImage) || musicPlaceholder

    return (
        <main className="w-full min-w-0 p-4 text-[#1f2937]">
            <header className="overflow-hidden rounded-[12px] border border-[#d8dee8] bg-white">
                <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-3.5 p-3.5 [@media(max-width:780px)]:grid-cols-[minmax(0,1fr)]">
                    <div className="relative block h-35 w-35 overflow-hidden rounded-[10px] border-0 [@media(max-width:780px)]:h-45 [@media(max-width:780px)]:w-full [@media(max-width:780px)]:max-w-45">
                        <img
                            className="block h-full w-full select-none rounded-[10px] object-cover"
                            src={playlistImage}
                            alt=""
                            draggable={false}
                            onError={handleImageError}
                        />
                    </div>
                    <div className="min-w-0 self-center">
                        <p className="m-0 text-[12px] text-[#667085] uppercase">Playlist</p>
                        {isRenaming ? (
                            <input
                                id="playlist-title"
                                className="my-1 block h-9 w-full max-w-[480px] min-w-0 rounded-[8px] border border-[#d6dbe3] bg-white px-2.25 text-[24px] leading-tight font-semibold text-[#1f2937] focus-visible:border-[#5b8cff] focus-visible:outline-2 focus-visible:outline-[rgba(91,140,255,0.25)] focus-visible:outline-offset-1"
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                onBlur={renamePlaylist}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') {
                                        event.currentTarget.blur()
                                    }
                                }}
                                aria-label="Playlist name"
                                autoFocus
                            />
                        ) : (
                            <h1 className="my-1 max-w-full overflow-hidden text-ellipsis whitespace-nowrap text-[24px] leading-tight font-semibold text-[#1f2937]">
                                <button
                                    className="max-w-full overflow-hidden rounded-[6px] border-0 bg-transparent p-0 text-left text-ellipsis whitespace-nowrap text-inherit [font:inherit] hover:underline focus-visible:outline-2 focus-visible:outline-[#5b8cff] focus-visible:outline-offset-2"
                                    type="button"
                                    onClick={() => {
                                        setError('')
                                        setName(playlist.name)
                                        setIsRenaming(true)
                                    }}
                                    aria-label={`Rename ${playlist.name}`}
                                    title="Rename playlist"
                                >
                                    {playlist.name}
                                </button>
                            </h1>
                        )}
                        <p className="m-0 text-[14px] text-[#475467]">
                            {playlist.tracks.length}{' '}
                            {playlist.tracks.length === 1 ? 'song' : 'songs'}
                        </p>
                    </div>
                </div>
            </header>

            <section
                className="mt-3 flex flex-wrap items-center gap-2"
                aria-label="Playlist controls"
            >
                <button
                    className="inline-flex size-10 min-h-8.5 items-center justify-center gap-1.5 rounded-[8px] border-0 bg-transparent p-0 text-[13px] leading-none text-[#1f2937] [font:inherit] focus-visible:outline-2 focus-visible:outline-[#5b8cff] focus-visible:outline-offset-2 disabled:opacity-45 [&_svg]:size-6 [&_svg]:shrink-0 [&:hover:not(:disabled)]:bg-[#edf2f7]"
                    type="button"
                    disabled={playlist.tracks.length === 0}
                    onClick={() => playFrom()}
                    aria-label="Play all"
                    title="Play all"
                >
                    <Play size={22} aria-hidden="true" />
                </button>
                <button className="inline-flex size-10 min-h-8.5 items-center justify-center gap-1.5 rounded-[8px] border-0 bg-transparent p-0 text-[13px] leading-none text-[#1f2937] [font:inherit] focus-visible:outline-2 focus-visible:outline-[#5b8cff] focus-visible:outline-offset-2 disabled:opacity-45 [&_svg]:size-6 [&_svg]:shrink-0 [&:hover:not(:disabled)]:bg-[#edf2f7]">
                    <Ellipsis size={22} fill="currentColor" aria-hidden="true" />
                </button>
            </section>

            {error ? (
                <p
                    className="mt-3 mb-0 rounded-[8px] border border-[#fda29b] bg-[#fffbfa] px-3 py-2.5 text-[13px] text-[#b42318]"
                    role="alert"
                >
                    {error}
                </p>
            ) : null}

            <section
                className="mt-3.5 overflow-visible rounded-[10px] border border-[#d8dee8] bg-white"
                aria-label="Playlist tracks"
            >
                {playlist.tracks.length === 0 ? (
                    <p className="m-0 px-2.5 py-6 text-center text-[#64748b]">
                        No tracks yet. Use Add tracks to choose MP3 or WAV files.
                    </p>
                ) : (
                    <table className="w-full table-fixed border-collapse [&_td]:h-15 [&_td]:overflow-hidden [&_td]:border-b [&_td]:border-[#edf1f5] [&_td]:px-1.25 [&_td]:py-0 [&_td]:text-center [&_td]:text-[13px] [&_td]:text-ellipsis [&_td]:whitespace-nowrap [&_th]:border-b [&_th]:border-[#edf1f5] [&_th]:p-2.5 [&_th]:text-center [&_th]:text-[13px] [&_th]:font-semibold [&_th]:text-[#1f2937]">
                        <thead className="">
                            <tr>
                                <th className="w-14">#</th>
                                <th className="text-left!">Title</th>
                                <th className="w-1/5 [@media(max-width:480px)]:hidden">Artist</th>
                                <th className="w-1/5 [@media(max-width:680px)]:hidden">Album</th>
                                <th className="w-31 [@media(max-width:680px)]:hidden">
                                    Date Added
                                    <small className="mt-0.5 block text-[11px] font-normal opacity-50">
                                        dd/mm/yyyy
                                    </small>
                                </th>
                                <th className="w-12" aria-label="Actions" />
                            </tr>
                        </thead>
                        <tbody>
                            {playlist.tracks.map((track, index) => {
                                const trackImage =
                                    resolveImageSource(resolveTrackImage(track)) || musicPlaceholder

                                return (
                                    <tr
                                        className="group/row relative z-1 h-15 has-[details[open]]:z-90"
                                        key={track.filePath}
                                    >
                                        <td className="w-14">
                                            <button
                                                className="relative inline-flex size-7.5 items-center justify-center overflow-hidden rounded-[8px] border-0 bg-transparent p-0 leading-none text-[#1f2937] hover:bg-[#edf2f7] focus-visible:outline-2 focus-visible:outline-[#5b8cff] focus-visible:outline-offset-1"
                                                type="button"
                                                onClick={() => playFrom(index)}
                                                aria-label={`Play from ${track.title}`}
                                            >
                                                <span className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-100 transition-opacity duration-140 ease-[ease] group-hover/row:opacity-0 group-focus-within/row:opacity-0">
                                                    {index + 1}
                                                </span>
                                                <Play
                                                    className="pointer-events-none absolute top-1/2 left-1/2 block size-4 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-140 ease-[ease] group-hover/row:opacity-100 group-focus-within/row:opacity-100"
                                                    size={16}
                                                    aria-hidden="true"
                                                />
                                            </button>
                                        </td>
                                        <td className="text-left!">
                                            <div className="flex min-w-0 items-center gap-2.5">
                                                <img
                                                    className="block size-9.5 shrink-0 select-none rounded-[8px] object-cover"
                                                    src={trackImage}
                                                    alt=""
                                                    draggable={false}
                                                    onError={handleImageError}
                                                />
                                                <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[#1f2937]">
                                                    {track.title}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="w-1/5 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[#667085] [@media(max-width:480px)]:hidden">
                                            {track.artist}
                                        </td>
                                        <td className="w-1/5 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[#667085] [@media(max-width:680px)]:hidden">
                                            {track.album}
                                        </td>
                                        <td className="w-31 min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[#667085] [@media(max-width:680px)]:hidden">
                                            {track.addedAt || track.playedAt
                                                ? new Date(
                                                      track.addedAt || track.playedAt,
                                                  ).toLocaleDateString()
                                                : '-'}
                                        </td>
                                        <td className="relative z-2 w-12 overflow-visible! group-has-[details[open]]/row:z-120">
                                            <details
                                                className="group relative z-22 m-0 flex items-center justify-center open:z-100"
                                                name="playlist-track-actions"
                                            >
                                                <summary
                                                    className="pointer-events-none inline-flex size-8.5 list-none items-center justify-center rounded-[8px] border border-[#d6dbe3] bg-white p-0 text-[#1f2937] opacity-0 transition-[opacity,background] duration-140 ease-[ease] group-open:pointer-events-auto group-open:opacity-100 group-hover/row:pointer-events-auto group-hover/row:opacity-100 group-focus-within/row:pointer-events-auto group-focus-within/row:opacity-100 hover:bg-[#f5f7fa] focus-visible:outline-2 focus-visible:outline-[#5b8cff] focus-visible:outline-offset-1 [&::-webkit-details-marker]:hidden [&_svg]:size-4 [@media(hover:none)]:pointer-events-auto [@media(hover:none)]:opacity-100"
                                                    aria-label={`Actions for ${track.title}`}
                                                    title="Track actions"
                                                >
                                                    <Ellipsis size={18} aria-hidden="true" />
                                                </summary>
                                                <div className="absolute top-9.5 right-0 z-110 hidden min-w-47.5 rounded-[8px] border border-[#d9dee7] bg-white p-1.5 shadow-[0_8px_18px_rgba(23,31,56,0.12)] group-open:grid group-open:gap-1.5 [tr:nth-last-child(-n+2)_&]:top-auto [tr:nth-last-child(-n+2)_&]:bottom-9.5">
                                                    <button
                                                        className="flex min-h-8 w-full items-center gap-2 whitespace-nowrap rounded-[6px] border-0 bg-transparent px-2.25 py-1.75 text-left text-[13px] text-[#1f2937] [font:inherit] focus-visible:outline-2 focus-visible:outline-[#5b8cff] focus-visible:-outline-offset-1 disabled:opacity-45 [&:hover:not(:disabled)]:bg-[#f5f7fa]"
                                                        type="button"
                                                        disabled={isSaving || index === 0}
                                                        onClick={() => moveTrack(index, -1)}
                                                    >
                                                        <ChevronUp size={16} aria-hidden="true" />
                                                        Move up
                                                    </button>
                                                    <button
                                                        className="flex min-h-8 w-full items-center gap-2 whitespace-nowrap rounded-[6px] border-0 bg-transparent px-2.25 py-1.75 text-left text-[13px] text-[#1f2937] [font:inherit] focus-visible:outline-2 focus-visible:outline-[#5b8cff] focus-visible:-outline-offset-1 disabled:opacity-45 [&:hover:not(:disabled)]:bg-[#f5f7fa]"
                                                        type="button"
                                                        disabled={
                                                            isSaving ||
                                                            index === playlist.tracks.length - 1
                                                        }
                                                        onClick={() => moveTrack(index, 1)}
                                                    >
                                                        <ChevronDown size={16} aria-hidden="true" />
                                                        Move down
                                                    </button>
                                                    <button
                                                        className="flex min-h-8 w-full items-center 
                                                        gap-2 whitespace-nowrap rounded-[6px] border-0 
                                                        bg-transparent px-2.25 py-1.75 text-left text-[13px] 
                                                        text-[#c9493f] [font:inherit] focus-visible:outline-2 
                                                        focus-visible:outline-[#5b8cff] focus-visible:-outline-offset-1 disabled:opacity-45 [&:hover:not(:disabled)]:bg-[#fef3f2]"
                                                        type="button"
                                                        disabled={isSaving}
                                                        onClick={() => removeTrack(index)}
                                                    >
                                                        <Trash2 size={16} aria-hidden="true" />
                                                        Remove from playlist
                                                    </button>
                                                </div>
                                            </details>
                                        </td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                )}
            </section>
        </main>
    )
}

export default Playlist
