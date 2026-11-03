
# Global Group Platform

A secure, modular corporate **Intranet and Extranet platform** designed for Grupo Global Plataforma Bilateral to centralize document management, internal communication, file sharing, and business workflows across Europe, India, and the rest of the world.

The platform aims to deliver a structured, Dataprius-style collaborative workspace under the Global Group brand, with centralized administration, controlled document access, regional permissions, and integrated communication tools.

---

## 🚀 Project Overview

**Global Group Platform** is a corporate collaboration and document management system designed to connect employees, departments, external partners, vendors, and clients through a unified digital workspace.

The platform is organized around two primary areas:

### Intranet
A centralized internal workspace for employees and administrators to manage corporate documents, collaborate across departments, communicate with colleagues, and coordinate business operations.

### Extranet
A controlled external collaboration environment designed to facilitate secure document exchange and interaction with external partners, vendors, and clients.

The platform is intended to provide an experience inspired by the modular interface and functional capabilities of Dataprius (Data Plus), customized for Grupo Global's branding, operational requirements, and multi-regional structure.

---

## ✨ Platform Features & Functional Requirements

The following modules represent the intended functional scope based on the client's requirements.

### 1. Cloud Folders

A centralized, hierarchical cloud document repository for storing and organizing corporate files and folders.

- Organize documents through a structured folder and subfolder hierarchy.
- Apply role-based access control and individual folder permissions.
- Support controlled access to departmental and project-related documents.
- Provide a centralized location for corporate document management.

### 2. Trash / Recycle Bin

A secure file recovery system designed to protect corporate documents against accidental or unauthorized deletion.

- Provide a dedicated location for deleted files.
- Support file recovery when documents are accidentally deleted.
- Apply security policies to prevent unauthorized deletion and recovery.
- Help maintain better control over document lifecycle management.

### 3. Backups

An automated and historical backup management system for protecting important corporate data.

- Maintain automated backups of corporate files and assets.
- Support historical backup management.
- Help protect business documents against accidental data loss.
- Provide a foundation for data continuity and recovery.

### 4. MetaLinks

A secure link-generation module for distributing files without requiring unrestricted access to the underlying cloud folders.

- Generate secure links for selected files and documents.
- Enable controlled file distribution.
- Support external file sharing with authorized recipients.
- Provide a more controlled approach to sharing corporate information.

### 5. Emails

An integrated email management module that brings internal messaging and email handling into the corporate workspace.

- Support direct internal communication.
- Provide email handling within the platform.
- Keep communication accessible alongside other corporate tools.
- Reduce the need to switch between separate applications for routine communication.

### 6. Linked Folder

A folder synchronization and quick-access module for connecting shared departmental folders and important project directories.

- Provide direct access to linked folders.
- Support synchronization of shared folder locations.
- Make cross-departmental directories easier to access.
- Help teams work with commonly used project and business documents.

### 7. Web Received Files

A digital inbox for receiving files submitted through external web portals and by external clients.

- Receive files uploaded through web portals.
- Centralize incoming documents from external clients.
- Provide a dedicated location for externally submitted files.
- Help internal teams manage and access received documents efficiently.

### 8. AutoFlow

A workflow automation engine for managing document-related processes and routine business operations.

- Support document approval workflows.
- Enable task assignments.
- Organize and automate defined business processes.
- Help reduce manual coordination between employees and departments.

### 9. User Management

A centralized administration dashboard for managing platform users, permissions, regional access, and activity records.

- Manage individual user profiles.
- Configure granular role-based permissions.
- Control access across Europe, India, and Global regions.
- Maintain audit logs for platform activities.
- Provide centralized administration of user access and permissions.

### 10. External Shares

A dedicated secure workspace for sharing and collaborating on files with people outside the internal organization.

- Support file-sharing activities with external partners, vendors, and clients.
- Provide a controlled environment for external collaboration.
- Manage access to shared corporate resources.
- Help maintain security when working with external stakeholders.

