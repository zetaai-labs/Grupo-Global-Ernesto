import { useCallback, useEffect, useState } from 'react'
import CoursePlayer from './CoursePlayer'
import api from '../../../../../api/client'
import { useT, dateLocale } from '../../../../../i18n'
import './Courses.css'
import { translateServer } from '../../../../../i18n/serverMessages'

const TYPE_LABELS = { EVENT: 'Event', COMPLIANCE_COURSE: 'Compliance course', TECHNICAL_WORKSHOP: 'Technical workshop' }
const TIER_LABELS = { ALL_EMPLOYEES: 'All employees', DELEGATES_ONLY: 'Delegates only', EXECUTIVES: 'Executives' }
const STATUS_LABELS = { ENROLLED: 'Enrolled', FAILED: 'Not passed yet', COMPLETED: 'Completed' }
const PACKAGE_LABELS = { SCORM_12: 'SCORM 1.2', SCORM_2004: 'SCORM 2004', XAPI: 'xAPI (Tin Can)' }
const PROGRESS_LABELS = { 'not attempted': 'Not started', incomplete: 'In progress', unknown: 'In progress', browsed: 'Viewed', completed: 'Completed', passed: 'Passed', failed: 'Not passed yet' }
const minutes = (seconds) => Math.max(0, Math.round((seconds || 0) / 60))
const EMPTY_QUESTION = { question: '', options: ['', ''], answer: 0 }
const EMPTY = { module_type: 'COMPLIANCE_COURSE', title: '', description: '', access_tier: 'ALL_EMPLOYEES', pass_mark: 70, starts_at: '', lessonTitle: '', lessonBody: '', quiz: [] }

