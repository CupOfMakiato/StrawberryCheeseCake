import { House, ListVideo, ScrollText, LibraryIcon } from 'lucide-react'
import React from 'react'
import { Link, useLocation } from 'react-router-dom'

const navItems = [
    {
        label: 'Home',
        path: '/',
        icon: <House className="w-5 h-5" />,
    },
    {
        label: 'Library',
        path: '/library',
        icon: <LibraryIcon className="w-5 h-5" />,
    },
    {
        label: 'Queue',
        path: '/queue',
        icon: <ListVideo className="w-5 h-5" />,
    },
    {
        label: 'About',
        path: '/about',
        icon: <ScrollText className="w-5 h-5" />,
    },
]

const Sidebar = () => {
    return (
        <div className="topLevelSidebar">
            <nav className="flex flex-col items-start">
                {navItems.map((item) => (
                    <Link
                        key={item.path}
                        to={item.path}
                        className="flex items-center gap-0.5 underline text-(--accent-color) font-semibold hover:text-(--hover-color)"
                    >
                        {item.icon}
                        {item.label}
                    </Link>
                ))}
            </nav>
        </div>
    )
}

export default Sidebar
