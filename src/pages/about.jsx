import React from 'react'
import { openUrl } from '@tauri-apps/plugin-opener'

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
        <p>
            Developed by
            {' '}
            <a
              className='underline text-[#001aff] decoration-solid'
              href="https://github.com/CupOfMakiato"
              onClick={(event) => handleExternalLink(event, 'https://github.com/CupOfMakiato')}
              target="_blank"
              rel="noopener noreferrer"
            >
                Makiato
            </a>
            <span> (still trying to fix this)</span>
        </p>
        <p>
            Also check out my website
            {' '}
            <a
              className='underline text-[#001aff] decoration-solid'
              href="https://makiato-art.vercel.app/"
              onClick={(event) => handleExternalLink(event, 'https://makiato-art.vercel.app/')}
              target="_blank"
              rel="noopener noreferrer"
            >
                here
            </a>
        </p>

        <p>fully support offline play without internet connection</p>
        <p>The session storage is used to store the filepath and cache</p>
    </div>
  )
}

export default About