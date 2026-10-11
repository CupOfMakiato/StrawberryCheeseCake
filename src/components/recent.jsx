import { useEffect, useState } from 'react'
import { Ellipsis } from 'lucide-react'
import { audioService } from '../services/audio-service'
import { sessionService } from '../services/session-service'
import MusicArtwork from './music-artwork'
import { FloatingMenu, PlaylistDialog } from './playlist-actions'

const TABS = [
    ['all', 'All'],
    ['playlist', 'Recent Playlists'],
    ['music', 'Recent Music'],
]
const REFRESH_EVENTS = [
    'recent-tracks:updated',
    'recent-folder-playlists:updated',
    'user-playlists:updated',
]

export default function Recent() {
    const [activeTab, setActiveTab] = useState('all')
    const [recentTracks, setRecentTracks] = useState([])
    const [recentPlaylists, setRecentPlaylists] = useState([])
    const [userPlaylists, setUserPlaylists] = useState([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')
    const [menu, setMenu] = useState(null)
    const [dialog, setDialog] = useState(null)

    useEffect(() => {
        let mounted = true
        let version = 0
        async function refresh() {
            const request = ++version
            try {
                const [tracks, folders, playlists] = await Promise.all([
                    sessionService.loadRecentTracks(),
                    sessionService.loadRecentFolderPlaylists(),
                    sessionService.loadUserPlaylists(),
                ])
                if (!mounted || request !== version) return
                setRecentTracks(tracks.filter((track) => track?.filePath))
                setRecentPlaylists(folders.filter((folder) => folder.tracks?.length))
                setUserPlaylists(playlists)
                setMenu(null)
                setError('')
            } catch {
                if (mounted && request === version)
                    setError('Could not load recent items. Please try again.')
            } finally {
                if (mounted && request === version) setIsLoading(false)
            }
        }
        refresh()
        REFRESH_EVENTS.forEach((event) => window.addEventListener(event, refresh))
        return () => {
            mounted = false
            REFRESH_EVENTS.forEach((event) => window.removeEventListener(event, refresh))
        }
    }, [])

    function selectTab(key) {
        setActiveTab(key)
        setMenu(null)
    }

    function toggleMenu(event, item) {
        const anchor = event.currentTarget
        setMenu((previous) => (previous?.anchor === anchor ? null : { anchor, ...item }))
    }

    async function openDialog(kind) {
        const item = menu
        setMenu(null)
        if (kind === 'select') {
            const playlists = await sessionService.loadUserPlaylists()
            setDialog(
                playlists.length
                    ? { kind, ...item, playlists }
                    : {
                          kind: 'notice',
                          message: 'No playlists found. Please create a new playlist first.',
                      },
            )
        } else setDialog({ kind, ...item })
    }

    function renderTracks() {
        if (!recentTracks.length)
            return (
                <p className="noRecentMusic my-[1em] p-5 text-center text-[14px] text-[#667085]">
                    No recently played tracks
                </p>
            )
        return (
            <ul className="recentMusicList m-0 max-h-75 list-none overflow-y-auto p-0">
                {recentTracks.map((track) => (
                    <li
                        className="recentTrack relative z-1 mb-2 flex cursor-pointer gap-3 rounded p-2 transition-[background-color] duration-200 ease-[ease] hover:bg-[#f0f0f0] motion-reduce:transition-none"
                        key={track.filePath}
                    >
                        <button
                            className="recentTrackPlay m-0 flex min-w-0 flex-1 gap-3 border-0 bg-transparent p-0 text-left text-inherit"
                            type="button"
                            aria-label={`Play ${track.title}`}
                            onClick={() => audioService.startSingleTrack(track.filePath)}
                        >
                            <span className="trackCover size-12.5 shrink-0">
                                <MusicArtwork
                                    className="size-full rounded object-cover"
                                    track={track}
                                    alt={track.title}
                                />
                            </span>
                            <span className="trackDetails min-w-0 flex-1">
                                <span className="trackTitle block truncate text-[13px] font-bold">
                                    {track.title}
                                </span>
                                <span className="trackArtist block truncate text-[12px] text-[#666]">
                                    {track.artist}
                                </span>
                            </span>
                        </button>
                        <div className="trackMoreActions relative z-2 ml-2 flex items-start">
                            <button
                                className="trackMoreBtn inline-flex size-8.5 items-center justify-center rounded-lg border border-[#d6dbe3] bg-white font-[Arial,sans-serif] leading-[normal] hover:bg-[#f5f7fa]"
                                type="button"
                                aria-label={`Playlist actions for ${track.title}`}
                                aria-haspopup="menu"
                                aria-expanded={menu?.track?.filePath === track.filePath}
                                onClick={(event) => toggleMenu(event, { track })}
                            >
                                <Ellipsis size={24} aria-hidden="true" />
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
        )
    }

    function renderPlaylists() {
        if (!recentPlaylists.length)
            return (
                <p className="noRecentPlaylists my-[1em] p-5 text-center text-[14px] text-[#667085]">
                    No recent playlists yet. Use Select Folder to create one.
                </p>
            )
        return (
            <ul className="recentPlaylistList m-0 grid max-h-70 list-none gap-2.5 overflow-y-auto p-0">
                {recentPlaylists.map((folder) => (
                    <li
                        className="recentPlaylistCard relative flex items-center gap-2.5 rounded-[10px] border border-[#d9dee7] bg-white p-2.5 max-[780px]:flex-wrap"
                        key={folder.id || folder.folderPath}
                    >
                        <MusicArtwork
                            className="recentPlaylistCover size-13 shrink-0 rounded-lg object-cover"
                            playlist={folder}
                            alt={folder.name}
                        />
                        <div className="recentPlaylistInfo min-w-0 flex-1 max-[420px]:flex-[1_1_140px]">
                            <p className="recentPlaylistName m-0 truncate text-[14px] font-bold">
                                {folder.name}
                            </p>
                            <p className="recentPlaylistMeta mt-0.75 mb-0 text-[12px] text-[#5f6877]">
                                {folder.tracks.length} songs
                            </p>
                        </div>
                        <div className="recentPlaylistActions relative ml-2 inline-flex items-center gap-2 max-[780px]:ml-0 max-[420px]:ml-auto">
                            <button
                                className="recentPlaylistViewBtn min-h-8 rounded-lg border border-[#d6dbe3] bg-white px-2.5 py-0 font-[Arial,sans-serif] text-[12px] leading-[normal] font-semibold text-[#263244] hover:bg-[color-mix(in_srgb,var(--accent-color)_5%,white)]"
                                type="button"
                                onClick={() => setDialog({ kind: 'view', folder })}
                            >
                                View Songs
                            </button>
                            <button
                                className="recentFolderMoreBtn inline-flex size-8.5 items-center justify-center rounded-lg border border-[#d6dbe3] bg-white font-[Arial,sans-serif] leading-[normal] hover:bg-[#f5f7fa]"
                                type="button"
                                aria-label={`Folder playlist actions for ${folder.name}`}
                                aria-haspopup="menu"
                                aria-expanded={menu?.folder?.folderPath === folder.folderPath}
                                onClick={(event) => toggleMenu(event, { folder })}
                            >
                                <Ellipsis size={24} aria-hidden="true" />
                            </button>
                        </div>
                    </li>
                ))}
            </ul>
        )
    }

    const menuItems = menu?.folder
        ? [
              {
                  label: 'Add All to Playlist',
                  className: 'addAllToPlaylistBtn',
                  onSelect: () => openDialog('select'),
              },
              {
                  label: 'Create New Playlist',
                  className: 'createPlaylistFromFolderBtn',
                  onSelect: () => openDialog('create'),
              },
          ]
        : [
              ...(userPlaylists.length
                  ? [
                        {
                            label: 'Add to Playlist',
                            className: 'addToPlaylistBtn',
                            onSelect: () => openDialog('select'),
                        },
                    ]
                  : []),
              {
                  label: 'Create New Playlist',
                  className: 'createPlaylistBtn',
                  onSelect: () => openDialog('create'),
              },
          ]

    return (
        <section className="recentMusic border-t border-[#ccc] p-4">
            <h2 className="m-0 mb-3 text-[16px] font-semibold">Recently Played</h2>
            <div
                className="recentTabs mb-3 flex gap-2 max-[420px]:flex-wrap"
                role="tablist"
                aria-label="Recent views"
            >
                {TABS.map(([key, label], index) => (
                    <button
                        key={key}
                        id={`recent-tab-${key}`}
                        className={`recentTabBtn min-h-9.5 rounded-[10px] border px-1.5 py-0.5 font-[Arial,sans-serif] text-[13px] leading-[normal] font-semibold ${activeTab === key ? 'is-active border-(--accent-color) bg-[color-mix(in_srgb,var(--accent-color)_10%,white)] text-(--accent-color)' : 'border-[#d6dbe3] bg-white text-[#243041] hover:bg-[#f5f7fa]'}`}
                        type="button"
                        role="tab"
                        aria-selected={activeTab === key}
                        aria-controls="recentTabPanel"
                        tabIndex={activeTab === key ? 0 : -1}
                        onClick={() => selectTab(key)}
                        onKeyDown={(event) => {
                            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key))
                                return
                            event.preventDefault()
                            const next =
                                event.key === 'Home'
                                    ? 0
                                    : event.key === 'End'
                                      ? 2
                                      : (index + (event.key === 'ArrowRight' ? 1 : -1) + 3) % 3
                            selectTab(TABS[next][0])
                            document.getElementById(`recent-tab-${TABS[next][0]}`)?.focus()
                        }}
                    >
                        {label}
                    </button>
                ))}
            </div>
            <div
                className="recentTabContent grid gap-3.5"
                id="recentTabPanel"
                role="tabpanel"
                aria-labelledby={`recent-tab-${activeTab}`}
                aria-busy={isLoading}
            >
                {isLoading ? (
                    <p className="recentLoading text-[14px] text-[#667085]" role="status">
                        Loading recent items...
                    </p>
                ) : error ? (
                    <p
                        className="playlistActionError mt-2.5 text-[14px] text-(--hover-color)"
                        role="alert"
                    >
                        {error}
                    </p>
                ) : (
                    <>
                        {activeTab !== 'music' && (
                            <section className="recentSection grid gap-2">
                                {activeTab === 'all' && (
                                    <h3 className="recentSectionTitle m-0 text-[11px] font-bold tracking-[0.08em] text-[#5a6474] uppercase">
                                        Recent Playlists
                                    </h3>
                                )}
                                {renderPlaylists()}
                            </section>
                        )}
                        {activeTab !== 'playlist' && (
                            <section className="recentSection grid gap-2">
                                {activeTab === 'all' && (
                                    <h3 className="recentSectionTitle m-0 text-[11px] font-bold tracking-[0.08em] text-[#5a6474] uppercase">
                                        Recent Music
                                    </h3>
                                )}
                                {renderTracks()}
                            </section>
                        )}
                    </>
                )}
            </div>
            {menu && (
                <FloatingMenu
                    anchor={menu.anchor}
                    className={
                        menu.folder
                            ? 'recentFolderActionsMenu min-w-52.5'
                            : 'trackActionsMenu min-w-47.5'
                    }
                    items={menuItems}
                    onClose={() => setMenu(null)}
                />
            )}
            {dialog && (
                <PlaylistDialog
                    key={dialog.kind}
                    action={dialog}
                    onClose={() => setDialog(null)}
                    onNotice={(message) => setDialog({ kind: 'notice', message })}
                />
            )}
        </section>
    )
}
