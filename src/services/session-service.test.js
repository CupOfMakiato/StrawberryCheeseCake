import assert from 'node:assert/strict'
import test from 'node:test'

test('user playlists persist normalized, deduplicated tracks in order', async () => {
    const previousWindow = globalThis.window
    const storage = new Map()

    globalThis.window = {
        localStorage: {
            getItem: (key) => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, value),
        },
        dispatchEvent: () => true,
    }

    try {
        storage.set(
            'strawberry-cheesecake:user-playlists',
            JSON.stringify([
                {
                    name: 'Legacy',
                    cover: 'data:image/png;base64,discard-me',
                    tracks: ['C:\\Music\\legacy.mp3', 'C:\\Music\\legacy.mp3'],
                },
            ]),
        )

        const { sessionService } = await import('./session-service.js')
        const [legacy] = await sessionService.loadUserPlaylists()
        assert.match(legacy.id, /^playlist-/)
        assert.equal(legacy.cover, '')
        assert.equal(legacy.tracks.length, 1)
        assert.equal((await sessionService.loadUserPlaylists())[0].id, legacy.id)

        const playlist = await sessionService.createUserPlaylist({ name: 'Road Trip' })

        assert.equal(playlist.name, 'Road Trip')
        assert.deepEqual(
            (await sessionService.loadUserPlaylists()).map((item) => item.name),
            ['Road Trip', 'Legacy'],
        )
        assert.equal(
            await sessionService.addTracksToUserPlaylist(playlist.id, [
                { filePath: 'C:\\Music\\one.mp3', title: 'One' },
                { filePath: 'C:\\Music\\one.mp3', title: 'Duplicate' },
                'C:\\Music\\two.wav',
            ]),
            true,
        )

        const storedPlaylist = (await sessionService.loadUserPlaylists()).find(
            (item) => item.id === playlist.id,
        )
        assert.deepEqual(
            storedPlaylist.tracks.map((track) => track.filePath),
            ['C:\\Music\\one.mp3', 'C:\\Music\\two.wav'],
        )
        assert.equal(storedPlaylist.tracks[0].title, 'One')

        storedPlaylist.tracks.reverse()
        assert.equal(await sessionService.saveUserPlaylists([storedPlaylist]), true)
        assert.deepEqual(
            (await sessionService.loadUserPlaylists())[0].tracks.map((track) => track.filePath),
            ['C:\\Music\\two.wav', 'C:\\Music\\one.mp3'],
        )
    } finally {
        if (previousWindow === undefined) {
            delete globalThis.window
        } else {
            globalThis.window = previousWindow
        }
    }
})

test('creating from Recent saves selected tracks, cover, and failures without a partial playlist', async () => {
    const storage = new Map()
    const previousWindow = globalThis.window
    const originalError = console.error
    globalThis.window = {
        localStorage: {
            getItem: (key) => storage.get(key) ?? null,
            setItem: (key, value) => storage.set(key, value),
        },
        dispatchEvent: () => true,
    }
    try {
        const { sessionService } = await import('./session-service.js')
        const track = { filePath: 'C:\\Music\\one.mp3', title: 'One', image: 'C:/Artwork/one.webp' }
        const created = await sessionService.createUserPlaylistWithTracks({
            name: '  From Recent  ',
            tracks: [track, track, 'C:\\Music\\two.wav'],
        })
        assert.equal(created.name, 'From Recent')
        assert.equal(created.cover, track.image)
        assert.deepEqual(
            created.tracks.map((item) => item.filePath),
            [track.filePath, 'C:\\Music\\two.wav'],
        )
        assert.deepEqual((await sessionService.loadUserPlaylists())[0], created)
        assert.equal(
            await sessionService.createUserPlaylistWithTracks({ name: 'Empty', tracks: [] }),
            null,
        )
        const beforeFailure = [...storage.entries()]
        globalThis.window.localStorage.setItem = () => {
            throw new Error('Synthetic storage failure')
        }
        console.error = () => {}
        assert.equal(
            await sessionService.createUserPlaylistWithTracks({ name: 'Failed', tracks: [track] }),
            null,
        )
        assert.deepEqual([...storage.entries()], beforeFailure)
    } finally {
        console.error = originalError
        if (previousWindow === undefined) delete globalThis.window
        else globalThis.window = previousWindow
    }
})
