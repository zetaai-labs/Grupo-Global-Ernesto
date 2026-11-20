import { useState } from 'react'
import api from '../../api/client'
import './ReceivedFileUpload.css'
import { useT } from '../../i18n'

function ReceivedFileUpload() {
  const t = useT()
  const [form, setForm] = useState({ sender_name: '', sender_email: '', message: '' })
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const change = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    if (!file) {
      setError('Please choose a file to upload.')
      return
    }
    const data = new FormData()
    data.append('sender_name', form.sender_name)
    data.append('sender_email', form.sender_email)
    if (form.message) data.append('message', form.message)
    data.append('file', file)

    try {
      await api.post('/public/received-files', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setStatus('Your file has been submitted for review. Thank you.')
      setForm({ sender_name: '', sender_email: '', message: '' })
      setFile(null)
      event.target.reset()
    } catch (err) {
      setError(err.response?.data?.message || 'Upload failed. Please try again.')
    }
  }

  return (
    <main className="public-upload-page">
      <div className="public-upload-card">
        <div className="feature-eyebrow">{t('SECURE SUBMISSION')}</div>
        <h1>{t('Send files to Global Group')}</h1>
        <p>{t('No account is required. Our staff will review the file you submit.')}</p>

        {error && <div className="cloud-notice">{error}</div>}
        {status && <div className="public-upload-success">{status}</div>}

        <form onSubmit={submit}>
          <label>Your name
            <input value={form.sender_name} onChange={change('sender_name')} required placeholder="Full name" />
          </label>
          <label>Email address
            <input type="email" value={form.sender_email} onChange={change('sender_email')} required placeholder="you@company.com" />
          </label>
          <label>Message (optional)
            <textarea value={form.message} onChange={change('message')} rows="3" placeholder="Add context for the reviewer" />
          </label>
          <label>File
            <input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} required />
          </label>
          <button type="submit" className="primary-action">⇧ Submit file</button>
        </form>
      </div>
    </main>
  )
}

export default ReceivedFileUpload
