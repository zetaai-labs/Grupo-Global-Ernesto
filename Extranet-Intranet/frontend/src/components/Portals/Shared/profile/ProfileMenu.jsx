import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import api from '../../../../api/client'
import { clearSession, updateStoredUser } from '../../../../api/auth'
import { closeSharedSocket } from '../../../../api/socket'
import { LANGUAGES, setLanguage, useLanguage, useT } from '../../../../i18n'
import { translateServer } from '../../../../i18n/serverMessages'
import { setTheme, useTheme } from '../../../../theme'
import { downloadFromApi } from '../../../../utils/download'
import { openHelp } from '../help/helpEvents'
import Avatar from './Avatar'
import { useCurrentUser } from './avatarStore'
import './ProfileMenu.css'
import { roleLabel as roleName } from '../../../../utils/roles'

const ADMIN_ROLES = ['admin', 'tech_admin', 'hr']

/** Profile button in the top bar and its menu: photo, language, theme, security, privacy, help and sign out. */
function ProfileMenu({ portal = 'intranet', roleLabel }) {
  const t = useT()
  const navigate = useNavigate()
  const location = useLocation()
  const user = useCurrentUser()
  const language = useLanguage()
  const theme = useTheme()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const wrapper = useRef(null)
  const fileInput = useRef(null)
  const base = `/${portal}`

  // Close on navigation, outside click and Escape.
  useEffect(() => { setOpen(false) }, [location.pathname])
  useEffect(() => {
    if (!open) return undefined
    const onClick = (event) => { if (!wrapper.current?.contains(event.target)) setOpen(false) }
    const onKey = (event) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const choosePhoto = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setMessage('')
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return setMessage(t('Choose a PNG, JPEG or WebP photo.'))
    if (file.size > 2 * 1024 * 1024) return setMessage(t('The photo must be 2 MB or smaller.'))
    setBusy(true)
    try {
      const form = new FormData()
      form.append('photo', file)
      const response = await api.put('/auth/me/avatar', form)
      updateStoredUser({ avatar_version: response.data.data.avatar_version })
      setMessage(t('Profile photo saved.'))
    } catch (error) {
      setMessage(translateServer(error.response?.data?.message) || t('The photo could not be uploaded.'))
    } finally {
      setBusy(false)
    }
  }

  const removePhoto = async () => {
    setBusy(true)
    try {
      await api.delete('/auth/me/avatar')
      updateStoredUser({ avatar_version: null })
      setMessage(t('Profile photo removed.'))
    } catch {
      setMessage(t('The action could not be completed.'))
    } finally {
      setBusy(false)
    }
  }

  const signOut = () => {
    clearSession()
    closeSharedSocket()
    navigate('/login')
  }

  return (
    <div className="profile-menu" ref={wrapper}>
      <button type="button" className="topbar-profile" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <Avatar userId={user?.id} version={user?.avatar_version} name={user?.name} />
        <div className="profile-copy">
          <strong><bdi>{user?.name || t('Guest')}</bdi></strong>
          <span>{roleLabel || (user?.role ? t(roleName(user.role)) : t('No role assigned'))}</span>
        </div>
        <span className="profile-chevron" aria-hidden="true">⌄</span>
      </button>

      {open && (
        <div className="profile-panel" role="menu" aria-label={t('Profile')}>
          <div className="pm-head">
            <div className="pm-photo">
              <Avatar userId={user?.id} version={user?.avatar_version} name={user?.name} size={56} />
              <button type="button" className="pm-photo-edit" onClick={() => fileInput.current?.click()} disabled={busy} aria-label={t('Change photo')} title={t('Change photo')}>✎</button>
              <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={choosePhoto} />
            </div>
            <div className="pm-who">
              <strong><bdi>{user?.name}</bdi></strong>
              <span><bdi>{user?.email}</bdi></span>
              <small>{roleLabel || (user?.role ? t(roleName(user.role)) : '')}{user?.organization ? <> · <bdi>{user.organization}</bdi></> : ''}</small>
              <span className="pm-photo-actions">
                <button type="button" onClick={() => fileInput.current?.click()} disabled={busy}>{t(user?.avatar_version ? 'Change photo' : 'Add a photo')}</button>
                {user?.avatar_version && <button type="button" onClick={removePhoto} disabled={busy}>{t('Remove')}</button>}
              </span>
            </div>
          </div>
          {message && <p className="pm-message" role="status">{message}</p>}

          <div className="pm-section">
            <span className="pm-label">{t('Language')}</span>
            <div className="pm-choices" role="group" aria-label={t('Language')}>
              {LANGUAGES.map((item) => (
                <button key={item.code} type="button" lang={item.code} aria-pressed={language === item.code} className={language === item.code ? 'on' : ''} onClick={() => setLanguage(item.code)}>
                  {item.name}
                </button>
              ))}
            </div>
          </div>
          <div className="pm-section">
            <span className="pm-label">{t('Appearance')}</span>
            <div className="pm-choices" role="group" aria-label={t('Appearance')}>
              <button type="button" aria-pressed={theme !== 'dark'} className={theme !== 'dark' ? 'on' : ''} onClick={() => setTheme('light')}>☀ {t('Light')}</button>
              <button type="button" aria-pressed={theme === 'dark'} className={theme === 'dark' ? 'on' : ''} onClick={() => setTheme('dark')}>☾ {t('Dark')}</button>
            </div>
          </div>

          <nav className="pm-links">
            <Link role="menuitem" to={`${base}/security`}>🔐 {t('Security & sign-in')}</Link>
            <Link role="menuitem" to={`${base}/privacy`}>🛡 {t('Privacy (GDPR)')}</Link>
            {portal === 'intranet' && ADMIN_ROLES.includes(user?.role) && <Link role="menuitem" to={`${base}/user-management`}>👥 {t('User Management')}</Link>}
            <button type="button" role="menuitem" onClick={() => downloadFromApi('/auth/me/export', 'my-global-group-data.json').catch(() => {})}>⇩ {t('Download my data')}</button>
            <button type="button" role="menuitem" onClick={() => { setOpen(false); openHelp() }}>❓ {t('Help & support')}</button>
          </nav>

          <button type="button" role="menuitem" className="pm-signout" onClick={signOut}>⎋ {t('Sign out')}</button>
        </div>
      )}
    </div>
  )
}

export default ProfileMenu
