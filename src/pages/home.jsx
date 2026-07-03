import React from 'react'
import { open } from '@tauri-apps/plugin-dialog'
import { readDir } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import musicPlaceholder from '../assets/music-placeholder.png'
import { audioService } from '../services/audio-service'

const Home = () => {
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
            const audioPaths = await Promise.all(
                entries.map((entry) => join(selectedFolder, entry.name)),
            )
            audioService.startPlaylist(audioPaths)
        } catch (error) {
            console.error('Failed to select audio folder:', error)
        }
    }

    return (
        // <div className="loadingOverlay">

        // </div>

        <main className="app-scroll">
            <div className="recent-music"></div>
            <img
                className="coverImage w-72 h-72 rounded-lg object-cover"
                src={musicPlaceholder}
                alt="Album cover"
                draggable="false"
            />
            <h2 id="trackTitle">No track selected</h2>
            <p className="trackArtist">Select a file to start playing</p>
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
