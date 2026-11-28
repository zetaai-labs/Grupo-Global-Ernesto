/**
 * The one list of screens for each portal: the sidebar, the Workspace page and quick search (Ctrl/⌘ K)
 * all read it, so they always agree. `roles` hides screens a role cannot use (the API enforces the same rules).
 */

// Five short groups (Home, Documents, Business, Team, Administration). Screens marked `sidebar: false`
// stay reachable from the profile menu, the Apps button, the System page and quick search (Ctrl/Cmd K).
const intranet = [
  {
    label: 'HOME',
    items: [
      { name: 'Overview', path: '/intranet/overview', icon: '⌂', description: 'Your day at a glance: what needs you, key numbers and recent activity.' },
      { name: 'All features', path: '/intranet/workspace', icon: '⊞', sidebar: false, description: 'Every tool in one place, with search and favourites.' },
      { name: 'System Web Page', path: '/intranet/system-web-page', icon: '▣', description: 'Company announcements, news and resources.' },
      { name: 'Calendar', path: '/intranet/calendar', icon: '◷', description: 'Meetings, events and reminders.' },
      { name: 'Community', path: '/intranet/community', icon: '✦', description: 'Activity feed, people directory, committees and video bios.' },
    ],
  },
  {
    label: 'DOCUMENTS',
    items: [
      { name: 'Cloud Folders', path: '/intranet/cloud-folders', icon: '▤', description: 'Company folders and files with permissions.' },
      { name: 'Linked Folder', path: '/intranet/linked-folder', icon: '⇄', description: 'Your folder linked to the company storage.' },
      { name: 'MetaLinks', path: '/intranet/metalinks', icon: '↗', description: 'Secure links to share files outside the company.' },
      { name: 'Web Received Files', path: '/intranet/web-received-files', icon: '⇩', description: 'Files sent to us through the website.' },
      { name: 'External Shares', path: '/intranet/external-shares', icon: '♧', description: 'Folders shared with partners and clients.' },
      { name: 'Backups', path: '/intranet/backups', icon: '◷', roles: ['admin', 'tech_admin'], description: 'Database and file backups, and restores.' },
      { name: 'Recycle Bin', path: '/intranet/recycle-bin', icon: '▧', description: 'Restore deleted files and folders.' },
    ],
  },
  {
    label: 'BUSINESS',
    items: [
      { name: 'Organizations & KYC', path: '/intranet/organizations', icon: '◈', roles: ['admin', 'tech_admin', 'hr', 'manager'], description: 'Member companies, verification and NDAs.' },
      { name: 'CRM Pipeline', path: '/intranet/crm', icon: '€', description: 'Leads, opportunities and next steps.' },
      { name: 'Commercial', path: '/intranet/commercial', icon: '▣', roles: ['admin', 'manager', 'employee', 'finance'], description: 'Quotes, orders and invoices for clients.' },
      { name: 'Billing', path: '/intranet/billing', icon: '€', roles: ['admin', 'finance'], description: 'Plans, subscriptions, invoices and renewal risk.' },
      { name: 'Projects & Programs', path: '/intranet/projects', icon: '▦', description: 'Projects, milestones and programme updates.' },
      { name: 'Investor Vault', path: '/intranet/investor-vault', icon: '🔒', roles: ['admin'], description: 'Encrypted documents for investors.' },
      { name: 'ZYLAX Suite', path: '/intranet/zylax', icon: '◆', description: 'HR, attendance, finance, procurement, operations and more.' },
      { name: 'Business Directory', path: '/intranet/data-import', icon: '⇪', roles: ['admin', 'tech_admin', 'manager'], description: 'Import and manage business contacts.' },
    ],
  },
  {
    label: 'TEAM',
    items: [
      { name: 'Team Chat', path: '/intranet/chat', icon: '💬', description: 'Conversations with colleagues.' },
      { name: 'Video Conferencing', path: '/intranet/video-conferencing', icon: '📹', description: 'Video meetings in the browser.' },
      { name: 'Emails', path: '/intranet/emails', icon: '✉', description: 'Company inbox and sent messages.' },
      { name: 'AutoFlow', path: '/intranet/autoflow', icon: '⟳', description: 'Approval requests and workflows.' },
      { name: 'Call Center', path: '/intranet/call-center', icon: '☎', description: 'Calls, campaigns, callbacks and the live board.' },
      { name: 'Courses & Events', path: '/intranet/courses', icon: '🎓', description: 'Training, certificates and events.' },
    ],
  },
  {
    label: 'ADMINISTRATION',
    items: [
      { name: 'User Management', path: '/intranet/user-management', icon: '♙', roles: ['admin', 'tech_admin', 'hr'], description: 'Accounts, roles and access.' },
      { name: 'Audit Log', path: '/intranet/audit-log', icon: '◷', roles: ['admin', 'tech_admin'], description: 'Who did what, and when.' },
      { name: 'Ethics & Compliance', path: '/intranet/ethics', icon: '⚖', description: 'Code of Ethics and reports.' },
      { name: 'System settings', path: '/intranet/system', icon: '⚙', roles: ['admin', 'tech_admin'], description: 'Integrations, company email accounts and the AI assistant.' },
      { name: 'AI assistant knowledge', path: '/intranet/assistant-knowledge', icon: '💡', roles: ['admin', 'tech_admin'], sidebar: false, description: 'What the public assistant answers, unanswered questions and requests to the team.' },
      { name: 'Company accounts', path: '/intranet/accounts', icon: '✉', roles: ['admin', 'tech_admin'], sidebar: false, description: 'Google Workspace and Microsoft 365 accounts.' },
      { name: 'Integrations', path: '/intranet/integrations', icon: '⧉', roles: ['admin', 'tech_admin'], sidebar: false, description: 'System health and outside services.' },
      { name: 'Security (MFA)', path: '/intranet/security', icon: '✓', sidebar: false, description: 'Two-step sign-in and security keys.' },
      { name: 'Privacy (GDPR)', path: '/intranet/privacy', icon: '⛨', sidebar: false, description: 'Your data and privacy requests.' },
    ],
  },
]

