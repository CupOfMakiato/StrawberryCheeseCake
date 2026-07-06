import React from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'
import cheesecake from '../assets/IMG_6102.webp'

const handleExternalLink = async (event, url) => {
    event.preventDefault()

    try {
        await openUrl(url)
    } catch {
        window.open(url, '_blank', 'noopener,noreferrer')
    }
}

const About = () => {
    return (
        <div>
            <img
                className="coverImage w-72 h-72 rounded-lg object-cover"
                src={cheesecake}
                draggable={false}
            />
            <p>
                Developed by{' '}
                <a
                    className="underline text-(--accent-color) decoration-solid hover:text-(--hover-color)"
                    href="https://github.com/CupOfMakiato"
                    onClick={(event) =>
                        handleExternalLink(event, 'https://github.com/CupOfMakiato')
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    Makiato
                </a>
                <span> (still trying to fix this)</span>
            </p>
            <p>
                Also check out my website{' '}
                <a
                    className="underline text-(--accent-color) decoration-solid hover:text-(--hover-color)"
                    href="https://makiato-art.vercel.app/"
                    onClick={(event) =>
                        handleExternalLink(event, 'https://makiato-art.vercel.app/')
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                >
                    here
                </a>
            </p>

            <p>fully support offline play without internet connection, still in development!</p>
        </div>
    )
}

export default About
