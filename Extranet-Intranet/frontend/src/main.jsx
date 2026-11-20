
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import {
  createBrowserRouter,
  createRoutesFromElements,
  Route,
  RouterProvider,
  Navigate
} from 'react-router-dom'

import './index.css'

// Landing page
import Landing from './components/Landing Page/Landing.jsx'

// Authentication
import Login from './components/Login/Login.jsx'
import ResetPassword from './components/Login/ResetPassword.jsx'
import ProtectedRoute from './components/Auth/ProtectedRoute.jsx'
import Unauthorized from './components/Auth/Unauthorized.jsx'
import ReceivedFileUpload from './components/Public/ReceivedFileUpload.jsx'
import MfaSettings from './components/Auth/MfaSettings.jsx'

// Portal layouts
import IntranetPortal from './components/Portals/IntranetPortal.jsx'
import ExtranetPortal from './components/Portals/ExtranetPortal.jsx'

// Intranet features
import Overview from './components/Portals/Intranet/Features/Overview/Overview.jsx'
import CloudFolders from './components/Portals/Intranet/Features/CloudFolders/CloudFolders.jsx'
import LinkedFolder from './components/Portals/Intranet/Features/LinkedFolder/LinkedFolder.jsx'
import MetaLinks from './components/Portals/Intranet/Features/MetaLinks/MetaLinks.jsx'
import WebReceivedFiles from './components/Portals/Intranet/Features/WebReceivedFiles/WebReceivedFiles.jsx'
import AutoFlow from './components/Portals/Intranet/Features/AutoFlow/AutoFlow.jsx'
import Calendar from './components/Portals/Intranet/Features/Calendar/Calendar.jsx'
import RecycleBin from './components/Portals/Intranet/Features/RecycleBin/RecycleBin.jsx'
import Backups from './components/Portals/Intranet/Features/Backups/Backups.jsx'
import Emails from './components/Portals/Intranet/Features/Emails/Emails.jsx'
import ExternalShares from './components/Portals/Intranet/Features/ExternalShares/ExternalShares.jsx'
import UserManagement from './components/Portals/Intranet/Features/UserManagement/UserManagement.jsx'
import SystemWebPage from './components/Portals/Intranet/Features/SystemWebPage/SystemWebPage.jsx'
import AuditLog from './components/Portals/Intranet/Features/AuditLog/AuditLog.jsx'
import IntranetChat from './components/Portals/Intranet/Features/Chat/Chat.jsx'
import IntranetVideo from './components/Portals/Intranet/Features/VideoConferencing/VideoConferencing.jsx'

// Extranet features
import ExtranetOverview from './components/Portals/Extranet/Features/Overview/Overview.jsx'
import SharedDocuments from './components/Portals/Extranet/Features/SharedDocuments/SharedDocuments.jsx'
import MySubmissions from './components/Portals/Extranet/Features/MySubmissions/MySubmissions.jsx'
import SharedLinks from './components/Portals/Extranet/Features/SharedLinks/SharedLinks.jsx'
import ProjectUpdates from './components/Portals/Extranet/Features/ProjectUpdates/ProjectUpdates.jsx'
import Resources from './components/Portals/Extranet/Features/Resources/Resources.jsx'
import ExtranetChat from './components/Portals/Extranet/Features/Chat/Chat.jsx'
import ExtranetVideo from './components/Portals/Extranet/Features/VideoConferencing/VideoConferencing.jsx'

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      {/* Landing Page */}
      <Route path="/" element={<Landing />} />

      {/* Authentication */}
      <Route path="/login" element={<Login />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/unauthorized" element={<Unauthorized />} />
      <Route path="/upload" element={<ReceivedFileUpload />} />

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
        <Route path="security" element={<MfaSettings />} />
        <Route
          path="backups"
          element={
            <ProtectedRoute roles={['admin']}>
              <Backups />
            </ProtectedRoute>
          }
        />
        <Route
          path="audit-log"
          element={
            <ProtectedRoute roles={['admin']}>
              <AuditLog />
            </ProtectedRoute>
          }
        />
        <Route
          path="user-management"
          element={
            <ProtectedRoute roles={['admin', 'hr']}>
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
        <Route path="shared-documents" element={<SharedDocuments />} />
        <Route path="my-submissions" element={<MySubmissions />} />
        <Route path="shared-links" element={<SharedLinks />} />
        <Route path="project-updates" element={<ProjectUpdates />} />
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
    <RouterProvider router={router} />
  </StrictMode>
)
