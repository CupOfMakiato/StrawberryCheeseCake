import { BrowserRouter } from 'react-router-dom'
import AppRouter from './routes/AppRouter'
import Player from './components/player'
import Sidebar from './components/sidebar'
import './App.css'

function App() {
    return (
        <BrowserRouter>
            <div className="appShell">
                <Sidebar />
                <AppRouter />
                <Player />
            </div>
        </BrowserRouter>
    )
}

export default App
