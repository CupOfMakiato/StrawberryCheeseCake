import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import Home from '../pages/home'

const About = lazy(() => import('../pages/about'))
const Queue = lazy(() => import('../components/queue'))
const Library = lazy(() => import('../pages/library'))
const Playlist = lazy(() => import('../pages/playlist'))
const Bonus = lazy(() => import('../pages/bonus'))

const AppRouter = () => {
    const location = useLocation()

    useEffect(() => {
        document.querySelector('.appShell')?.scrollTo({ top: 0, behavior: 'smooth' })
    }, [location.pathname])

    return (
        <Suspense
            fallback={
                <main className="p-4 text-sm text-slate-500" role="status">
                    Loading page...
                </main>
            }
        >
            <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/about" element={<About />} />
                <Route path="/queue" element={<Queue />} />
                <Route path="/library" element={<Library />} />
                <Route path="/playlist/:playlistId" element={<Playlist />} />
                <Route path="/bonus" element={<Bonus />} />
            </Routes>
        </Suspense>
    )
}

export default AppRouter
