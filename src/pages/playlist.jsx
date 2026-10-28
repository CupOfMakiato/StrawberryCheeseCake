import { useLayoutEffect, useRef } from 'react'
import { useParams } from 'react-router-dom'
import { initializePlaylistPage } from './playlist-page.js'
import musicPlaceholder from '../assets/music-placeholder.png'
import '../components/music-ui.js'

export default function Playlist() {
    const { playlistId } = useParams()
    const host = useRef(null)
    useLayoutEffect(() => {
        // The controller owns dynamic descendants inside this static React layout.
        return initializePlaylistPage(host.current, playlistId)
    }, [playlistId])

    return (
        <main ref={host} className="relative" aria-label="Playlist">
            <section className="playlistPage">
                <header className="playlistHeader">
                    <div className="playlistHeaderBody">
                        <button
                            id="playlistImageEditBtn"
                            className="playlistImageButton"
                            type="button"
                            aria-label="Edit playlist image"
                        >
                            <img
                                id="playlistImage"
                                className="playlistImage"
                                src={musicPlaceholder}
                                alt="Playlist image"
                                draggable={false}
                            />
                            <span className="playlistImageEditIcon" aria-hidden="true">
                                <i data-lucide="pencil-line" />
                            </span>
                        </button>
                        <div className="playlistMeta">
                            <p className="playlistMetaLabel">Playlist</p>
                            <h2 id="playlistTitle">No playlist selected</h2>
                            <p id="playlistSubtitle">
                                <span id="playlistTrackCount">
                                    Choose a playlist from your library.
                                </span>
                                <span id="playlistDuration" />
                            </p>
                        </div>
                    </div>
                </header>

                <section className="playlistControls">
                    <button id="playlistPlayBtn" type="button" aria-label="Play playlist">
                        <i data-lucide="play" />
                    </button>
                    <button id="playlistShuffleBtn" type="button" aria-label="Shuffle playlist">
                        <i data-lucide="shuffle" />
                    </button>
                    <button
                        id="playlistAdvanceOptionsBtn"
                        type="button"
                        aria-label="Advance options"
                    >
                        <i data-lucide="ellipsis" />
                    </button>
                </section>

                <section className="playlistTrackSection" id="playlistTrackContainer">
                    <table className="playlistTrackTable">
                        <thead>
                            <tr>
                                <th>#</th>
                                <th>Title</th>
                                <th>Artist</th>
                                <th>Album</th>
                                <th>
                                    Date Added
                                    <p>dd/mm/yyyy</p>
                                </th>
                                <th>Duration</th>
                                <th />
                            </tr>
                        </thead>
                        <tbody id="playlistTrackBody" />
                    </table>
                </section>
            </section>
        </main>
    )
}
