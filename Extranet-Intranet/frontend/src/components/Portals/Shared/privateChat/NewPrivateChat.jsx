import { useEffect, useState } from 'react'
import api from '../../../../api/client'
import { useT } from '../../../../i18n'
import { translateServer } from '../../../../i18n/serverMessages'
import './PrivateChat.css'

/** Search a colleague (or, for partners, a Grupo Global staff member) and open a private chat with them. */
function NewPrivateChat({ onOpen, onClose }) {
  const t = useT()
  const [q, setQ] = useState('')
  const [people, setPeople] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    if (q.trim().length < 2) return undefined
    const timer = setTimeout(() => {
      api.get('/chat/private/contacts', { params: { q: q.trim() } }).then((response) => setPeople(response.data.data || [])).catch(() => setPeople([]))
    }, 250)
    return () => clearTimeout(timer)
  }, [q])

  const open = async (person) => {
    try {
      const response = await api.post('/chat/private', { user_id: person.id })
      onOpen(response.data.data.id)
    } catch (err) {
      setError(translateServer(err.response?.data?.message) || t('The action could not be completed.'))
    }
  }

  return (
    <div className="pc-new" role="dialog" aria-label={t('New private chat')}>
      <header>
        <strong>🔒 {t('New private chat')}</strong>
        <button type="button" onClick={onClose} aria-label={t('Close')}>✕</button>
      </header>
      <input autoFocus value={q} onChange={(event) => setQ(event.target.value)} placeholder={t('Search by name or email')} aria-label={t('Search by name or email')} />
      {error && <p className="pc-error" role="alert">{error}</p>}
      <ul>
        {q.trim().length >= 2 && people.map((person) => (
          <li key={person.id}>
            <button type="button" onClick={() => open(person)}>
              <strong><bdi>{person.name}</bdi></strong>
              <small>{t(person.role)}{person.organization ? ` · ${person.organization}` : ''}{person.has_key ? '' : ` · ${t('has not turned on private chat yet')}`}</small>
            </button>
          </li>
        ))}
        {q.trim().length >= 2 && !people.length && <li className="pc-muted">{t('Nobody found.')}</li>}
      </ul>
    </div>
  )
}

export default NewPrivateChat
