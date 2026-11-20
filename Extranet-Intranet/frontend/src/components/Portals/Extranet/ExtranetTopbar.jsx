
import { useLocation } from 'react-router-dom'
import { getUser } from '../../../api/auth'
import NotificationBell from '../Shared/NotificationBell'
import LanguageSwitch from '../../../i18n/LanguageSwitch'
import { useT } from '../../../i18n'

const ROLE_LABELS = {
  partner: 'Partner',
  client: 'Client',
  supplier: 'Supplier',
}

const pageNames = {
  overview: 'Overview',
  'shared-documents': 'Shared Documents',
  'my-submissions': 'My Submissions',
  'shared-links': 'Shared Links',
  'project-updates': 'Project Updates',
  resources: 'Resources'
}

function ExtranetTopbar() {
  const t = useT()
  const location = useLocation()
  const user = getUser()
  const currentPage = location.pathname.split('/').filter(Boolean).pop()
  const title = pageNames[currentPage] || 'Overview'

  return (
    <header className="portal-topbar">
      <div className="topbar-breadcrumb">
        <span>{t('Extranet')}</span>
        <span className="breadcrumb-divider">/</span>
        <strong>{t(title)}</strong>
      </div>

      <div className="topbar-actions">
        <div className="topbar-search">
          <span>⌕</span>
          <input type="search" placeholder={t('Search shared workspace...')} />
          <kbd>⌘ K</kbd>
        </div>

        <LanguageSwitch />
        <NotificationBell accent="green" />

        <div className="topbar-divider" />

        <div className="topbar-profile">
          <div className="profile-avatar green-avatar">{(user?.name || 'P').charAt(0).toUpperCase()}</div>
          <div className="profile-copy">
            <strong>{user?.name || t('External user')}</strong>
            <span>{t(ROLE_LABELS[user?.role] || 'External collaborator')}</span>
          </div>
          <span className="profile-chevron">⌄</span>
        </div>
      </div>
    </header>
  )
}

export default ExtranetTopbar
