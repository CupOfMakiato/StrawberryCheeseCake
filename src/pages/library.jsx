import { useEffect, useState } from 'react'
import { Play } from 'lucide-react'
import { Link } from 'react-router-dom'
import { audioService } from '../services/audio-service'
import { sessionService } from '../services/session-service'
import { extractPlaylistFilePaths } from '../utils/playlist-media'
import MusicArtwork from '../components/music-artwork'
import { FloatingMenu } from '../components/playlist-actions'
import { musicSurfaceClasses } from '../components/music-ui'

export default function Library() {
    const [playlists, setPlaylists] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')
    const [menu, setMenu] = useState(null)

    useEffect(() => {
        let mounted = true
        let version = 0
        async function refresh() {
            const request = ++version
            try {
                const stored = await sessionService.loadUserPlaylists()
                if (mounted && request === version) {
                    setPlaylists(stored)
                    setMenu(null)
                }
            } catch {
                if (mounted && request === version)
                    setError('Could not load playlists. Please try again.')
            } finally {
                if (mounted && request === version) setIsLoading(false)
            }
        }
        refresh()
        window.addEventListener('user-playlists:updated', refresh)
        return () => {
            mounted = false
            window.removeEventListener('user-playlists:updated', refresh)
        }
    }, [])

    async function deletePlaylist() {
        const id = menu.playlist.id
        setMenu(null)
        setError('')
        try {
            const latest = await sessionService.loadUserPlaylists()
            if (
                !(await sessionService.saveUserPlaylists(latest.filter((item) => item.id !== id)))
            ) {
                setError('Could not delete the playlist. Please try again.')
            }
        } catch {
            setError('Could not delete the playlist. Please try again.')
        }
    }

    function contextMenu(event, playlist) {
        event.preventDefault()
        const anchor = event.currentTarget.querySelector('a')
        setMenu({ playlist, anchor, point: { x: event.clientX, y: event.clientY } })
    }

    return (
        <main className={`libraryPage p-4 ${musicSurfaceClasses}`}>
            <header className="libraryHeader">
                <h1 className="m-0 text-[24px] leading-[normal] font-bold">Your Library</h1>
                <p className="mt-1.5 mb-4 text-[#5f6368]">
                    Playlists you created from Recent Music.
                </p>
            </header>
            {error && (
                <p
                    className="playlistActionError mt-2.5 text-[14px] text-(--hover-color)"
                    role="alert"
                >
                    {error}
                </p>
            )}
            <section
                className="libraryPlaylists relative mt-3.5 grid grid-cols-[repeat(auto-fill,minmax(200px,300px))] justify-start gap-3 max-[420px]:grid-cols-[minmax(0,302px)]"
                aria-label="Saved playlists"
                aria-busy={isLoading}
            >
                {isLoading ? (
                    <p className="libraryEmpty mt-2.5 text-[16px] text-[#667085]" role="status">
                        Loading playlists...
                    </p>
                ) : !playlists.length ? (
                    <p className="libraryEmpty mt-2.5 text-[16px] text-[#667085]">
                        No playlists yet. Use Recent Music → Create New Playlist.
                    </p>
                ) : (
                    playlists.map((playlist) => (
                        <article
                            className="libraryPlaylistCard group relative box-content flex size-75 aspect-square cursor-pointer flex-col overflow-hidden rounded-[10px] border border-[#d7dde6] bg-white outline-offset-2 hover:outline-2 hover:outline-solid hover:outline-[#5b8cff] focus-within:outline-2 focus-within:outline-solid focus-within:outline-(--accent-color) max-[420px]:max-w-[calc(100%-2px)]"
                            key={playlist.id}
                            onContextMenu={(event) => contextMenu(event, playlist)}
                            onKeyDown={(event) => {
                                if (
                                    event.key !== 'ContextMenu' &&
                                    !(event.shiftKey && event.key === 'F10')
                                )
                                    return
                                const bounds = event.currentTarget.getBoundingClientRect()
                                contextMenu(
                                    {
                                        preventDefault: () => event.preventDefault(),
                                        currentTarget: event.currentTarget,
                                        clientX: bounds.left + 20,
                                        clientY: bounds.top + 20,
                                    },
                                    playlist,
                                )
                            }}
                        >
                            <Link
                                className="libraryPlaylistLink flex min-h-0 flex-1 flex-col text-inherit no-underline"
                                to={`/playlist/${encodeURIComponent(playlist.id)}`}
                                aria-label={`Open playlist ${playlist.name}`}
                            >
                                <MusicArtwork
                                    className="h-[58%] w-full flex-none object-cover"
                                    playlist={playlist}
                                    alt={playlist.name}
                                />
                                <div className="libraryPlaylistContent flex min-h-0 flex-auto flex-col gap-2 p-2.5">
                                    <h2 className="m-0 truncate text-[16px] leading-[normal] font-bold">
                                        {playlist.name}
                                    </h2>
                                    <p className="m-0 text-[13px] text-[#5f6368]">
                                        {playlist.tracks.length} songs
                                    </p>
                                </div>
                            </Link>
                            <div className="libraryPlaylistActions absolute right-2.5 bottom-2.5 mt-auto flex items-end justify-end gap-2">
                                <button
                                    className="playPlaylistBtn invisible relative inline-flex size-10 transform-[translateY(4px)] items-center justify-center overflow-hidden rounded-lg border border-[#d6dbe3] bg-transparent p-0 leading-none text-[#1f2937] opacity-0 transition-[opacity,transform,visibility] duration-160 ease-[ease] group-hover:visible group-hover:transform-[translateY(0)] group-hover:opacity-100 group-focus-within:visible group-focus-within:transform-[translateY(0)] group-focus-within:opacity-100 hover:bg-[#edf2f7] disabled:opacity-40 [@media(hover:none)]:visible [@media(hover:none)]:transform-[translateY(0)] [@media(hover:none)]:opacity-100 motion-reduce:transition-none"
                                    type="button"
                                    aria-label={`Play playlist ${playlist.name}`}
                                    disabled={!playlist.tracks.length}
                                    onClick={() =>
                                        audioService.startPlaylist(
                                            extractPlaylistFilePaths(playlist),
                                        )
                                    }
                                >
                                    <Play size={24} aria-hidden="true" />
                                </button>
                            </div>
                        </article>
                    ))
                )}
            </section>
            {menu && (
                <FloatingMenu
                    anchor={menu.anchor}
                    point={menu.point}
                    className="libraryContextMenu min-w-45"
                    items={[
                        {
                            label: 'Delete Playlist',
                            className:
                                'deletePlaylistMenuBtn border-[#d6dbe3]! hover:bg-[#fff3f4]!',
                            onSelect: deletePlaylist,
                        },
                    ]}
                    onClose={() => setMenu(null)}
                />
            )}
        </main>
    )
}
