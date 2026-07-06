import React, { useEffect, useState } from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { readDir, stat } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import musicPlaceholder from '../assets/music-placeholder.png'
import { audioService } from '../services/audio-service'
import { playerState } from '../utils/player-state'
import Recent from '../components/recent'
import { resolveImageSource } from '../utils/file-path'

const Home = () => {
    const [currentTrack, setCurrentTrack] = useState(playerState.getState().currentTrack)

    useEffect(() => {
        const unsubscribe = playerState.subscribe((state) => {
            setCurrentTrack(state.currentTrack)
        })

        return unsubscribe
    }, [])

    async function handleSelectFile() {
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

    const SUPPORTED_AUDIO_EXTENSIONS = ['.mp3', '.wav']

    function isSupportedAudioFile(fileName) {
        if (typeof fileName !== 'string') {
            return false
        }

        const normalizedName = fileName.trim().toLowerCase()
        return SUPPORTED_AUDIO_EXTENSIONS.some((extension) => normalizedName.endsWith(extension))
    }

    async function handleSelectFolder() {
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
            const audioFileInfos = await Promise.all(
                entries
                    .filter((entry) => entry?.isFile && isSupportedAudioFile(entry.name))
                    .map(async (entry) => {
                        const filePath = await join(selectedFolder, entry.name)
                        try {
                            const fileInfo = await stat(filePath)
                            return {
                                filePath,
                                addedAt: fileInfo?.birthtime || fileInfo?.mtime || new Date(0),
                            }
                        } catch (error) {
                            console.error('Failed to stat audio file:', filePath, error)
                            return {
                                filePath,
                                addedAt: new Date(0),
                            }
                        }
                    }),
            )

            const audioPaths = audioFileInfos
                .sort((a, b) => a.addedAt - b.addedAt)
                .map((item) => item.filePath)

            audioService.startPlaylist(audioPaths)
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
                className="coverImage w-72 h-72 rounded-lg object-cover"
                src={resolveImageSource(currentTrack.image) || musicPlaceholder}
                alt="Album cover"
                draggable={false}
            />

            <h2 id="trackTitle" className="mt-2 font-semibold text-[1.25rem]">
                {currentTrack.title || 'No track selected'}
            </h2>
            <p className="trackArtist">{currentTrack.artist || 'Select a file to start playing'}</p>
            <div className="controls gap-2 flex">
                <button
                    className="bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-2 border border-gray-400 rounded shadow"
                    id="selectFile"
                    type="button"
                    onClick={handleSelectFile}
                >
                    Select File
                </button>
                <button
                    className="bg-white hover:bg-gray-100 text-gray-800 font-semibold py-2 px-2 border border-gray-400 rounded shadow"
                    id="selectFolder"
                    type="button"
                    onClick={handleSelectFolder}
                >
                    Select Folder
                </button>
            </div>
        </main>
        // <div className="bottom-player"></div>
    )
}

export default Home
