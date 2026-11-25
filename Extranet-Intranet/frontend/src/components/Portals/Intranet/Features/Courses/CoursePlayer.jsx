import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../../../../../api/client'
import { useT } from '../../../../../i18n'
import { translateServer } from '../../../../../i18n/serverMessages'

/**
 * Plays a SCORM / xAPI package in a sandboxed iframe (no same-origin access to the app).
 * The package's SCORM API runs inside the iframe and posts its data here; this component
 * saves it with the learner's own session.
 */
function CoursePlayer({ course, onClose }) {
  const t = useT()
  const frame = useRef(null)
  const latest = useRef(null)
  const savedJson = useRef('')
  const queue = useRef(Promise.resolve())
  const [launch, setLaunch] = useState(null)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.post(`/courses/${course.item_id}/package/launch`, { origin: window.location.origin })
      .then((response) => { if (!cancelled) setLaunch(response.data?.data) })
      .catch((error) => { if (!cancelled) setMessage(error.response?.data?.message || 'Could not open this course.') })
    return () => { cancelled = true }
  }, [course.item_id])

  const save = useCallback((cmi, finished) => {
    if (!launch || launch.standard === 'XAPI') return queue.current
    const json = JSON.stringify(cmi)
    if (!finished && json === savedJson.current) return queue.current
    queue.current = queue.current.then(async () => {
      setSaving(true)
      try {
        const response = await api.post(`/courses/${course.item_id}/package/runtime`, { token: launch.token, cmi, finished })
        savedJson.current = json
        const data = response.data?.data
        if (data?.outcome === 'passed') setMessage(t('Passed — certificate issued.'))
        else if (data?.outcome === 'failed' && finished) setMessage(t('Not passed yet. You can open the course again to retry.'))
      } catch (error) {
        setMessage(error.response?.data?.message || 'Could not save your progress.')
      } finally {
        setSaving(false)
      }
    })
    return queue.current
  }, [course.item_id, launch, t])

  useEffect(() => {
    if (!launch) return undefined
    // Accept messages only from the course frame (or frames inside it) carrying this launch's token.
    const fromCourse = (source) => {
      const target = frame.current?.contentWindow
      let current = source
      for (let depth = 0; current && depth < 10; depth += 1) {
        if (current === target) return true
        if (current === current.parent) return false
        current = current.parent
      }
      return false
    }
    const onMessage = (event) => {
      const data = event.data
      if (!data || data.source !== 'gg-course' || data.token !== launch.token || !fromCourse(event.source)) return
      if (!data.cmi || typeof data.cmi !== 'object') return
      latest.current = data.cmi
      if (data.type === 'commit') save(data.cmi, false)
      if (data.type === 'finish') save(data.cmi, true)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [launch, save])

  const close = async () => {
    if (latest.current) await save(latest.current, false)
    await queue.current
    onClose()
  }

  return (
    <div className="crs-player" role="dialog" aria-modal="true" aria-label={course.title}>
      <header>
        <strong>{course.title}</strong>
        <span className="crs-player-status" aria-live="polite">{saving ? t('Saving progress…') : translateServer(message)}</span>
        <button type="button" className="primary-action" onClick={close}>{t('Close course')}</button>
      </header>
      {launch
        ? (
          <iframe
            ref={frame}
            title={course.title}
            src={launch.url}
            sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"
            allow="fullscreen; autoplay"
            referrerPolicy="no-referrer"
          />
        )
        : <div className="crs-player-loading">{message ? translateServer(message) : t('Loading course…')}</div>}
    </div>
  )
}

export default CoursePlayer
