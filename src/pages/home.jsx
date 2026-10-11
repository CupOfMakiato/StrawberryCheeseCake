import { useEffect, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import musicPlaceholder from '../assets/music-placeholder.png'
import { audioService } from '../services/audio-service'
import { getOrderedAudioFiles } from '../services/audio-folder-service'
import { sessionService } from '../services/session-service'
import { trackMetadataService } from '../services/track-metadata-service'
import { playerState } from '../utils/player-state'
import Recent from '../components/recent'
import { musicSurfaceClasses } from '../components/music-ui'
import { getBaseName, resolveImageSource } from '../utils/file-path'
import { resolveTrackArtwork } from '../services/artwork-service'

const CurrentTrackPreview = () => {
    const [currentTrack, setCurrentTrack] = useState(playerState.getState().currentTrack)
    const [coverSrc, setCoverSrc] = useState(
        resolveImageSource(playerState.getState().currentTrack.image) || musicPlaceholder,
    )

    useEffect(() => {
        let isMounted = true

        async function restoreSavedCurrentTrack() {
            try {
                const track = await trackMetadataService.restoreSavedCurrentTrack()
                if (isMounted && track?.filePath) {
                    setCurrentTrack(track)
                }
            } catch (error) {
                console.error('Failed to load saved current track:', error)
            }
        }

        const unsubscribe = playerState.subscribe((state) => {
            setCurrentTrack(state.currentTrack)
        })
        restoreSavedCurrentTrack()

        return () => {
            isMounted = false
            unsubscribe()
        }
    }, [])

    useEffect(() => {
        let cancelled = false

        const nextCover = resolveImageSource(currentTrack.image) || musicPlaceholder
        setCoverSrc(nextCover)

        if (!currentTrack?.filePath || currentTrack.image) {
            return () => {
                cancelled = true
            }
        }

        resolveTrackArtwork(currentTrack)
            .then((artwork) => {
                if (!cancelled && artwork) {
                    setCoverSrc(artwork)
                }
            })
            .catch((error) => {
                console.error('Failed to resolve current track artwork:', error)
            })

        return () => {
            cancelled = true
        }
    }, [currentTrack.filePath, currentTrack.image])

    return (
        <>
            <img
                className="homeTrackCover block size-75 max-w-full rounded-lg object-contain"
                src={coverSrc}
                alt="Album cover"
                draggable={false}
                onError={(event) => {
                    event.currentTarget.onerror = null
                    event.currentTarget.src = musicPlaceholder
                }}
            />
            <h2 id="trackTitle" className="my-[0.83em] text-[24px] font-bold">
                {currentTrack.title || 'No track selected'}
            </h2>
            <p className="my-[1em]">{currentTrack.artist || 'Select a file to start playing'}</p>
        </>
    )
}

const Home = () => {
    const [error, setError] = useState('')

    async function selectFile() {
        setError('')
        try {
            const selectedPath = await open({
                title: 'Select an audio file',
                multiple: false,
                filters: [{ name: 'Audio files', extensions: ['mp3', 'wav'] }],
            })

            if (typeof selectedPath === 'string' && selectedPath) {
                audioService.startSingleTrack(selectedPath)
            }
        } catch (error) {
            console.error('Failed to select audio file:', error)
            setError('Could not open the audio file. Please try again.')
        }
    }

    async function selectFolder() {
        setError('')
        try {
            const selectedFolder = await open({
                title: 'Select an audio folder',
                directory: true,
                multiple: false,
            })

            if (typeof selectedFolder !== 'string' || !selectedFolder) {
                return
            }

            const orderedPaths = await getOrderedAudioFiles(selectedFolder)
            const playlistPaths = audioService.startPlaylist(orderedPaths)

            if (!playlistPaths.length) setError('No MP3 or WAV files found. Select another folder.')

            if (playlistPaths.length) {
                await sessionService.prependRecentFolderPlaylist({
                    folderPath: selectedFolder,
                    name: getBaseName(selectedFolder, 'Folder Playlist'),
                    tracks: playlistPaths,
                })
            }
        } catch (error) {
            console.error('Failed to select audio folder:', error)
            setError('Could not open the audio folder. Please try again.')
        }
    }

    return (
        <main className={`homePage ${musicSurfaceClasses}`}>
            <Recent />
            <section className="homeCurrentTrack" aria-label="Current track">
                <CurrentTrackPreview />
            </section>
            <div className="homeFileControls flex gap-1">
                <button
                    className="rounded-xs border-2 border-[ButtonBorder] [border-style:outset] bg-[ButtonFace] px-1.5 py-px font-[Arial,sans-serif] text-[13.3333px] text-[ButtonText] active:[border-style:inset]"
                    id="selectFile"
                    type="button"
                    onClick={selectFile}
                >
                    Select File
                </button>
                <button
                    className="rounded-xs border-2 border-[ButtonBorder] [border-style:outset] bg-[ButtonFace] px-1.5 py-px font-[Arial,sans-serif] text-[13.3333px] text-[ButtonText] active:[border-style:inset]"
                    id="selectFolder"
                    type="button"
                    onClick={selectFolder}
                >
                    Select Folder
                </button>
            </div>
            {error && (
                <p
                    className="playlistActionError mt-2.5 text-[14px] text-(--hover-color)"
                    role="alert"
                >
                    {error}
                </p>
            )}
        </main>
    )
}

export default Home
