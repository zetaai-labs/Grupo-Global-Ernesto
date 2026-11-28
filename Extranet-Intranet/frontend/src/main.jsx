
import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
  Navigate
} from 'react-router-dom'

import './index.css'
import './theme'
import './pwa/installPrompt'

// Installable app: the service worker caches only the app files (never API data). Production builds only.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

/**
 * Screens load on demand, so signing in downloads only the shell. After a new deploy an open tab may ask for
 * a file that no longer exists: it then reloads once to get the new version instead of showing a blank page.
 */
const RELOAD_KEY = 'gg_chunk_reload'
function page(loader) {
  return lazy(() => loader()
    .then((module) => {
      try { window.sessionStorage.removeItem(RELOAD_KEY) } catch { /* ignore */ }
      return module
    })
    .catch((error) => {
      let reloaded = true
      try { reloaded = window.sessionStorage.getItem(RELOAD_KEY) === '1' } catch { /* ignore */ }
      if (!reloaded) {
        try { window.sessionStorage.setItem(RELOAD_KEY, '1') } catch { /* ignore */ }
        window.location.reload()
        return new Promise(() => {})
      }
      throw error
    }))
}

// Landing page
const Landing = page(() => import('./components/Landing Page/Landing.jsx'))

// Authentication
import Login from './components/Login/Login.jsx'
const ResetPassword = page(() => import('./components/Login/ResetPassword.jsx'))
import ProtectedRoute from './components/Auth/ProtectedRoute.jsx'
import Unauthorized from './components/Auth/Unauthorized.jsx'
import CookieNotice from './components/Portals/Shared/privacy/CookieNotice.jsx'
const ReceivedFileUpload = page(() => import('./components/Public/ReceivedFileUpload.jsx'))
const Onboarding = page(() => import('./components/Public/Onboarding.jsx'))
const Legal = page(() => import('./components/Public/Legal.jsx'))
const Privacy = page(() => import('./components/Portals/Shared/Privacy.jsx'))
const VerifyCertificate = page(() => import('./components/Public/VerifyCertificate.jsx'))
const Organizations = page(() => import('./components/Portals/Intranet/Features/Organizations/Organizations.jsx'))
const Courses = page(() => import('./components/Portals/Intranet/Features/Courses/Courses.jsx'))
const Community = page(() => import('./components/Portals/Intranet/Features/Community/Community.jsx'))
const Ethics = page(() => import('./components/Portals/Intranet/Features/Ethics/Ethics.jsx'))
const InvestorVault = page(() => import('./components/Portals/Intranet/Features/InvestorVault/InvestorVault.jsx'))
const Projects = page(() => import('./components/Portals/Intranet/Features/Projects/Projects.jsx'))
const Crm = page(() => import('./components/Portals/Intranet/Features/Crm/Crm.jsx'))
const DataImport = page(() => import('./components/Portals/Intranet/Features/DataImport/DataImport.jsx'))
const Commercial = page(() => import('./components/Portals/Intranet/Features/Commercial/Commercial.jsx'))
const Integrations = page(() => import('./components/Portals/Intranet/Features/Integrations/Integrations.jsx'))
const SystemHub = page(() => import('./components/Portals/Intranet/Features/SystemHub/SystemHub.jsx'))
const CallCenter = page(() => import('./components/Portals/Intranet/Features/CallCenter/CallCenter.jsx'))
const AssistantKnowledge = page(() => import('./components/Portals/Intranet/Features/AssistantKnowledge/AssistantKnowledge.jsx'))
const Billing = page(() => import('./components/Portals/Intranet/Features/Billing/Billing.jsx'))
const Provisioning = page(() => import('./components/Portals/Intranet/Features/Provisioning/Provisioning.jsx'))
const MyBilling = page(() => import('./components/Portals/Extranet/Features/MyBilling/MyBilling.jsx'))
const ZylaxHub = page(() => import('./components/Portals/Shared/Zylax/ZylaxHub.jsx'))
const ZylaxModule = page(() => import('./components/Portals/Shared/Zylax/ZylaxModule.jsx'))
const MyOrders = page(() => import('./components/Portals/Extranet/Features/MyOrders/MyOrders.jsx'))
const MfaSettings = page(() => import('./components/Auth/MfaSettings.jsx'))

// Portal layouts
import IntranetPortal from './components/Portals/IntranetPortal.jsx'
import ExtranetPortal from './components/Portals/ExtranetPortal.jsx'

