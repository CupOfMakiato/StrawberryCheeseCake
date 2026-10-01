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
