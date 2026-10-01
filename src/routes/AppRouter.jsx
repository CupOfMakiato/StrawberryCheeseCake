import { useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import Home from '../pages/home'
import About from '../pages/about'
import Queue from '../components/queue'
import Library from '../pages/library'
import Playlist from '../pages/playlist'
import Bonus from '../pages/bonus'

const AppRouter = () => {
    const location = useLocation()

    useEffect(() => {
        document.querySelector('.appShell')?.scrollTo({ top: 0, behavior: 'smooth' })
    }, [location.pathname])

    return (
        <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/queue" element={<Queue />} />
            <Route path="/library" element={<Library />} />
            <Route path="/playlist/:playlistId" element={<Playlist />} />
            <Route path="/bonus" element={<Bonus />} />
        </Routes>
    )
}

export default AppRouter
