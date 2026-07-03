import React, { useEffect } from 'react'
import { Routes, Route, useLocation, BrowserRouter } from 'react-router-dom'
import Home from '../pages/home'
import About from '../pages/about'
import Queue from '../components/queue'

const AppRouter = () => {
    const location = useLocation()

    useEffect(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }, [location.pathname])

    return (
        <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/about" element={<About />} />
            <Route path="/queue" element={<Queue />} />
        </Routes>
    )
}

export default AppRouter
