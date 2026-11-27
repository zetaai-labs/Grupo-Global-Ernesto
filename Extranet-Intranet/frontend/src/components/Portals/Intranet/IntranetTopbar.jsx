
import { useLocation } from 'react-router-dom'
import { PORTAL_ROLES, getUser } from '../../../api/auth'
import NotificationBell from '../Shared/NotificationBell'
import LanguageSwitch from '../../../i18n/LanguageSwitch'
import ThemeSwitch from '../../../theme/ThemeSwitch'
import InstallAppButton from '../../../pwa/InstallAppButton'
import ClockButton from '../Shared/clock/ClockButton'
import ProfileMenu from '../Shared/profile/ProfileMenu'
import QuickSearch from '../Shared/workspace/QuickSearch'
import { visibleScreens } from '../Shared/navigation'
import { useT } from '../../../i18n'

const pageNames = {
  overview: 'Overview',
  workspace: 'All features',
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
  integrations: 'Integrations',
  billing: 'Billing',
  accounts: 'Company accounts',
  security: 'Security',
  privacy: 'Privacy (GDPR)'
}

function IntranetTopbar() {
  const t = useT()
  const location = useLocation()

  const user = getUser()
  const currentPage = location.pathname.split('/').filter(Boolean).pop()
  // Names come from the shared menu, so every new screen is named here too; the list above covers the rest.
  const screen = visibleScreens('intranet', user?.role).find((item) => location.pathname === item.path || location.pathname.startsWith(`${item.path}/`))
  const title = screen?.name || pageNames[currentPage] || 'Overview'
  return (
    <header className="portal-topbar">
      <div className="topbar-breadcrumb">
        <span>{t('Intranet')}</span>
        <span className="breadcrumb-divider">/</span>
        <strong>{t(title)}</strong>
      </div>

      <div className="topbar-actions">
        <QuickSearch portal="intranet" placeholder={t('Search workspace...')} />

        {PORTAL_ROLES.intranet.includes(user?.role) && <ClockButton />}
        <InstallAppButton />
        <ThemeSwitch />
        <LanguageSwitch />
        <NotificationBell />

        <div className="topbar-divider" />

        <ProfileMenu portal="intranet" />
      </div>
    </header>
  )
}

export default IntranetTopbar