### 11. System Web Page

A centralized entry point for internal corporate information and organizational resources.

- Display internal portal announcements.
- Provide access to corporate news.
- Make organizational resources accessible from the platform.
- Serve as a common information gateway for authenticated users.

### 12. Bottom Toolbar & Integrated Widgets

A common navigation and communication area available to authenticated users, bringing frequently used tools together.

**User Profile**
- Provide access to the authenticated user's profile.

**Integrated Apps**
- Provide access to integrated platform applications.

**Video Conferencing**
- Provide built-in video conferencing access.
- Support meeting creation and participation through the platform.

**Real-Time Team Chat**
- Provide team communication through an integrated chat interface.
- Support real-time communication between platform users.

**Live Sync Status**
- Display real-time synchronization status.
- Help users monitor synchronization activity.

**Interactive Operational Calendar**
- Provide a side calendar for operational scheduling.
- Make important dates and activities accessible within the workspace.

### 13. Multi-Regional Access & Security

The platform is intended to support corporate operations across multiple geographical regions while maintaining centralized security and access control.

- Support regional access configurations for Europe, India, and Global operations.
- Apply role-based permissions at the platform level.
- Provide individual login access for users.
- Maintain audit-trail traceability across platform activities.
- Align document storage, sharing, and data handling with GDPR and applicable regional data-protection requirements.

### 14. External Collaboration & Extranet Access

External collaboration is supported through the platform's secure sharing and file-receiving capabilities.

- Enable controlled access for external partners, vendors, and clients.
- Support secure document distribution through MetaLinks.
- Receive external documents through Web Received Files.
- Provide dedicated external-sharing capabilities through External Shares.

The objective is to connect internal operations with external stakeholders without compromising corporate document security.

---

## 🛠️ Technology Stack

### Current Frontend

| Technology | Purpose |
|---|---|
| React.js | Component-based user interface |
| Vite | Frontend development server and build tool |
| JavaScript | Application logic |
| HTML5 | Application structure |
| CSS3 | Styling and responsive layouts |

### Planned Backend & Infrastructure

The following technologies are planned or under consideration for future development, based on the proposed platform architecture.

| Technology | Intended Purpose |
|---|---|
| Node.js | Backend runtime |
| Express.js | Backend APIs and server-side operations |
| PostgreSQL | Structured data, users, permissions, and workflow records |
| AWS | Cloud infrastructure and hosting |
| S3-compatible storage | Corporate document storage |
| WebSockets / Socket.IO | Real-time communication and synchronization updates |
| WebRTC | Video conferencing |
| IMAP / SMTP | Email integration |

**Note:** Backend services, database integration, authentication, cloud storage, and real-time services have not yet been implemented.

---

## 🔐 Security & Platform Principles

Security and regional access management are central to the platform's design.

### Individual User Access
Each user is intended to have an individual login under the Global Group platform and its own branded domain.

### Role-Based Access Control
Permissions will be managed centrally to control access to folders, documents, modules, and administrative functions.

### Regional Access Management
The platform is designed to support independently configured access for:

- Europe
- India
- Global

### Audit Trail
Platform activities are intended to be recorded through audit logs to support traceability and administrative oversight.

### Data Protection
File storage, document sharing, and audit trails are intended to align with GDPR and applicable regional data-protection requirements.

### Data Ownership
Grupo Global Plataforma Bilateral retains ownership of its platform data and content.

---

## 📁 Project Structure

The frontend is being developed using React and Vite.

The project structure will evolve as modules are implemented and the architecture is finalized.

```text
Global-Group-Platform/
│
├── frontend/
│   ├── public/
│   ├── src/
│   ├── index.html
│   ├── package.json
│   └── vite.config.js
│
├── README.md
│
└── .gitignore
```

Additional folders and services may be introduced as backend development and infrastructure integration begin.

---

## 💻 Getting Started

Follow these instructions to run the frontend locally.

### Prerequisites

