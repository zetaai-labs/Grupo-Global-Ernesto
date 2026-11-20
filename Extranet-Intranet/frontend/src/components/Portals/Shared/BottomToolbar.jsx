import { useState } from 'react'
import { Link } from 'react-router-dom'
import { getUser, clearSession } from '../../../api/auth'
import { useSyncStatus } from './useSyncStatus'
import { downloadFromApi } from '../../../utils/download'
import './BottomToolbar.css'
import { useT } from '../../../i18n'

const SYNC_LABELS = {
  connecting: { short: 'Connecting…', long: 'Connecting to server…' },
  online: { short: 'Synced', long: 'Synced with server' },
  offline: { short: 'Offline', long: 'Server unreachable — changes may not sync' },
}

function BottomToolbar({ portal = 'intranet' }) {
  const t = useT()
  const [panel, setPanel] = useState(null)
  const sync = useSyncStatus()
  const user = getUser()
  const base = `/${portal}`

  const toggle = (name) => setPanel((current) => (current === name ? null : name))

  return (
    <div className="bottom-toolbar">
      {panel === 'profile' && (
        <div className="toolbar-popover">
          <strong>{user?.name || t('Guest')}</strong>
          <span>{user?.email || ''} · {user?.role ? t(user.role) : ''}</span>
          <button
            type="button"
            onClick={() => downloadFromApi('/auth/me/export', 'my-global-group-data.json').catch(() => {})}
            title="GDPR: download everything the platform stores about you"
          >
            {t('Download my data')}
          </button>
          <button
            type="button"
            onClick={() => {
              clearSession()
              window.location.assign('/login')
            }}
          >
            {t('Sign out')}
          </button>
        </div>
      )}
      {panel === 'apps' && (
        <div className="toolbar-popover">
          <Link to={`${base}/cloud-folders`}>{t('Cloud Folders')}</Link>
          <Link to={`${base}/overview`}>{t('Overview')}</Link>
          <Link to="/">{t('Portal hub')}</Link>
        </div>
      )}
      {panel === 'sync' && (
        <div className="toolbar-popover">
          <span><span className={`sync-dot sync-dot--${sync.state}`} /> {t(SYNC_LABELS[sync.state].long)}</span>
          {sync.lastSyncedAt && (
            <span>
              {t('Last sync {time}', { time: sync.lastSyncedAt.toLocaleTimeString() })}
              {sync.latencyMs !== null && ` · ${sync.latencyMs} ms`}
            </span>
          )}
        </div>
      )}

      <button type="button" onClick={() => toggle('profile')} title={t('Profile')}>♙ {t('Profile')}</button>
      <button type="button" onClick={() => toggle('apps')} title={t('Apps')}>▦ {t('Apps')}</button>
      <button type="button" onClick={() => toggle('sync')} title="Sync status">
        <span className={`sync-dot sync-dot--${sync.state}`} /> {t(SYNC_LABELS[sync.state].short)}
      </button>
      <Link to={`${base}/chat`}>💬 {t('Chat')}</Link>
      <Link to={`${base}/video-conferencing`}>📹 {t('Video')}</Link>
    </div>
  )
}

export default BottomToolbar
