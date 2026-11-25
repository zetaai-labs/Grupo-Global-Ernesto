import { useEffect, useRef, useState } from 'react'
import api from '../../../../api/client'
import { useT } from '../../../../i18n'
import { translateServer } from '../../../../i18n/serverMessages'
import './VideoBio.css'

/** Plays a person's video bio from a signed, expiring HLS link, with the transcript beside it. */
function VideoBioPlayer({ userId, name, onClose }) {
  const t = useT()
  const videoRef = useRef(null)
  const closeRef = useRef(null)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    api.get(`/community/video-bios/${userId}`)
      .then((response) => { if (alive) setData(response.data.data) })
      .catch((failure) => { if (alive) setError(translateServer(failure.response?.data?.message) || t('The video could not be loaded.')) })
    return () => { alive = false }
  }, [userId, t])

  // Native HLS on Safari/iOS; hls.js (loaded only when needed) everywhere else.
  useEffect(() => {
    const video = videoRef.current
    if (!data?.hls || !video) return undefined
    let hls = null
    let cancelled = false
    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = data.hls
    } else {
      import('hls.js').then(({ default: Hls }) => {
        if (cancelled) return
        if (!Hls.isSupported()) { setError(t('This browser cannot play the video.')); return }
        hls = new Hls()
        hls.on(Hls.Events.ERROR, (_event, info) => { if (info.fatal) setError(t('The video could not be loaded.')) })
        hls.loadSource(data.hls)
        hls.attachMedia(video)
      })
    }
    return () => {
      cancelled = true
      hls?.destroy()
    }
  }, [data, t])

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (event) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="vb-overlay" role="presentation" onClick={onClose}>
      <div className="vb-dialog" role="dialog" aria-modal="true" aria-label={t('Video bio of {name}', { name: data?.name || name })} onClick={(event) => event.stopPropagation()}>
        <header>
          <strong>▶ {data?.name || name}</strong>
          <button ref={closeRef} type="button" onClick={onClose} aria-label={t('Close')}>✕</button>
        </header>
        {error && <div className="cloud-notice">{error}</div>}
        {!error && (
          <div className="vb-body">
            <video ref={videoRef} controls playsInline preload="metadata" aria-label={t('Video bio')} />
            <aside>
              <h4>{t('Transcript')}</h4>
              <p>{data ? data.transcript || t('No transcript yet.') : t('Loading…')}</p>
            </aside>
          </div>
        )}
      </div>
    </div>
  )
}

export default VideoBioPlayer
