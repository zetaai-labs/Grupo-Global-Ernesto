
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
import Backups from './components/Portals/Intranet/Features/Backups/Backups.jsx'
import RecycleBin from './components/Portals/Intranet/Features/RecycleBin/RecycleBin.jsx'
import Emails from './components/Portals/Intranet/Features/Emails/Emails.jsx'
import ExternalShares from './components/Portals/Intranet/Features/ExternalShares/ExternalShares.jsx'
import UserManagement from './components/Portals/Intranet/Features/UserManagement/UserManagement.jsx'
import IntranetChat from './components/Portals/Intranet/Features/Chat/Chat.jsx'
import IntranetVideo from './components/Portals/Intranet/Features/VideoConferencing/VideoConferencing.jsx'

// Extranet features
import ExtranetOverview from './components/Portals/Extranet/Features/Overview/Overview.jsx'
import SharedDocuments from './components/Portals/Extranet/Features/SharedDocuments/SharedDocuments.jsx'
import MySubmissions from './components/Portals/Extranet/Features/MySubmissions/MySubmissions.jsx'
import SharedLinks from './components/Portals/Extranet/Features/SharedLinks/SharedLinks.jsx'
import ExtranetChat from './components/Portals/Extranet/Features/Chat/Chat.jsx'
import ExtranetVideo from './components/Portals/Extranet/Features/VideoConferencing/VideoConferencing.jsx'

const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      {/* Landing Page */}
      <Route path="/" element={<Landing />} />

      {/* Intranet Portal */}
      <Route path="/intranet" element={<IntranetPortal />}>
        <Route index element={<Navigate to="overview" replace />} />

        <Route path="overview" element={<Overview />} />
        <Route path="cloud-folders" element={<CloudFolders />} />
        <Route path="linked-folder" element={<LinkedFolder />} />
        <Route path="metalinks" element={<MetaLinks />} />
        <Route path="web-received-files" element={<WebReceivedFiles />} />
        <Route path="autoflow" element={<AutoFlow />} />
        <Route path="backups" element={<Backups />} />
        <Route path="recycle-bin" element={<RecycleBin />} />
        <Route path="emails" element={<Emails />} />
        <Route path="external-shares" element={<ExternalShares />} />
        <Route path="user-management" element={<UserManagement />} />

        {/* Intranet Communication */}
        <Route path="chat" element={<IntranetChat />} />
        <Route path="video-conferencing" element={<IntranetVideo />} />
      </Route>

      {/* Extranet Portal */}
      <Route path="/extranet" element={<ExtranetPortal />}>
        <Route index element={<Navigate to="overview" replace />} />

        <Route path="overview" element={<ExtranetOverview />} />
        <Route path="shared-documents" element={<SharedDocuments />} />
        <Route path="my-submissions" element={<MySubmissions />} />
        <Route path="shared-links" element={<SharedLinks />} />

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
