import React, { useEffect, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { readDir, stat } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import musicPlaceholder from '../assets/IMG_6103.webp'
import { audioService } from '../services/audio-service'
import { trackMetadataService } from '../services/track-metadata-service'
import { playerState } from '../utils/player-state'
import Recent from '../components/recent'
import { resolveImageSource } from '../utils/file-path'
import { resolveTrackArtwork } from '../utils/artwork'

const Home = () => {
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

    async function selectFile() {
        try {
            const selectedPath = await open({
                title: 'Select an audio file',
                multiple: false,
            })

            if (typeof selectedPath === 'string' && selectedPath) {
                audioService.startSingleTrack(selectedPath)
            }
        } catch (error) {
            console.error('Failed to select audio file:', error)
        }
    }

    async function selectFolder() {
        try {
            const selectedFolder = await open({
                title: 'Select an audio folder',
                directory: true,
                multiple: false,
            })

            if (typeof selectedFolder !== 'string' || !selectedFolder) {
                return
            }

            const entries = await readDir(selectedFolder)
            const fileEntries = await Promise.all(
                entries
                    .filter((entry) => entry?.isFile && entry.name)
                    .map(async (entry) => {
                        const filePath = await join(selectedFolder, entry.name)
                        const fileInfo = await stat(filePath)
                        const addedAt = fileInfo?.birthtime || fileInfo?.mtime || 0

                        return {
                            filePath,
                            addedAt: new Date(addedAt).getTime() || 0,
                        }
                    }),
            )

            audioService.startPlaylist(
                fileEntries.sort((a, b) => a.addedAt - b.addedAt).map((entry) => entry.filePath),
            )
        } catch (error) {
            console.error('Failed to select audio folder:', error)
        }
    }

    return (
        // <div className="loadingOverlay">

        // </div>

        <main className="app-scroll space-y-6">
            <Recent />

            <img
                className="coverImage w-72 h-72 rounded-lg object-cover mb-3"
                src={coverSrc}
                alt="Album cover"
                draggable={false}
            />
            {/* <div className="trackInfo"> */}
            <h2 id="trackTitle" className="mt-2 mb-2 font-semibold text-[1.25rem]">
                {currentTrack.title || 'No track selected'}
            </h2>
            {/* </div> */}
            <p className="trackArtist -mt-1">
                {currentTrack.artist || 'Select a file to start playing'}
            </p>
            <div className="controls gap-2 flex">
                <button
                    className="bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-2 border border-gray-400 rounded shadow"
                    id="selectFile"
                    type="button"
                    onClick={selectFile}
                >
                    Select File
                </button>
                <button
                    className="bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-2 border border-gray-400 rounded shadow"
                    id="selectFolder"
                    type="button"
                    onClick={selectFolder}
                >
                    Select Folder
                </button>
            </div>
        </main>
        // <div className="bottom-player"></div>
    )
}

export default Home
