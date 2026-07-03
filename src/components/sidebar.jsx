import React from 'react'
import { Link, useLocation } from 'react-router-dom'

const navItems = [
    {
        label: 'Home',
        path: '/',
        // icon: <PiPawPrintFill className="w-5 h-5" />
    },
    {
        label: 'About',
        path: '/about',
        //   icon: <FaRegQuestionCircle className="w-5 h-5" />,
    },
    {
        label: 'Queue',
        path: '/queue',
    },
]

const Sidebar = () => {
    return (
        <div className="topLevelSidebar">
            <nav className="flex flex-col items-start">
                {navItems.map((item) => (
                    <Link key={item.path} to={item.path} className="underline text-[#001aff]">
                        {item.label}
                    </Link>
                ))}
            </nav>
        </div>
    )
}

export default Sidebar
