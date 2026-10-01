import { useEffect, useState } from 'react'
import { FolderOpen, Play, Plus, Trash2 } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import musicPlaceholder from '../assets/IMG_6103.webp'
import { audioService } from '../services/audio-service'
import { sessionService } from '../services/session-service'
import { resolveImageSource } from '../utils/file-path'
import { resolveTrackImage } from '../utils/playlist-media'

function handleImageError(event) {
    event.currentTarget.src = musicPlaceholder
}

const Library = () => {
    const navigate = useNavigate()
    const [playlists, setPlaylists] = useState([])
    const [name, setName] = useState('')
    const [isLoading, setIsLoading] = useState(true)
    const [isSaving, setIsSaving] = useState(false)
    const [error, setError] = useState('')

    useEffect(() => {
        let isMounted = true

        const refresh = async () => {
            const stored = await sessionService.loadUserPlaylists()
            if (!isMounted) {
                return
            }

            setPlaylists(Array.isArray(stored) ? stored : [])
            setIsLoading(false)
        }

        refresh()
        window.addEventListener('user-playlists:updated', refresh)

        return () => {
            isMounted = false
            window.removeEventListener('user-playlists:updated', refresh)
        }
    }, [])

    async function createPlaylist(event) {
        event.preventDefault()
        setError('')
        setIsSaving(true)

        try {
            const playlist = await sessionService.createUserPlaylist({ name })
            if (!playlist) {
                setError('Could not create the playlist.')
                return
            }

            setName('')
            navigate(`/playlist/${encodeURIComponent(playlist.id)}`)
        } finally {
            setIsSaving(false)
        }
    }

    async function deletePlaylist(playlist) {
        if (!window.confirm(`Delete "${playlist.name}"?`)) {
            return
        }

        setError('')
        setIsSaving(true)
        try {
            const latest = await sessionService.loadUserPlaylists()
            const saved = await sessionService.saveUserPlaylists(
                latest.filter((item) => item.id !== playlist.id),
            )
            if (!saved) {
                setError('Could not delete the playlist.')
            }
        } finally {
            setIsSaving(false)
        }
    }

    function playPlaylist(playlist) {
        const filePaths = playlist.tracks?.map((track) => track.filePath).filter(Boolean) || []
        audioService.startPlaylist(filePaths)
    }

    return (
        <main className="p-4 [@media(max-width:420px)]:p-3">
            <div className="flex flex-wrap items-start justify-between gap-3 [@media(max-width:420px)]:w-full">
                <header>
                    <h1 className="m-0 text-2xl leading-[1.2] font-bold">Your Library</h1>
                    <p className="mt-1.5 mb-0 text-[#5f6368]">Playlists you created and saved.</p>
                </header>

                <form
                    className="ml-auto flex items-center gap-2 [@media(max-width:420px)]:ml-0 [@media(max-width:420px)]:w-full [@media(max-width:420px)]:flex-wrap"
                    onSubmit={createPlaylist}
                >
                    <label
                        className="text-[13px] font-semibold text-[#5f6368]"
                        htmlFor="playlist-name"
                    >
                        Playlist name
                    </label>
                    <input
                        className="h-8.5 min-w-45 box-border rounded-[8px] border border-[#d6dbe3] bg-white px-2.5 font-[inherit] text-[#1f2937] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b8cff] [@media(max-width:420px)]:min-w-0 [@media(max-width:420px)]:flex-[1_1_160px]"
                        id="playlist-name"
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder={`New Playlist ${playlists.length + 1}`}
                    />
                    <button
                        className="inline-flex min-h-8.5 items-center justify-center gap-1.5 rounded-[8px] border border-[#d6dbe3] bg-white px-2.5 text-[12px] font-semibold text-[#1f2937] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b8cff] disabled:opacity-50 [&:hover:not(:disabled)]:bg-[#edf2f7]"
                        type="submit"
                        disabled={isSaving}
                    >
                        <Plus size={16} aria-hidden="true" />
                        Create playlist
                    </button>
                </form>
            </div>

            {error ? (
                <p className="mt-2.5 mb-0 text-[#8b1e2a]" role="alert">
                    {error}
                </p>
            ) : null}

            {isLoading ? <p className="mt-2.5 mb-0 text-[#667085]">Loading playlists...</p> : null}

            {!isLoading && playlists.length === 0 ? (
                <p className="mt-2.5 mb-0 text-[#667085]">
                    No playlists yet. Create one above to get started.
                </p>
            ) : null}

            <section
                className="relative mt-3.5 grid grid-cols-[repeat(auto-fill,minmax(200px,300px))] justify-start gap-3 [@media(max-width:420px)]:grid-cols-[minmax(0,300px)]"
                aria-label="Saved playlists"
            >
                {playlists.map((playlist) => {
                    const trackCount = Array.isArray(playlist.tracks) ? playlist.tracks.length : 0
                    const firstTrackImage = playlist.tracks
                        ?.map((track) => resolveTrackImage(track))
                        .find(Boolean)
                    const playlistImage =
                        resolveImageSource(playlist.banner || playlist.cover || firstTrackImage) ||
                        musicPlaceholder

                    return (
                        <article
                            className="group flex h-75 w-75 box-border flex-col overflow-hidden rounded-[10px] border border-[#d7dde6] bg-white hover:outline-2 hover:outline-offset-2 hover:outline-[#5b8cff] focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[#5b8cff] [@media(max-width:420px)]:h-auto [@media(max-width:420px)]:w-[min(300px,100%)] [@media(max-width:420px)]:aspect-square"
                            key={playlist.id}
                        >
                            <img
                                className="h-[58%] w-full flex-none object-cover"
                                src={playlistImage}
                                alt=""
                                draggable={false}
                                onError={handleImageError}
                            />
                            <div className="flex min-h-0 flex-auto flex-col gap-2 p-2.5">
                                <h2 className="m-0 text-base leading-tight font-semibold">
                                    <Link
                                        className="block overflow-hidden text-ellipsis whitespace-nowrap text-inherit no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b8cff]"
                                        to={`/playlist/${encodeURIComponent(playlist.id)}`}
                                    >
                                        {playlist.name}
                                    </Link>
                                </h2>
                                <p className="m-0 text-[13px] text-[#5f6368]">
                                    {trackCount} {trackCount === 1 ? 'song' : 'songs'}
                                </p>
                                <div className="mt-auto flex items-end justify-end gap-2">
                                    <Link
                                        className="relative inline-flex h-10 w-10 translate-y-1 items-center justify-center overflow-hidden rounded-[8px] border border-[#d6dbe3] bg-transparent p-0 leading-none text-[#1f2937] invisible opacity-0 transition-[opacity,transform,visibility] duration-160 ease-[ease] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b8cff] group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 [&:hover:not(:disabled)]:bg-[#edf2f7] [@media(hover:none)]:visible [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100 pointer-coarse:visible pointer-coarse:translate-y-0 pointer-coarse:opacity-100"
                                        to={`/playlist/${encodeURIComponent(playlist.id)}`}
                                        aria-label={`Open ${playlist.name}`}
                                        title="Open playlist"
                                    >
                                        <FolderOpen size={18} aria-hidden="true" />
                                    </Link>
                                    <button
                                        className="relative inline-flex h-10 w-10 translate-y-1 items-center justify-center overflow-hidden rounded-[8px] border border-[#d6dbe3] bg-transparent p-0 leading-none text-[#1f2937] invisible opacity-0 transition-[opacity,transform,visibility] duration-160 ease-[ease] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b8cff] group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 disabled:opacity-50 [&:hover:not(:disabled)]:bg-[#edf2f7] [@media(hover:none)]:visible [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100 pointer-coarse:visible pointer-coarse:translate-y-0 pointer-coarse:opacity-100"
                                        type="button"
                                        disabled={trackCount === 0}
                                        onClick={() => playPlaylist(playlist)}
                                        aria-label={`Play ${playlist.name}`}
                                        title="Play playlist"
                                    >
                                        <Play size={18} fill="currentColor" aria-hidden="true" />
                                    </button>
                                    <button
                                        className="relative inline-flex h-10 w-10 translate-y-1 items-center justify-center overflow-hidden rounded-[8px] border border-[#d6dbe3] bg-transparent p-0 leading-none text-[#8b1e2a] invisible opacity-0 transition-[opacity,transform,visibility] duration-160 ease-[ease] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5b8cff] group-hover:visible group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100 disabled:opacity-50 [&:hover:not(:disabled)]:bg-[#fff3f4] [@media(hover:none)]:visible [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100 pointer-coarse:visible pointer-coarse:translate-y-0 pointer-coarse:opacity-100"
                                        type="button"
                                        disabled={isSaving}
                                        onClick={() => deletePlaylist(playlist)}
                                        aria-label={`Delete ${playlist.name}`}
                                        title="Delete playlist"
                                    >
                                        <Trash2 size={18} aria-hidden="true" />
                                    </button>
                                </div>
                            </div>
                        </article>
                    )
                })}
            </section>
        </main>
    )
}

export default Library
