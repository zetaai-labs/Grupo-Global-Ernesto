import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../../../../api/client'
import { getLanguage, useT } from '../../../../i18n'
import { translateServer } from '../../../../i18n/serverMessages'
import './VideoBio.css'

const MAX_BYTES = 2 * 1024 * 1024 * 1024
const POLL_MS = 5000
const LANGUAGE_NAMES = { es: 'Spanish', en: 'English', ar: 'Arabic', ru: 'Russian', fr: 'French', de: 'German', it: 'Italian', pt: 'Portuguese', hi: 'Hindi' }

/** Reads the video length in the browser before uploading anything. */
function videoLength(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const probe = document.createElement('video')
    probe.preload = 'metadata'
    probe.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(probe.duration) }
    probe.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    probe.src = url
  })
}

/** Sends the file straight to the video provider, reporting progress (0–100). */
function sendToProvider({ upload_url: url, method, field }, file, onProgress, signal) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, url)
    xhr.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100)) }
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error('upload')))
    xhr.onerror = () => reject(new Error('upload'))
    xhr.onabort = () => reject(new Error('aborted'))
    signal.addEventListener('abort', () => xhr.abort())
    if (field) {
      const form = new FormData()
      form.append(field, file)
      xhr.send(form)
    } else {
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
      xhr.send(file)
    }
  })
}

/** "My video bio": upload, processing status, transcript, replace and delete. */
function MyVideoBio({ onChange, onLinkSave }) {
  const t = useT()
  const [info, setInfo] = useState(null)
  const [language, setLanguage] = useState(() => (['es', 'ar', 'ru', 'fr'].includes(getLanguage()) ? getLanguage() : 'en'))
  const [progress, setProgress] = useState(null)
  const [message, setMessage] = useState('')
  const [link, setLink] = useState('')
  const inputRef = useRef(null)
  const abortRef = useRef(null)

  const load = useCallback(async () => {
    try {
      const response = await api.get('/community/me/video-bio')
      setInfo(response.data)
      return response.data
    } catch {
      setInfo({ data: null, meta: { enabled: false, max_seconds: 300, languages: [] } })
      return null
    }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => () => abortRef.current?.abort(), [])

  const bio = info?.data
  const working = bio && (bio.status === 'WAITING_UPLOAD' || bio.status === 'PROCESSING' || (bio.status === 'READY' && bio.transcript_status === 'PENDING'))

  // Follow processing until the video and its transcript are ready.
  useEffect(() => {
    if (!working || progress !== null) return undefined
    const timer = setInterval(async () => {
      const next = await load()
      if (next?.data?.status === 'READY' && bio?.status !== 'READY') onChange?.()
    }, POLL_MS)
    return () => clearInterval(timer)
  }, [working, progress, load, onChange, bio?.status])

  if (!info) return null
  const maxSeconds = info.meta?.max_seconds || 300

  const choose = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setMessage('')
    if (!file.type.startsWith('video/')) return setMessage(t('Choose a video file.'))
    if (file.size > MAX_BYTES) return setMessage(t('The file is larger than 2 GB.'))
    const seconds = await videoLength(file)
    if (seconds && seconds > maxSeconds + 1) return setMessage(t('The video is longer than 5 minutes. Upload a shorter one.'))
    if (bio?.status === 'READY' && !window.confirm(t('Replace your current video bio?'))) return

    const controller = new AbortController()
    abortRef.current = controller
    setProgress(0)
    try {
      const response = await api.post('/community/me/video-bio/upload', { language })
      await sendToProvider(response.data.data, file, setProgress, controller.signal)
      setMessage(t('Uploaded. Your video is being processed and transcribed; this takes a few minutes.'))
    } catch (error) {
      if (error.message !== 'aborted') setMessage(translateServer(error.response?.data?.message) || t('The upload failed. Check your connection and try again.'))
    } finally {
      abortRef.current = null
      setProgress(null)
      await load()
    }
  }

  const remove = async () => {
    if (!window.confirm(t('Delete your video bio and its transcript?'))) return
    try {
      const response = await api.delete('/community/me/video-bio')
      setMessage(translateServer(response.data?.message))
      await load()
      onChange?.()
    } catch {
      setMessage(t('The action could not be completed.'))
    }
  }

  const saveLink = async (event) => {
    event.preventDefault()
    await onLinkSave?.(link)
    setLink('')
  }

  // Provider not configured yet: keep the simple "paste a link" option.
  if (!info.meta?.enabled && !bio) {
    return (
      <form className="feature-panel com-bio" onSubmit={saveLink}>
        <label>{t('Your video presentation link (https)')}
          <input type="url" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" />
        </label>
        <button type="submit">{t('Save')}</button>
      </form>
    )
  }

  const statusText = {
    WAITING_UPLOAD: t('Waiting for the upload to finish…'),
    PROCESSING: t('Processing your video…'),
    READY: bio?.transcript_status === 'PENDING' ? t('Ready to watch. Transcript in progress…') : t('Ready'),
    FAILED: translateServer(bio?.failure) || t('The video could not be processed. Try another file.'),
  }

  return (
    <section className="feature-panel vb-mine" aria-label={t('My video bio')}>
      <header>
        <div>
          <h3>🎬 {t('My video bio')}</h3>
          <p>{t('A short presentation (3–4 minutes, maximum 5) so colleagues and partners get to know you. It is transcribed automatically and the transcript is searchable.')}</p>
        </div>
      </header>

      {bio && (
        <div className={`vb-status vb-${bio.status.toLowerCase()}`} role="status">
          <strong>{statusText[bio.status]}</strong>
          {bio.duration_seconds ? <small>{Math.floor(bio.duration_seconds / 60)}:{String(Math.round(bio.duration_seconds % 60)).padStart(2, '0')} · {t(LANGUAGE_NAMES[bio.language] || bio.language)}</small> : null}
        </div>
      )}

      {progress !== null && (
        <div className="vb-progress">
          <div className="vb-progress-bar"><span style={{ width: `${progress}%` }} /></div>
          <small>{t('Uploading… {percent}%', { percent: progress })}</small>
          <button type="button" onClick={() => abortRef.current?.abort()}>{t('Cancel')}</button>
        </div>
      )}

      {bio?.transcript && (
        <details className="vb-transcript">
          <summary>{t('Transcript')}</summary>
          <p>{bio.transcript}</p>
        </details>
      )}
      {bio?.transcript_status === 'NONE' && bio.status === 'READY' && <small className="vb-note">{t('No transcript could be generated for this video.')}</small>}

      {progress === null && (
        <div className="vb-actions">
          <label className="vb-language">{t('Language spoken')}
            <select value={language} onChange={(e) => setLanguage(e.target.value)}>
              {(info.meta?.languages || ['es', 'en']).map((code) => <option key={code} value={code}>{t(LANGUAGE_NAMES[code] || code)}</option>)}
            </select>
          </label>
          <input ref={inputRef} type="file" accept="video/*" hidden onChange={choose} />
          <button type="button" className="primary-action" disabled={!info.meta?.enabled} onClick={() => inputRef.current?.click()}>
            {t(bio ? 'Replace video' : 'Upload video')}
          </button>
          {bio && <button type="button" className="vb-delete" onClick={remove}>{t('Delete')}</button>}
        </div>
      )}
      {message && <small className="vb-message" role="status">{message}</small>}
    </section>
  )
}

export default MyVideoBio
