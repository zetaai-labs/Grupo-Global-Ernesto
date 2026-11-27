
import { useLocation } from 'react-router-dom'
import { getUser } from '../../../api/auth'
import NotificationBell from '../Shared/NotificationBell'
import LanguageSwitch from '../../../i18n/LanguageSwitch'
import ThemeSwitch from '../../../theme/ThemeSwitch'
import InstallAppButton from '../../../pwa/InstallAppButton'
import { useT } from '../../../i18n'
import ProfileMenu from '../Shared/profile/ProfileMenu'
import QuickSearch from '../Shared/workspace/QuickSearch'
import { visibleScreens } from '../Shared/navigation'

const ROLE_LABELS = {
  partner: 'Partner',
  client: 'Client',
  supplier: 'Supplier',
  investor: 'Confidential Investor',
}

const pageNames = {
  overview: 'Overview',
  workspace: 'All features',
  'shared-documents': 'Shared Documents',
  'my-submissions': 'My Submissions',
  'shared-links': 'Shared Links',
  'project-updates': 'Project Updates',
  orders: 'Quotes & Orders',
  zylax: 'ZYLAX Extranet',
  resources: 'Resources',
  'investor-vault': 'Investor Vault',
  ethics: 'Ethics & Compliance',
  courses: 'Required Training',
  privacy: 'Privacy (GDPR)',
  security: 'Security',
  billing: 'Billing',
  chat: 'Team Chat',
  'video-conferencing': 'Video Meetings'
}

function ExtranetTopbar() {
  const t = useT()
  const location = useLocation()
  const user = getUser()
  const currentPage = location.pathname.split('/').filter(Boolean).pop()
  // Names come from the shared menu, so every new screen is named here too; the list above covers the rest.
  const screen = visibleScreens('extranet', user?.role).find((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`))
  const title = screen?.name || pageNames[currentPage] || 'Overview'

  return (
    <header className="portal-topbar">
      <div className="topbar-breadcrumb">
        <span>{t('Extranet')}</span>
        <span className="breadcrumb-divider">/</span>
        <strong>{t(title)}</strong>
      </div>

      <div className="topbar-actions">
        <QuickSearch portal="extranet" placeholder={t('Search shared workspace...')} />

        <InstallAppButton />
        <ThemeSwitch />
        <LanguageSwitch />
        <NotificationBell accent="green" />

        <div className="topbar-divider" />

        <ProfileMenu portal="extranet" roleLabel={t(ROLE_LABELS[user?.role] || 'External collaborator')} />
      </div>
    </header>
  )
}

export default ExtranetTopbar
