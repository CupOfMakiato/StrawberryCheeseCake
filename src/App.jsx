import { useState } from 'react'
import reactLogo from './assets/react.svg'
import { invoke } from '@tauri-apps/api/core'
import { ThemeProvider } from './contexts/ThemeContext'
import { BrowserRouter } from 'react-router-dom'
import AppRouter from './routes/AppRouter'
import Player from './components/player'
import Sidebar from './components/sidebar'
import './App.css'

function App() {
    const [greetMsg, setGreetMsg] = useState('')
    const [name, setName] = useState('')

    async function greet() {
        // Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
        setGreetMsg(await invoke('greet', { name }))
    }

    return (
        <ThemeProvider>
            <BrowserRouter>
                <div className="appShell">
                    <Sidebar />
                    <AppRouter />
                    <Player />
                </div>
            </BrowserRouter>
        </ThemeProvider>
    )
}

export default App