// Intranet features
const Workspace = page(() => import('./components/Portals/Shared/workspace/Workspace.jsx'))
const Overview = page(() => import('./components/Portals/Intranet/Features/Overview/Overview.jsx'))
const CloudFolders = page(() => import('./components/Portals/Intranet/Features/CloudFolders/CloudFolders.jsx'))
const LinkedFolder = page(() => import('./components/Portals/Intranet/Features/LinkedFolder/LinkedFolder.jsx'))
const MetaLinks = page(() => import('./components/Portals/Intranet/Features/MetaLinks/MetaLinks.jsx'))
const WebReceivedFiles = page(() => import('./components/Portals/Intranet/Features/WebReceivedFiles/WebReceivedFiles.jsx'))
const AutoFlow = page(() => import('./components/Portals/Intranet/Features/AutoFlow/AutoFlow.jsx'))
const Calendar = page(() => import('./components/Portals/Intranet/Features/Calendar/Calendar.jsx'))
const RecycleBin = page(() => import('./components/Portals/Intranet/Features/RecycleBin/RecycleBin.jsx'))
const Backups = page(() => import('./components/Portals/Intranet/Features/Backups/Backups.jsx'))
const Emails = page(() => import('./components/Portals/Intranet/Features/Emails/Emails.jsx'))
const ExternalShares = page(() => import('./components/Portals/Intranet/Features/ExternalShares/ExternalShares.jsx'))
const UserManagement = page(() => import('./components/Portals/Intranet/Features/UserManagement/UserManagement.jsx'))
const SystemWebPage = page(() => import('./components/Portals/Intranet/Features/SystemWebPage/SystemWebPage.jsx'))
const AuditLog = page(() => import('./components/Portals/Intranet/Features/AuditLog/AuditLog.jsx'))
const IntranetChat = page(() => import('./components/Portals/Intranet/Features/Chat/Chat.jsx'))
const IntranetVideo = page(() => import('./components/Portals/Intranet/Features/VideoConferencing/VideoConferencing.jsx'))

// Extranet features
const ExtranetOverview = page(() => import('./components/Portals/Extranet/Features/Overview/Overview.jsx'))
const SharedDocuments = page(() => import('./components/Portals/Extranet/Features/SharedDocuments/SharedDocuments.jsx'))
const MySubmissions = page(() => import('./components/Portals/Extranet/Features/MySubmissions/MySubmissions.jsx'))
const SharedLinks = page(() => import('./components/Portals/Extranet/Features/SharedLinks/SharedLinks.jsx'))
const ProjectUpdates = page(() => import('./components/Portals/Extranet/Features/ProjectUpdates/ProjectUpdates.jsx'))
const MyVault = page(() => import('./components/Portals/Extranet/Features/InvestorVault/MyVault.jsx'))
const Resources = page(() => import('./components/Portals/Extranet/Features/Resources/Resources.jsx'))
const ExtranetChat = page(() => import('./components/Portals/Extranet/Features/Chat/Chat.jsx'))
const ExtranetVideo = page(() => import('./components/Portals/Extranet/Features/VideoConferencing/VideoConferencing.jsx'))