Make sure you have installed:

- [Node.js](https://nodejs.org/)
- npm (included with Node.js)
- [Git](https://git-scm.com/)

### 1. Clone the Repository

```bash
git clone https://github.com/zetaai-labs/Grupo-Global-Ernesto.git
```

### 2. Navigate to the Project

```bash
cd Global-Group-Platform
```

### 3. Navigate to the Frontend

```bash
cd frontend
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Start the Development Server

```bash
npm run dev
```

The application will generally be available at:

```text
http://localhost:5173
```

### 6. Build for Production

```bash
npm run build
```

### 7. Preview the Production Build

```bash
npm run preview
```

---

## 🔧 Development Guidelines

To maintain code quality and make collaboration easier:

- Keep components modular and reusable.
- Maintain readable and consistent code.
- Separate UI components, pages, and styling wherever appropriate.
- Follow consistent naming conventions.
- Avoid hardcoding values that may later come from APIs.
- Keep future backend integration in mind.
- Ensure the interface remains responsive across different screen sizes.
- Test changes locally before pushing them.
- Document important changes and new functionality.

---

## 🤝 Collaboration & Contribution

Contributions and suggestions from developers are welcome.

If you are working on this project:

1. Clone the repository.
2. Create a separate branch for your changes.
3. Implement your changes.
4. Test your work locally.
5. Commit your changes with a meaningful commit message.
6. Push your branch to GitHub.
7. Create a Pull Request for review.

### Example Git Workflow

```bash
git checkout -b your-name

git add .

git commit -m "Add your feature description"

git push origin your-name
```

---

## 📌 Development Status

The project is currently in its initial frontend development phase.

| Component | Status |
|---|---|
| Initial frontend setup | Completed |
| React + Vite configuration | Completed |
| Frontend development | In Progress |
| Cloud Folders | Planned |
| Trash / Recycle Bin | Planned |
| Backups | Planned |
| MetaLinks | Planned |
| Emails | Planned |
| Linked Folder | Planned |
| Web Received Files | Planned |
| AutoFlow | Planned |
| User Management | Planned |
| External Shares | Planned |
| System Web Page | Planned |
| Bottom Toolbar & Widgets | Planned |
| Multi-regional access management | Planned |
| Backend development | Not Started |
| PostgreSQL integration | Not Started |
| Authentication and authorization | Planned |
| Cloud storage integration | Planned |
| Real-time communication | Planned |
| Video conferencing | Planned |
| Deployment | Planned |

*Statuses should be updated as individual features are developed and tested.*

---

## 🗺️ Future Development Direction

The platform is intended to evolve through multiple development stages:

1. **Frontend Development:** Build the core interface and modular user experience.
2. **Core Document Management:** Implement Cloud Folders, Trash / Recycle Bin, Backups, and MetaLinks.
3. **User & Access Management:** Implement authentication, user profiles, permissions, and regional access.
4. **Collaboration & Communication:** Integrate Emails, Linked Folder, Web Received Files, External Shares, chat, and video conferencing.
5. **Workflow Automation:** Develop AutoFlow and operational management capabilities.
6. **Infrastructure Integration:** Connect the backend, PostgreSQL, cloud storage, and real-time services.
7. **Regional Rollout:** Prepare the platform for Europe, India, and other global operations.
8. **Testing & Stabilization:** Perform security testing, performance optimization, documentation, and deployment preparation.

---

## 📄 Project Information

| Field | Details |
|---|---|
| Project Name | Global Group Platform |
| Client | Grupo Global Plataforma Bilateral |
| Development Organization | Zeta AI Labs Pvt. Ltd. |
| Platform Type | Corporate Intranet & Extranet |
| Development Approach | Frontend-first, modular development |
| Initial Frontend Stack | React.js + Vite |
| Target Operations | Europe, India, and Global |
| Current Status | Active Development |

---

**Global Group Platform**  
*A unified digital workspace for secure document management, collaboration, and global business operations.*