/** Courses & events with server-side grading and SHA-256 certificates (Schema Document §4.7). */
function Courses() {
  const t = useT()
  const [courses, setCourses] = useState([])
  const [canAuthor, setCanAuthor] = useState(false)
  const [course, setCourse] = useState(null)
  const [answers, setAnswers] = useState({})
  const [result, setResult] = useState(null)
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [notice, setNotice] = useState('')
  const [playing, setPlaying] = useState(false)
  const [uploadPct, setUploadPct] = useState(null)

  const load = useCallback(async () => {
    try {
      const response = await api.get('/courses')
      setCourses(response.data?.data || [])
      setCanAuthor(Boolean(response.data?.meta?.can_author))
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load courses.')
    }
  }, [])

  useEffect(() => { load() }, [load])

  const open = async (itemId) => {
    try {
      const response = await api.get(`/courses/${itemId}`)
      setCourse(response.data?.data)
      setAnswers({})
      setResult(null)
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not open this course.')
    }
  }

  const enroll = async () => {
    try {
      const response = await api.post(`/courses/${course.item_id}/enroll`)
      setNotice(response.data?.message)
      await load()
      await open(course.item_id)
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not enrol.')
    }
  }

  const submit = async (event) => {
    event.preventDefault()
    if (Object.keys(answers).length !== course.quiz.length) return setNotice(t('Answer every question.'))
    try {
      const response = await api.post(`/courses/${course.item_id}/submit`, { answers: course.quiz.map((item) => answers[item.index]) })
      setResult({ ...response.data.data, message: response.data.message })
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not submit your answers.')
    }
    return undefined
  }

  const uploadPackage = async (file) => {
    if (!file) return
    const data = new FormData()
    data.append('file', file)
    setUploadPct(0)
    try {
      const response = await api.post(`/courses/${course.item_id}/package`, data, {
        timeout: 15 * 60 * 1000,
        onUploadProgress: (event) => event.total && setUploadPct(Math.round((event.loaded / event.total) * 100)),
      })
      setNotice(response.data?.message)
      await open(course.item_id)
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not upload the course package.')
    } finally {
      setUploadPct(null)
    }
  }

  const removePackage = async () => {
    if (!window.confirm(t('Remove this package? Learner progress inside it is deleted; certificates already issued stay valid.'))) return
    try {
      const response = await api.delete(`/courses/${course.item_id}/package`)
      setNotice(response.data?.message)
      await open(course.item_id)
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not remove the course package.')
    }
  }

  const closePlayer = async () => {
    setPlaying(false)
    await open(course.item_id)
    await load()
  }

  const updateQuestion = (index, patch) => setForm((current) => ({
    ...current,
    quiz: current.quiz.map((item, i) => (i === index ? { ...item, ...patch } : item)),
  }))

  const create = async (event) => {
    event.preventDefault()
    try {
      await api.post('/courses', {
        module_type: form.module_type,
        title: form.title,
        description: form.description || null,
        access_tier: form.access_tier,
        pass_mark: Number(form.pass_mark),
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
        lessons: form.lessonTitle && form.lessonBody ? [{ title: form.lessonTitle, body: form.lessonBody }] : [],
        quiz: form.quiz.map((item) => ({ question: item.question, options: item.options.filter(Boolean), answer: Number(item.answer) })),
      })
      setForm(EMPTY)
      setShowCreate(false)
      setNotice(t('Published. Eligible staff have been notified.'))
      await load()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not create the course.')
    }
  }

  const certificate = result?.certificate_hash || course?.enrollment?.certificate_hash
  const verifyUrl = certificate ? `${window.location.origin}/verify-certificate?code=${certificate}` : ''
  const completed = courses.filter((item) => item.status === 'COMPLETED').length

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('LEARNING & EVENTS')}</div>
          <h1>{t('Courses & Events')}</h1>
          <p>{t('Compliance courses, technical workshops and corporate events, with verifiable digital certificates.')}</p>
        </div>
        {canAuthor && <button type="button" className="primary-action" onClick={() => setShowCreate((value) => !value)}>＋ {t('New course or event')}</button>}
      </div>

      <div className="feature-stats">
        <div className="stat-card"><div className="stat-top"><span>{t('Available')}</span><span className="stat-icon">▤</span></div><strong>{courses.length}</strong><small>{t('For your role')}</small></div>
        <div className="stat-card"><div className="stat-top"><span>{t('Completed')}</span><span className="stat-icon">✓</span></div><strong>{completed}</strong><small>{t('Certificates earned')}</small></div>
      </div>

      {notice && <div className="cloud-notice crs-notice" role="status"><span>{translateServer(notice)}</span><button type="button" onClick={() => setNotice('')} aria-label="Dismiss">✕</button></div>}

      {showCreate && (
        <form className="feature-panel crs-create" onSubmit={create}>
          <h3>{t('New course or event')}</h3>
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t('Title')} required />
          <select value={form.module_type} onChange={(e) => setForm({ ...form, module_type: e.target.value })} aria-label={t('Type')}>
            {Object.entries(TYPE_LABELS).map(([code, label]) => <option key={code} value={code}>{t(label)}</option>)}
          </select>
          <select value={form.access_tier} onChange={(e) => setForm({ ...form, access_tier: e.target.value })} aria-label={t('Audience')}>
            {Object.entries(TIER_LABELS).map(([code, label]) => <option key={code} value={code}>{t(label)}</option>)}
          </select>
          <label className="crs-field">{t('Pass mark (%)')}<input type="number" min="1" max="100" value={form.pass_mark} onChange={(e) => setForm({ ...form, pass_mark: e.target.value })} /></label>
          <label className="crs-field">{t('Date (optional)')}<input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} /></label>
          <textarea className="crs-wide" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t('Description')} rows="2" />
          <input className="crs-wide" value={form.lessonTitle} onChange={(e) => setForm({ ...form, lessonTitle: e.target.value })} placeholder={t('Lesson title')} />
          <textarea className="crs-wide" value={form.lessonBody} onChange={(e) => setForm({ ...form, lessonBody: e.target.value })} placeholder={t('Lesson content')} rows="4" />

          <div className="crs-wide crs-builder">
            <strong>{t('Assessment')}</strong>
            {form.quiz.map((item, index) => (
              <fieldset key={index}>
                <legend>{t('Question')} {index + 1}</legend>
                <input value={item.question} onChange={(e) => updateQuestion(index, { question: e.target.value })} placeholder={t('Question')} required />
                {item.options.map((option, optionIndex) => (
                  <label key={optionIndex}>
                    <input type="radio" name={`answer-${index}`} checked={Number(item.answer) === optionIndex} onChange={() => updateQuestion(index, { answer: optionIndex })} aria-label={t('Correct answer')} />
                    <input value={option} onChange={(e) => updateQuestion(index, { options: item.options.map((value, i) => (i === optionIndex ? e.target.value : value)) })} placeholder={`${t('Option')} ${optionIndex + 1}`} required={optionIndex < 2} />
                  </label>
                ))}
                {item.options.length < 6 && <button type="button" onClick={() => updateQuestion(index, { options: [...item.options, ''] })}>＋ {t('Option')}</button>}
              </fieldset>
            ))}
            <button type="button" onClick={() => setForm({ ...form, quiz: [...form.quiz, { ...EMPTY_QUESTION, options: ['', ''] }] })}>＋ {t('Add question')}</button>
          </div>
          <div className="crs-wide crs-actions">
            <button type="submit" className="primary-action">{t('Publish')}</button>
            <button type="button" onClick={() => setShowCreate(false)}>{t('Cancel')}</button>
          </div>
        </form>
      )}

      <div className="crs-layout">
        <div className="crs-list">
          {courses.map((item) => (
            <button type="button" key={item.item_id} className={`crs-card ${course?.item_id === item.item_id ? 'selected' : ''}`} onClick={() => open(item.item_id)}>
              <span className={`crs-type crs-type-${item.module_type.toLowerCase()}`}>{t(TYPE_LABELS[item.module_type])}</span>
              <strong>{item.title}</strong>
              <small>{t(TIER_LABELS[item.access_tier])}{item.starts_at ? ` · ${new Date(item.starts_at).toLocaleDateString(dateLocale())}` : ''}{item.questions ? ` · ${item.questions} ${t('questions')}` : ''}</small>
              {item.status && <span className={`crs-status crs-status-${item.status.toLowerCase()}`}>{t(STATUS_LABELS[item.status])}{item.best_score !== null ? ` · ${item.best_score}%` : ''}</span>}
            </button>
          ))}
          {!courses.length && <div className="feature-panel feature-empty-state"><div className="empty-icon">▤</div><h3>{t('No courses yet')}</h3></div>}
        </div>

        {course && (
          <article className="feature-panel crs-detail">
            <header><h2>{course.title}</h2><button type="button" onClick={() => setCourse(null)} aria-label={t('Close')}>✕</button></header>
            {course.description && <p>{course.description}</p>}
            {!course.enrollment && <button type="button" className="primary-action crs-enrol" onClick={enroll}>{course.module_type === 'EVENT' ? t('Register') : t('Enrol')}</button>}

            {course.package && (
              <section className="crs-package">
                <div>
                  <span className="crs-type">{t('Interactive course')} · {PACKAGE_LABELS[course.package.standard]}</span>
                  <strong>{course.package.title || course.title}</strong>
                  <small>
                    {t(PROGRESS_LABELS[course.package.lesson_status] || 'Not started')}
                    {course.package.score !== null && course.package.score !== undefined ? ` · ${course.package.score}%` : ''}
                    {course.package.total_seconds ? ` · ${t('{count} min spent', { count: minutes(course.package.total_seconds) })}` : ''}
                  </small>
                </div>
                <button type="button" className="primary-action" onClick={() => setPlaying(true)}>
                  {course.package.launches ? t('Resume course') : t('Start course')}
                </button>
              </section>
            )}

            {course.can_author && (
              <section className="crs-package-admin">
                <strong>{t('Course package')}</strong>
                <small>
                  {course.package
                    ? `${PACKAGE_LABELS[course.package.standard]} · ${course.package.original_name || ''} · ${course.package.file_count} ${t('files')}`
                    : t('SCORM 1.2, SCORM 2004 or xAPI .zip, up to 300 MB.')}
                </small>
                <label className="crs-upload">
                  <input type="file" accept=".zip,application/zip" disabled={uploadPct !== null} onChange={(e) => { uploadPackage(e.target.files?.[0]); e.target.value = '' }} />
                  <span>{uploadPct !== null ? t('Uploading package… {percent}%', { percent: uploadPct }) : course.package ? t('Replace package') : t('Upload package')}</span>
                </label>
                {course.package && <button type="button" onClick={removePackage}>{t('Remove package')}</button>}
              </section>
            )}

            {course.lessons.map((lesson, index) => (
              <section key={index} className="crs-lesson"><h3>{lesson.title}</h3><p>{lesson.body}</p></section>
            ))}

            {course.quiz.length > 0 && course.enrollment?.status !== 'COMPLETED' && !result?.passed && (
              <form className="crs-quiz" onSubmit={submit}>
                <h3>{t('Assessment')} · {t('pass mark')} {course.pass_mark}%</h3>
                {course.quiz.map((item) => (
                  <fieldset key={item.index}>
                    <legend>{item.index + 1}. {item.question}</legend>
                    {item.options.map((option, optionIndex) => (
                      <label key={optionIndex}>
                        <input type="radio" name={`q-${item.index}`} checked={answers[item.index] === optionIndex} onChange={() => setAnswers({ ...answers, [item.index]: optionIndex })} />
                        {option}
                      </label>
                    ))}
                  </fieldset>
                ))}
                <button type="submit" className="primary-action">{t('Submit answers')}</button>
              </form>
            )}

            {result && !result.passed && <div className="crs-result bad">{result.message}</div>}
            {certificate && (
              <div className="crs-result ok">
                <strong>🎓 {t('Certificate issued')}</strong>
                <small className="mono">SHA-256 {certificate}</small>
                <a href={verifyUrl} target="_blank" rel="noreferrer">{t('Open verification page')}</a>
              </div>
            )}
          </article>
        )}
      </div>
      {playing && course?.package && <CoursePlayer course={course} onClose={closePlayer} />}
    </section>
  )
}

export default Courses