// Local development only: a dev server started with VITE_DEMO_AS=<role> signs in as that demo
// account when "/" is opened. Never active in a production build.
const DEMO_AS = import.meta.env.DEV ? import.meta.env.VITE_DEMO_AS : ''

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      {/* Landing Page */}
      <Route path="/" element={DEMO_AS ? <Navigate to={`/login?as=${encodeURIComponent(DEMO_AS)}`} replace /> : <Landing />} />

      {/* Authentication */}
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="/upload" element={<ReceivedFileUpload />} />
      <Route path="/onboarding" element={<Onboarding />} />
      <Route path="/legal/:doc" element={<Legal />} />
      <Route path="/verify-certificate" element={<VerifyCertificate />} />

      {/* Intranet Portal — employees and administrators only */}
      <Route
        path="/intranet"
        element={
          <ProtectedRoute portal="intranet">
            <IntranetPortal />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="overview" replace />} />

        <Route path="overview" element={<Overview />} />
        <Route path="workspace" element={<Workspace />} />
        <Route path="cloud-folders" element={<CloudFolders />} />
        <Route path="linked-folder" element={<LinkedFolder />} />
        <Route path="metalinks" element={<MetaLinks />} />
        <Route path="web-received-files" element={<WebReceivedFiles />} />
        <Route path="autoflow" element={<AutoFlow />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="recycle-bin" element={<RecycleBin />} />
        <Route path="emails" element={<Emails />} />
        <Route path="external-shares" element={<ExternalShares />} />
        <Route path="system-web-page" element={<SystemWebPage />} />
        <Route path="system" element={<ProtectedRoute roles={['admin', 'tech_admin']}><SystemHub /></ProtectedRoute>} />
        <Route path="integrations" element={<ProtectedRoute roles={['admin', 'tech_admin']}><Integrations /></ProtectedRoute>} />
        <Route path="call-center" element={<CallCenter />} />
        <Route path="assistant-knowledge" element={<ProtectedRoute roles={['admin', 'tech_admin']}><AssistantKnowledge /></ProtectedRoute>} />
        <Route path="billing" element={<ProtectedRoute roles={['admin', 'finance']}><Billing /></ProtectedRoute>} />
        <Route path="accounts" element={<ProtectedRoute roles={['admin', 'tech_admin']}><Provisioning /></ProtectedRoute>} />
        <Route path="security" element={<MfaSettings />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="courses" element={<Courses />} />
        <Route path="community" element={<Community />} />
        <Route path="ethics" element={<Ethics />} />
        <Route
          path="investor-vault"
          element={
            <ProtectedRoute roles={['admin']}>
              <InvestorVault />
            </ProtectedRoute>
          }
        />
        <Route path="projects" element={<Projects />} />
        <Route path="crm" element={<Crm />} />
        <Route path="data-import" element={<ProtectedRoute roles={['admin', 'tech_admin', 'manager']}><DataImport /></ProtectedRoute>} />
        <Route path="zylax" element={<ZylaxHub />} />
        <Route path="zylax/:module" element={<ZylaxModule />} />
        <Route path="commercial" element={<ProtectedRoute roles={['admin', 'manager', 'employee', 'finance']}><Commercial /></ProtectedRoute>} />
        <Route
          path="organizations"
          element={
            <ProtectedRoute roles={['admin', 'tech_admin', 'hr', 'manager']}>
              <Organizations />
            </ProtectedRoute>
          }
        />
        <Route
          path="backups"
          element={
            <ProtectedRoute roles={['admin', 'tech_admin']}>
              <Backups />
            </ProtectedRoute>
          }
        />
        <Route
          path="audit-log"
          element={
            <ProtectedRoute roles={['admin', 'tech_admin']}>
              <AuditLog />
            </ProtectedRoute>
          }
        />
        <Route
          path="user-management"
          element={
            <ProtectedRoute roles={['admin', 'tech_admin', 'hr']}>
              <UserManagement />
            </ProtectedRoute>
          }
        />

        {/* Intranet Communication */}
        <Route path="chat" element={<IntranetChat />} />
        <Route path="video-conferencing" element={<IntranetVideo />} />
      </Route>

      {/* Extranet Portal — partners, clients and suppliers only */}
      <Route
        path="/extranet"
        element={
          <ProtectedRoute portal="extranet">
            <ExtranetPortal />
          </ProtectedRoute>
        }
      >
        <Route index element={<Navigate to="overview" replace />} />

        <Route path="overview" element={<ExtranetOverview />} />

        <Route path="workspace" element={<Workspace />} />
        <Route path="shared-documents" element={<SharedDocuments />} />
        <Route path="my-submissions" element={<MySubmissions />} />
        <Route path="shared-links" element={<SharedLinks />} />
        <Route path="project-updates" element={<ProjectUpdates />} />
        <Route path="zylax" element={<ProtectedRoute roles={['client', 'partner', 'supplier']}><ZylaxHub /></ProtectedRoute>} />
        <Route path="zylax/:module" element={<ProtectedRoute roles={['client', 'partner', 'supplier']}><ZylaxModule /></ProtectedRoute>} />
        <Route path="orders" element={<ProtectedRoute roles={['client', 'partner']}><MyOrders /></ProtectedRoute>} />
        <Route path="billing" element={<ProtectedRoute roles={['client', 'partner', 'supplier', 'investor']}><MyBilling /></ProtectedRoute>} />
        <Route path="ethics" element={<Ethics />} />
        <Route path="courses" element={<Courses />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="security" element={<MfaSettings />} />
        <Route
          path="investor-vault"
          element={
            <ProtectedRoute roles={['investor']}>
              <MyVault />
            </ProtectedRoute>
          }
        />
        <Route path="resources" element={<Resources />} />

        {/* Extranet Communication */}
        <Route path="chat" element={<ExtranetChat />} />
        <Route path="video-conferencing" element={<ExtranetVideo />} />
      </Route>

      {/* Unknown routes */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </>
  )
)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Suspense fallback={<div className="page-loading" role="status" aria-live="polite" />}>
      <RouterProvider router={router} />
    </Suspense>
    <CookieNotice />
  </StrictMode>
)
