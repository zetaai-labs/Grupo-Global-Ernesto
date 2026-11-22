
import { useLocation, useNavigate } from 'react-router-dom'
import { getUser, clearSession } from '../../../api/auth'
import { closeSharedSocket } from '../../../api/socket'
import NotificationBell from '../Shared/NotificationBell'
import LanguageSwitch from '../../../i18n/LanguageSwitch'
import { useT } from '../../../i18n'

const pageNames = {
  overview: 'Overview',
  'cloud-folders': 'Cloud Folders',
  'linked-folder': 'Linked Folder',
  metalinks: 'MetaLinks',
  'web-received-files': 'Web Received Files',
  autoflow: 'AutoFlow',
  backups: 'Backups',
  'recycle-bin': 'Recycle Bin',
  emails: 'Emails',
  'external-shares': 'External Shares',
  'system-web-page': 'System Web Page',
  'user-management': 'User Management',
  organizations: 'Organizations & KYC',
  crm: 'CRM Pipeline',
  commercial: 'Commercial',
  zylax: 'ZYLAX Suite',
  projects: 'Projects & Programs',
  'investor-vault': 'Investor Vault',
  ethics: 'Ethics & Compliance',
  community: 'Community',
  courses: 'Courses & Events',
  calendar: 'Calendar',
  chat: 'Team Chat',
  'video-conferencing': 'Video Conferencing',
  'audit-log': 'Audit Log',
  security: 'Security',
  privacy: 'Privacy (GDPR)'
}

function IntranetTopbar() {
  const t = useT()
  const location = useLocation()
  const navigate = useNavigate()

  const currentPage = location.pathname.split('/').filter(Boolean).pop()
  const title = pageNames[currentPage] || 'Overview'
  const user = getUser()
  const initials = String(user?.name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('')

  const signOut = () => {
    clearSession()
    closeSharedSocket()
    navigate('/login')
  }

  return (
    <header className="portal-topbar">
      <div className="topbar-breadcrumb">
        <span>{t('Intranet')}</span>
        <span className="breadcrumb-divider">/</span>
        <strong>{t(title)}</strong>
      </div>

      <div className="topbar-actions">
        <div className="topbar-search">
          <span>⌕</span>
          <input type="search" placeholder={t('Search workspace...')} />
          <kbd>⌘ K</kbd>
        </div>

        <LanguageSwitch />
        <NotificationBell />

        <div className="topbar-divider" />

        <button
          className="topbar-profile"
          onClick={() => navigate('/intranet/user-management')}
        >
          <div className="profile-avatar">{initials}</div>
          <div className="profile-copy">
            <strong>{user?.name || t('Guest')}</strong>
            <span>{user?.role ? t(user.role) : t('No role assigned')}</span>
          </div>
          <span className="profile-chevron">⌄</span>
        </button>

        <button className="topbar-icon-btn" onClick={signOut} title={t('Sign out')}>
          ⎋
        </button>
      </div>
    </header>
  )
}

export default IntranetTopbar
