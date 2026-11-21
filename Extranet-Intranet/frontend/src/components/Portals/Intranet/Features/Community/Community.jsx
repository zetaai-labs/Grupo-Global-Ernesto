import { useCallback, useEffect, useState } from 'react'
import api from '../../../../../api/client'
import { getSharedSocket } from '../../../../../api/socket'
import { useT } from '../../../../../i18n'
import './Community.css'

const CORRIDORS = ['GLOBAL', 'SPAIN_EU', 'INDIA', 'UAE_DUBAI', 'LATAM', 'USA_CAN', 'MOROCCO']
const initials = (name) => String(name || '?').split(' ').filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('')

/** Community: activity feed, corporate directory and sector committees (Technical Spec §1.2). */
function Community() {
  const t = useT()
  const [tab, setTab] = useState('feed')
  const [posts, setPosts] = useState([])
  const [people, setPeople] = useState([])
  const [units, setUnits] = useState([])
  const [committees, setCommittees] = useState([])
  const [filters, setFilters] = useState({ q: '', corridor: '', org: '' })
  const [draft, setDraft] = useState({ body: '', committee_id: '' })
  const [feedCommittee, setFeedCommittee] = useState('')
  const [bio, setBio] = useState('')
  const [notice, setNotice] = useState('')

  const loadFeed = useCallback(async () => {
    try {
      const response = await api.get('/community/feed', { params: { committee: feedCommittee || undefined } })
      setPosts(response.data?.data || [])
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load the feed.')
    }
  }, [feedCommittee])

  const loadDirectory = useCallback(async () => {
    try {
      const params = Object.fromEntries(Object.entries(filters).filter(([, value]) => value))
      const response = await api.get('/community/directory', { params })
      setPeople(response.data?.data || [])
      setUnits(response.data?.meta?.units || [])
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not load the directory.')
    }
  }, [filters])

  const loadCommittees = useCallback(async () => {
    try {
      setCommittees((await api.get('/community/committees')).data?.data || [])
    } catch {
      setCommittees([])
    }
  }, [])

  useEffect(() => { loadFeed() }, [loadFeed])
  useEffect(() => { loadDirectory() }, [loadDirectory])
  useEffect(() => { loadCommittees() }, [loadCommittees])

  useEffect(() => {
    const socket = getSharedSocket()
    if (!socket) return undefined
    const onPost = (post) => {
      if (feedCommittee && post.committee_id !== feedCommittee) return
      setPosts((current) => (current.some((item) => item.post_id === post.post_id) ? current : [{ ...post, can_delete: false }, ...current]))
    }
    socket.on('community:post', onPost)
    return () => socket.off('community:post', onPost)
  }, [feedCommittee])

  const publish = async (event) => {
    event.preventDefault()
    try {
      await api.post('/community/feed', { body: draft.body, committee_id: draft.committee_id || null })
      setDraft({ body: '', committee_id: draft.committee_id })
      await loadFeed()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not publish.')
    }
  }

  const removePost = async (post) => {
    try {
      await api.delete(`/community/feed/${post.post_id}`)
      setPosts((current) => current.filter((item) => item.post_id !== post.post_id))
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not delete the post.')
    }
  }

  const toggleCommittee = async (committee) => {
    try {
      if (committee.joined) await api.delete(`/community/committees/${committee.committee_id}/join`)
      else await api.post(`/community/committees/${committee.committee_id}/join`)
      await loadCommittees()
      await loadDirectory()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not update your committees.')
    }
  }

  const saveBio = async (event) => {
    event.preventDefault()
    try {
      const response = await api.patch('/community/me/video-bio', { video_bio_url: bio.trim() || null })
      setNotice(response.data?.message)
      setBio('')
      await loadDirectory()
    } catch (error) {
      setNotice(error.response?.data?.message || 'Could not save the link.')
    }
  }

  const joined = committees.filter((committee) => committee.joined)

  return (
    <section className="feature-page">
      <div className="feature-heading">
        <div>
          <div className="feature-eyebrow">{t('COMMUNITY')}</div>
          <h1>{t('Community')}</h1>
          <p>{t('Activity feed, corporate directory and sector committees across all delegations.')}</p>
        </div>
      </div>

      {notice && <div className="cloud-notice com-notice" role="status"><span>{notice}</span><button type="button" onClick={() => setNotice('')} aria-label="Dismiss">✕</button></div>}

      <div className="com-tabs" role="tablist">
        {[['feed', t('Activity feed')], ['directory', `${t('Directory')} (${people.length})`], ['committees', `${t('Committees')} (${committees.length})`]].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label}</button>
        ))}
      </div>

      {tab === 'feed' && (
        <div className="com-feed">
          <form className="feature-panel com-composer" onSubmit={publish}>
            <textarea value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} placeholder={t('Share an update with the organisation…')} rows="3" maxLength={3000} required />
            <div>
              <select value={draft.committee_id} onChange={(e) => setDraft({ ...draft, committee_id: e.target.value })} aria-label={t('Post to')}>
                <option value="">{t('Everyone')}</option>
                {joined.map((committee) => <option key={committee.committee_id} value={committee.committee_id}>{committee.name}</option>)}
              </select>
              <button type="submit" className="primary-action">{t('Publish')}</button>
            </div>
          </form>

          <select className="com-filter" value={feedCommittee} onChange={(e) => setFeedCommittee(e.target.value)} aria-label={t('Filter feed')}>
            <option value="">{t('All activity')}</option>
            {committees.map((committee) => <option key={committee.committee_id} value={committee.committee_id}>{committee.name}</option>)}
          </select>

          {posts.map((post) => (
            <article key={post.post_id} className="feature-panel com-post">
              <span className="com-avatar" aria-hidden="true">{initials(post.author)}</span>
              <div>
                <header>
                  <strong>{post.author || t('Deleted user')}</strong>
                  <small>{post.organization ? `${post.organization} · ` : ''}{new Date(post.created_at).toLocaleString()}</small>
                  {post.committee && <em>{post.committee}</em>}
                </header>
                <p>{post.body}</p>
              </div>
              {post.can_delete && <button type="button" onClick={() => removePost(post)} aria-label={t('Delete')}>✕</button>}
            </article>
          ))}
          {!posts.length && <div className="feature-panel feature-empty-state"><div className="empty-icon">✦</div><h3>{t('No posts yet')}</h3><p>{t('Be the first to share an update.')}</p></div>}
        </div>
      )}

      {tab === 'directory' && (
        <>
          <div className="com-toolbar">
            <input type="search" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder={t('Search people or organisations')} aria-label={t('Search')} />
            <select value={filters.corridor} onChange={(e) => setFilters({ ...filters, corridor: e.target.value })} aria-label={t('Corridor')}>
              <option value="">{t('All corridors')}</option>
              {CORRIDORS.map((code) => <option key={code} value={code}>{code}</option>)}
            </select>
            <select value={filters.org} onChange={(e) => setFilters({ ...filters, org: e.target.value })} aria-label={t('Business unit')}>
              <option value="">{t('All business units')}</option>
              {units.map((unit) => <option key={unit.org_id} value={unit.org_id}>{unit.legal_name}</option>)}
            </select>
          </div>
          <div className="com-people">
            {people.map((person) => (
              <article key={person.id} className="feature-panel com-person">
                <span className="com-avatar" aria-hidden="true">{initials(person.name)}</span>
                <div>
                  <strong>{person.name}</strong>
                  <span>{t(person.role_label)}</span>
                  <small>{person.organization || '—'} · {person.corridor || 'GLOBAL'}</small>
                  <small>{person.email}</small>
                  {person.committees.length > 0 && <small>{person.committees.join(', ')}</small>}
                  {person.video_bio_url && <a href={person.video_bio_url} target="_blank" rel="noopener noreferrer">▶ {t('Video bio')}</a>}
                </div>
              </article>
            ))}
          </div>
          <form className="feature-panel com-bio" onSubmit={saveBio}>
            <label>{t('Your video presentation link (https)')}
              <input type="url" value={bio} onChange={(e) => setBio(e.target.value)} placeholder="https://…" />
            </label>
            <button type="submit">{t('Save')}</button>
          </form>
        </>
      )}

      {tab === 'committees' && (
        <div className="com-people">
          {committees.map((committee) => (
            <article key={committee.committee_id} className="feature-panel com-committee">
              <strong>{committee.name}</strong>
              <small>{committee.sector} · {committee.members} {t('members')}</small>
              {committee.description && <p>{committee.description}</p>}
              <button type="button" className={committee.joined ? '' : 'primary-action'} onClick={() => toggleCommittee(committee)}>
                {committee.joined ? t('Leave') : t('Join')}
              </button>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

export default Community