const extranet = [
  {
    label: 'PARTNER WORKSPACE',
    items: [
      { name: 'Overview', path: '/extranet/overview', icon: '⌂', description: 'Your account at a glance.' },
      { name: 'All features', path: '/extranet/workspace', icon: '⊞', sidebar: false, description: 'Every tool in one place, with search and favourites.' },
      { name: 'Quotes & Orders', path: '/extranet/orders', icon: '▣', roles: ['client', 'partner'], description: 'Your quotes, orders and invoices.' },
      { name: 'Billing', path: '/extranet/billing', icon: '€', roles: ['client', 'partner', 'supplier', 'investor'], description: 'Membership, subscription and payments.' },
      { name: 'ZYLAX Extranet', path: '/extranet/zylax', icon: '◆', roles: ['client', 'partner', 'supplier'], description: 'Support tickets, bids and shared modules.' },
    ],
  },
  {
    label: 'CONFIDENTIAL',
    items: [
      { name: 'Investor Vault', path: '/extranet/investor-vault', icon: '🔒', roles: ['investor'], description: 'Your confidential investor documents.' },
    ],
  },
  {
    label: 'DOCUMENTS',
    items: [
      { name: 'Shared Documents', path: '/extranet/shared-documents', icon: '▤', description: 'Folders Global Group shares with you.' },
      { name: 'My Submissions', path: '/extranet/my-submissions', icon: '⇧', description: 'Files you have sent to us.' },
      { name: 'Shared Links', path: '/extranet/shared-links', icon: '↗', description: 'Links shared with you.' },
    ],
  },
  {
    label: 'INFORMATION',
    items: [
      { name: 'Project Updates', path: '/extranet/project-updates', icon: '◷', description: 'News about your projects.' },
      { name: 'Resources', path: '/extranet/resources', icon: '▣', description: 'Guides and useful documents.' },
      { name: 'Ethics & Compliance', path: '/extranet/ethics', icon: '⚖', description: 'Code of Ethics and reports.' },
      { name: 'Required Training', path: '/extranet/courses', icon: '🎓', description: 'Courses you need to complete.' },
      { name: 'Privacy (GDPR)', path: '/extranet/privacy', icon: '⛨', sidebar: false, description: 'Your data and privacy requests.' },
      { name: 'Security', path: '/extranet/security', icon: '✓', sidebar: false, description: 'Two-step sign-in and security keys.' },
    ],
  },
  {
    label: 'COMMUNICATION',
    items: [
      { name: 'Team Chat', path: '/extranet/chat', icon: '💬', description: 'Conversations with the Global Group team.' },
      { name: 'Video Meetings', path: '/extranet/video-conferencing', icon: '📹', description: 'Video meetings in the browser.' },
    ],
  },
]

const NAVIGATION = { intranet, extranet }

/** The groups and screens this role may open in a portal. */
export function visibleNavigation(portal, role) {
  const who = String(role || '').toLowerCase()
  return (NAVIGATION[portal] || [])
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.roles || item.roles.includes(who)) }))
    .filter((group) => group.items.length)
}

/** The sidebar: the same groups without the screens reached from elsewhere (`sidebar: false`). */
export function sidebarNavigation(portal, role) {
  return visibleNavigation(portal, role)
    .map((group) => ({ ...group, items: group.items.filter((item) => item.sidebar !== false) }))
    .filter((group) => group.items.length)
}

export const visibleScreens = (portal, role) => visibleNavigation(portal, role).flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })))
