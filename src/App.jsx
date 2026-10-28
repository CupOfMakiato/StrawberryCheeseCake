import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import AppRouter from './routes/AppRouter'
import Player from './components/player'
import Sidebar from './components/sidebar'
import './App.css'

function AppLayout() {
    return (
        <div className="appShell">
            <Sidebar />
            <AppRouter />
            <Player />
        </div>
    )
}

const router = createBrowserRouter([{ path: '*', element: <AppLayout /> }])

function App() {
    return <RouterProvider router={router} />
}

export default App
