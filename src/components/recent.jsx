import React, { useEffect, useState } from 'react'
import musicPlaceholder from '../assets/music-placeholder.png'
import { audioService } from '../services/audio-service'
import { sessionService } from '../services/session-service'
import { extractPlaylistFilePaths, resolvePlaylistImage } from '../utils/playlist-media'
import { resolveTrackArtwork } from '../utils/artwork'
import { resolveImageSource } from '../utils/file-path'

const TAB_KEYS = {
    ALL: 'all',
    TRACKS: 'tracks',
    PLAYLISTS: 'playlists',
}

const Recent = () => {
    const [activeTab, setActiveTab] = useState(TAB_KEYS.ALL)
    const [recentTracks, setRecentTracks] = useState([])
    const [recentPlaylists, setRecentPlaylists] = useState([])
    const [trackImages, setTrackImages] = useState({})
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        let isMounted = true

        async function loadRecentData() {
            setIsLoading(true)
            try {
                const [tracks, playlists] = await Promise.all([
                    typeof sessionService.loadRecentTracks === 'function'
                        ? sessionService.loadRecentTracks()
                        : [],
                    typeof sessionService.loadRecentFolderPlaylists === 'function'
                        ? sessionService.loadRecentFolderPlaylists()
                        : [],
                ])

                if (!isMounted) {
                    return
                }

                const normalizedTracks = Array.isArray(tracks) ? tracks : []
                setRecentTracks(normalizedTracks)
                setRecentPlaylists(Array.isArray(playlists) ? playlists : [])
                hydrateTrackImages(normalizedTracks)
            } catch (error) {
                console.error('Failed to load recent data:', error)
            } finally {
                if (isMounted) {
                    setIsLoading(false)
                }
            }
        }

        async function hydrateTrackImages(tracks) {
            if (!Array.isArray(tracks) || tracks.length === 0) {
                return
            }

            const missingArtwork = tracks.filter(
                (track) => track?.filePath && !track.image && !trackImages[track.filePath],
            )

            await Promise.all(
                missingArtwork.map(async (track) => {
                    try {
                        const artwork = await resolveTrackArtwork(track)
                        if (artwork && track.filePath) {
                            setTrackImages((prev) => ({
                                ...prev,
                                [track.filePath]: artwork,
                            }))
                        }
                    } catch (error) {
                        console.error('Failed to resolve track artwork:', error)
                    }
                }),
            )
        }

        loadRecentData()

        const refreshRecentTracks = () => {
            if (isMounted) {
                loadRecentData()
            }
        }

        window.addEventListener('recent-tracks:updated', refreshRecentTracks)
        window.addEventListener('recent-folder-playlists:updated', refreshRecentTracks)

        return () => {
            isMounted = false
            window.removeEventListener('recent-tracks:updated', refreshRecentTracks)
            window.removeEventListener('recent-folder-playlists:updated', refreshRecentTracks)
        }
    }, [])

    const trackCount = recentTracks.length
    const playlistCount = recentPlaylists.length
    const limitedTracks = recentTracks.slice(0, 6)
    const limitedPlaylists = recentPlaylists.slice(0, 5)
    const showAll = activeTab === TAB_KEYS.ALL
    const showTracks = activeTab === TAB_KEYS.TRACKS
    const showPlaylists = activeTab === TAB_KEYS.PLAYLISTS

    function handlePlayTrack(track) {
        if (track?.filePath) {
            audioService.startSingleTrack(track.filePath)
        }
    }

    function handlePlayPlaylist(playlist) {
        const paths = extractPlaylistFilePaths(playlist)
        if (paths.length > 0) {
            audioService.startPlaylist(paths)
        }
    }

    function renderTabButton(key, label) {
        const isActive = activeTab === key
        return (
            <button
                key={key}
                type="button"
                className={`rounded-full border px-3 py-1 text-sm font-semibold transition-colors ${
                    isActive
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                }`}
                onClick={() => setActiveTab(key)}
            >
                {label}
            </button>
        )
    }

    function renderTrackRow(track, index) {
        const artworkSrc =
            resolveImageSource(track.image || trackImages[track.filePath]) || musicPlaceholder

        return (
            <li
                key={`${track.filePath}-${index}`}
                className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-1 py-1 shadow-sm"
            >
                <img
                    src={artworkSrc}
                    alt={track.title || 'Track cover'}
                    className="h-12 w-12 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-900">
                        {track.title || 'Unknown title'}
                    </div>
                    <div className="truncate text-sm text-slate-500">
                        {track.artist || 'Unknown artist'}
                    </div>
                </div>
            </li>
        )
    }

    function renderPlaylistRow(playlist, index) {
        const artworkSrc = resolveImageSource(resolvePlaylistImage(playlist)) || musicPlaceholder

        return (
            <li
                key={`${playlist.id || playlist.folderPath || index}`}
                className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-2 py-2 shadow-sm"
            >
                <img
                    src={artworkSrc}
                    alt={playlist.name || 'Playlist cover'}
                    className="h-12 w-12 rounded-lg object-cover"
                />
                <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-900">
                        {playlist.name || 'Untitled playlist'}
                    </div>
                    <div className="text-sm text-slate-500">
                        {Array.isArray(playlist.tracks) ? playlist.tracks.length : 0} tracks
                    </div>
                </div>
            </li>
        )
    }

    function renderContent() {
        if (isLoading) {
            return <div className="text-sm text-slate-500">Loading recent items…</div>
        }

        if (showTracks) {
            if (trackCount === 0) {
                return <div className="text-sm text-slate-500">No recent music yet.</div>
            }
            return <ul className="space-y-3">{limitedTracks.map(renderTrackRow)}</ul>
        }

        if (showPlaylists) {
            if (playlistCount === 0) {
                return <div className="text-sm text-slate-500">No recent playlists yet.</div>
            }
            return <ul className="space-y-3">{limitedPlaylists.map(renderPlaylistRow)}</ul>
        }

        return (
            <div className="space-y-4">
                <div className="space-y-2">
                    <p className="text-md font-bold">Recent Playlists</p>
                    {playlistCount === 0 ? (
                        <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                            No recent playlists yet.
                        </div>
                    ) : (
                        <ul className="space-y-3">{limitedPlaylists.map(renderPlaylistRow)}</ul>
                    )}
                </div>

                <div className="space-y-2">
                    <p className="text-md font-bold">Recent Music</p>
                    {trackCount === 0 ? (
                        <div className="mt-3 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                            No recent music yet.
                        </div>
                    ) : (
                        <ul className="space-y-3 gap-1.5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                            {limitedTracks.map(renderTrackRow)}
                        </ul>
                    )}
                </div>
            </div>
        )
    }

    function s(value) {
        return value === 1 ? '' : 's'
    }

    return (
        <section className="recent-music space-y-4 border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-2">
                <div>
                    <p className="text-md font-bold">Recently Played</p>
                </div>

                <div className="flex items-center gap-2 p-1">
                    {renderTabButton(TAB_KEYS.ALL, 'All')}
                    {renderTabButton(TAB_KEYS.PLAYLISTS, 'Recent Playlists')}
                    {renderTabButton(TAB_KEYS.TRACKS, 'Recent Music')}
                </div>
            </div>

            <div className="space-y-4">{renderContent()}</div>
        </section>
    )
}

export default Recent
