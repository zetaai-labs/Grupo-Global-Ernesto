# 🌐 Global Group Platform
### A Unified Digital Workspace | Intranet & Extranet

<p align="center">

**Connecting People · Managing Documents · Simplifying Collaboration**

![React](https://img.shields.io/badge/React-Frontend-61DAFB?logo=react&logoColor=black)
![Vite](https://img.shields.io/badge/Vite-Build%20Tool-646CFF?logo=vite&logoColor=white)
![Node.js](https://img.shields.io/badge/Node.js-Backend-339933?logo=node.js&logoColor=white)
![Express](https://img.shields.io/badge/Express.js-API-000000?logo=express&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Database-4169E1?logo=postgresql&logoColor=white)
![Status](https://img.shields.io/badge/Development-In%20Progress-orange)

</p>

---

## 📌 1. Project Overview

**Global Group Platform** is a modular corporate Intranet and Extranet solution being developed for **Grupo Global Plataforma Bilateral**.

The platform aims to centralize document management, internal communication, file sharing and business workflows through a unified digital workspace.

| 🏢 Intranet | 🌍 Extranet |
|:---:|:---:|
| Internal corporate workspace | External collaboration workspace |
| Employee and administrator access | Partner, vendor and client access |
| Internal documents and operations | Controlled document exchange |
| Departmental collaboration | External file sharing |
| User and permission management | Partner communication |

**Development Organization:** Zeta AI Labs Pvt. Ltd.  
**Client:** Grupo Global Plataforma Bilateral

---

## 🎯 2. Project Objectives

| Objective | Description |
|:---|:---|
| Centralized Management | Bring corporate documents and resources into one platform. |
| Secure Collaboration | Support controlled internal and external collaboration. |
| Modular Architecture | Organize the application into independent, reusable modules. |
| Regional Accessibility | Support operations across Europe, India and Global regions. |
| Workflow Automation | Reduce manual coordination through automated workflows. |
| Integrated Communication | Provide chat, video conferencing and communication tools. |

---

## 🛠️ 3. Technology Stack

### Frontend

| Technology | Purpose | Status |
|:---|:---|:---:|
| React.js | Component-based frontend development | Implemented |
| Vite | Development server and build tool | Implemented |
| JavaScript (ES6+) | Application logic | Implemented |
| React Router DOM | Client-side routing | Implemented |
| Tailwind CSS | Utility-first styling support | Configured |
| CSS3 | Custom layouts, animations and responsive styling | Implemented |
| Git & GitHub | Version control and collaboration | In Use |

### Backend & Infrastructure

| Technology | Intended Purpose | Status |
|:---|:---|:---:|
| Node.js | Backend runtime | Installed |
| Express.js | REST API development | Installed |
| PostgreSQL | Database and structured data management | Planned for integration |
| dotenv | Environment variable management | Installed |
| CORS | Cross-origin communication | Installed |
| Socket.IO | Real-time communication | Installed |
| Nodemon | Backend development and automatic restart | Installed |
| AWS | Cloud infrastructure and hosting | Planned |
| Amazon S3 | Corporate document storage | Planned |
| WebRTC | Video conferencing | Planned |
| IMAP / SMTP | Email integration | Planned |

> **Note:** Backend dependencies and initial setup have been completed. Actual API development, database connectivity, authentication and business logic are the next development activities.

---

# 📅 4. Development Progress & Daily Work Log

## 🔹 Day 1 — Initial Setup & Installation

<sub>Phase 01 · Project Initialization</sub>

**Objective:** Establish the development environment and prepare the project architecture for modular development.

| # | Task | Description | Status |
|:---:|:---|:---|:---:|
| 01 | Repository Setup | Initialized and connected the project with Git/GitHub. | ✅ |
| 02 | Node.js Setup | Prepared the Node.js and npm environment. | ✅ |
| 03 | Vite Initialization | Created the React application using Vite. | ✅ |
| 04 | React Configuration | Configured the React frontend entry point. | ✅ |
| 05 | Dependency Installation | Installed required frontend packages. | ✅ |
| 06 | Routing Preparation | Integrated React Router DOM. | ✅ |
| 07 | Styling Setup | Configured Tailwind CSS and custom CSS. | ✅ |
| 08 | Project Structure | Established modular portal folders. | ✅ |
| 09 | Development Server | Verified the application using Vite. | ✅ |

**Day 1 Outcome:** Successfully initialized the React + Vite frontend environment and established the foundation for modular Intranet and Extranet development.

---

## 🔹 Day 2 — Landing Page, Portal Architecture & UI Development

<sub>Phase 02 · Frontend Implementation</sub>

**Objective:** Develop the initial user-facing experience, implement workspace navigation and establish the modular structure for both portal environments.

### 2.1 Interactive Landing Page

| Feature | Implementation |
|:---|:---|
| Corporate Branding | Global Group logo and connected workspace identity. |
| Live Clock | Dynamic clock displaying current time. |
| Date Display | Automatically updated date information. |
| Dynamic Greeting | Morning, afternoon and evening greetings. |
| Hero Section | Corporate introduction and platform overview. |
| Interactive Highlights | Clickable feature highlights with descriptions. |
| Workspace Selection | Separate Intranet and Extranet entry cards. |
| Hover Animations | Interactive card transitions and visual feedback. |
| Loading Feedback | Workspace selection feedback. |
| Responsive Layout | Adaptable desktop and mobile styling. |

### 2.2 Intranet & Extranet Architecture

| Intranet | Extranet |
|:---|:---|
| `/intranet` | `/extranet` |
| Internal workspace | External workspace |
| Employee-focused navigation | Partner-focused navigation |
| Document and administration modules | Document-sharing modules |
| Internal communication | Partner communication |

### 2.3 Routing & Navigation

| Route | Purpose |
|:---|:---|
| `/` | Main landing page |
| `/intranet/overview` | Intranet dashboard |
| `/intranet/cloud-folders` | Cloud folder interface |
| `/intranet/linked-folder` | Linked folder interface |
| `/intranet/meta-links` | MetaLinks interface |
| `/intranet/web-received-files` | Incoming file interface |
| `/intranet/auto-flow` | Workflow interface |
| `/intranet/backups` | Backup interface |
| `/intranet/recycle-bin` | Deleted file interface |
| `/intranet/emails` | Email interface |
| `/intranet/external-shares` | External sharing interface |
| `/intranet/user-management` | User management interface |
| `/intranet/chat` | Internal chat interface |
| `/intranet/video-conferencing` | Video conferencing interface |
| `/extranet/overview` | Extranet dashboard |
| `/extranet/shared-documents` | Shared documents interface |
| `/extranet/my-submissions` | Submission interface |
| `/extranet/shared-links` | Shared links interface |
| `/extranet/chat` | Partner chat interface |
| `/extranet/video-conferencing` | Partner video conferencing interface |

### 2.4 Modular Sidebar Development

| Intranet Sidebar | Extranet Sidebar |
|:---|:---|
| Workspace Overview | Partner Workspace |
| Document Management | Documents |
| Collaboration | Information |
| Administration | Communication |
| Communication | Workspace Switching |

Implemented navigation links with active-route styling and workspace switching.

### 2.5 Communication UI

| Module | Current UI Functionality | Future Integration |
|:---|:---|:---|
| Team Chat | Conversation selection and message composition | Socket.IO and PostgreSQL |
| Video Conferencing | Meeting setup and meeting interface | WebRTC and signaling server |
| Intranet Chat | Internal communication interface | Real-time messaging |
| Extranet Chat | Partner communication interface | Real-time messaging |
| Video Meetings | Meeting interface for both portals | Camera, microphone and multi-user calls |

> These are initial frontend interfaces and interaction prototypes. Real-time messaging, video streaming and persistent storage require backend integration.

### 2.6 Styling & UI Enhancements

| Enhancement | Description |
|:---|:---|
| Global Styling | Typography, spacing and reusable design rules. |
| Custom Scrollbars | Improved scrollbar appearance. |
| Inter Font | Integrated Inter typography. |
| Gradient Backgrounds | Modern corporate visual appearance. |
| Workspace Cards | Distinct Intranet and Extranet visual identities. |
| Responsive CSS | Layout adjustments for smaller screens. |
| Animations | Hover, entrance and interaction transitions. |

**Day 2 Outcome:** Established the initial landing page, workspace navigation, modular portal architecture, sidebar navigation and communication UI prototypes.

---

## 🔹 Day 3 — Backend Development & API Foundation

<sub>Phase 03 · Backend Implementation</sub>

<badge color="success">Backend setup and installation completed</badge>

**Objective:** Begin backend development by establishing the Express server, preparing the database connection and creating the initial API architecture to connect the frontend with backend services.

### 3.1 Backend Environment Setup — Completed

| # | Task | Description | Status |
|:---:|:---|:---|:---:|
| 01 | Backend Directory | Created the separate backend project directory. | ✅ |
| 02 | Node.js Environment | Prepared the backend runtime environment. | ✅ |
| 03 | npm Initialization | Initialized the backend package configuration. | ✅ |
| 04 | Express.js | Installed Express for backend development. | ✅ |
| 05 | CORS | Installed CORS for frontend-backend communication. | ✅ |
| 06 | dotenv | Installed environment variable management. | ✅ |
| 07 | Socket.IO | Installed the real-time communication dependency. | ✅ |
| 08 | Nodemon | Installed the development restart utility. | ✅ |
| 09 | PostgreSQL Planning | Prepared the database integration direction. | 🟡 |

### 3.2 Day 3 Development Plan

| # | Task | Description | Priority |
|:---:|:---|:---|:---:|
| 01 | Express Server | Configure the main backend entry point and initialize the server. | High |
| 02 | Environment Configuration | Configure `.env` variables and separate development settings. | High |
| 03 | CORS Configuration | Allow communication between the Vite frontend and backend. | High |
| 04 | API Structure | Organize routes, controllers, middleware and configuration files. | High |
| 05 | Health Check API | Create an initial endpoint to verify backend availability. | High |
| 06 | PostgreSQL Connection | Configure the database connection and test connectivity. | High |
| 07 | Database Structure | Identify initial entities such as users, roles and workspaces. | Medium |
| 08 | API Testing | Test initial endpoints using Postman or equivalent tools. | Medium |
| 09 | Frontend Integration | Prepare the frontend to consume backend API endpoints. | Medium |

### 3.3 Proposed Backend Architecture

```text
backend/
│
├── src/
│   │
│   ├── config/
│   │   └── database.js
│   │
│   ├── controllers/
│   │
│   ├── middleware/
│   │
│   ├── routes/
│   │
│   ├── services/
│   │
│   ├── utils/
│   │
│   └── app.js
│
├── .env
├── .gitignore
├── index.js
├── package.json
└── package-lock.json
```

*This is the proposed backend structure and will be finalized as implementation progresses.*

### 3.4 Initial API Development Targets

| Method | Endpoint | Purpose |
|:---:|:---|:---|
| GET | `/api/health` | Verify backend server availability. |
| GET | `/api/users` | Initial user retrieval endpoint. |
| POST | `/api/auth/login` | Future authentication endpoint. |
| GET | `/api/workspaces` | Future workspace information endpoint. |

These are planned API endpoints; they should be marked implemented only after development and testing.

### 3.5 Expected Day 3 Outcome

- Start the Express backend server.
- Establish a clean and scalable backend structure.
- Configure environment variables and CORS.
- Create and test the initial API endpoint.
- Establish PostgreSQL connectivity.
- Prepare the foundation for authentication and frontend-backend integration.

**Day 3 Focus:** Move from frontend-only development towards a full-stack application architecture.

---

# 🧩 5. Platform Modules & Functional Scope

The following table represents the intended client-facing functionality. A listed requirement does not necessarily mean that its complete functionality has been implemented.

| # | Module | Intended Functionality | Current Status |
|:---:|:---|:---|:---:|
| 01 | Cloud Folders | Hierarchical corporate document storage and access management. | Planned |
| 02 | Recycle Bin | Deleted file management and recovery. | Planned |
| 03 | Backups | Historical and automated file backups. | Planned |
| 04 | MetaLinks | Controlled document sharing through secure links. | Planned |
| 05 | Emails | Integrated email handling and communication. | Planned |
| 06 | Linked Folder | Shared folder synchronization and quick access. | Planned |
| 07 | Web Received Files | External document upload and receiving system. | Planned |
| 08 | AutoFlow | Document approvals, task assignment and workflow automation. | Planned |
| 09 | User Management | User profiles, permissions and regional administration. | Planned |
| 10 | External Shares | Controlled file sharing with external stakeholders. | Planned |
| 11 | System Web Page | Corporate announcements, news and resources. | Planned |
| 12 | Bottom Toolbar | Profile, integrated apps, chat, video and calendar access. | Planned |
| 13 | Multi-Regional Access | Europe, India and Global access configurations. | Planned |
| 14 | External Collaboration | Secure interaction with partners, vendors and clients. | Planned |

---

# 📁 6. Current Project Structure

```text
Global-Group-Platform/
│
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── main.jsx
│   │   ├── index.css
│   │   └── components/
│   │       ├── Landing Page/
│   │       │   ├── Landing.jsx
│   │       │   └── Landing.css
│   │       └── Portals/
│   │           ├── IntranetPortal.jsx
│   │           ├── ExtranetPortal.jsx
│   │           ├── Intranet/
│   │           │   └── Features/
│   │           │       ├── Overview/
│   │           │       ├── CloudFolders/
│   │           │       ├── LinkedFolder/
│   │           │       ├── MetaLinks/
│   │           │       ├── WebReceivedFiles/
│   │           │       ├── AutoFlow/
│   │           │       ├── Backups/
│   │           │       ├── RecycleBin/
│   │           │       ├── Emails/
│   │           │       ├── ExternalShares/
│   │           │       ├── UserManagement/
│   │           │       ├── Chat/
│   │           │       └── VideoConferencing/
│   │           └── Extranet/
│   │               └── Features/
│   │                   ├── Overview/
│   │                   ├── SharedDocuments/
│   │                   ├── MySubmissions/
│   │                   ├── SharedLinks/
│   │                   ├── Chat/
│   │                   └── VideoConferencing/
│   │
│   ├── package.json
│   └── vite.config.js
│
├── backend/
│   ├── src/
│   ├── index.js
│   ├── package.json
│   └── .env
│
├── README.md
└── .gitignore
```

*The structure is a working representation and may evolve as additional shared components, backend services and database modules are introduced.*

---

# 📊 7. Development Status Dashboard

| Component | Progress | Status |
|:---|:---:|:---:|
| Initial Project Setup | 100% | ✅ Completed |
| React + Vite Configuration | 100% | ✅ Completed |
| Tailwind & CSS Configuration | Configured | ✅ Completed |
| Landing Page UI | Initial UI | 🟡 Implemented |
| Interactive Workspace Selection | Initial UI | 🟡 Implemented |
| React Router Configuration | Initial Routes | 🟡 Implemented |
| Intranet Navigation | Initial UI | 🟡 Implemented |
| Extranet Navigation | Initial UI | 🟡 Implemented |
| Chat Interface | UI Prototype | 🟡 Implemented |
| Video Conferencing Interface | UI Prototype | 🟡 Implemented |
| Backend Environment Setup | 100% | ✅ Completed |
| Backend Dependencies | Installed | ✅ Completed |
| Express Server Implementation | — | 🟡 Day 3 Plan |
| PostgreSQL Integration | — | ⚪ Pending |
| Initial REST APIs | — | ⚪ Pending |
| User Authentication | — | ⚪ Planned |
| Role-Based Access Control | — | ⚪ Planned |
| Cloud Storage Integration | — | ⚪ Planned |
| Real-Time Communication | — | ⚪ Planned |
| WebRTC Integration | — | ⚪ Planned |
| Testing & Deployment | — | ⚪ Planned |

**Legend**

| Indicator | Meaning |
|:---:|:---|
| ✅ | Completed |
| 🟡 | Initial implementation / in progress |
| ⚪ | Planned / not started |

---

# 💻 8. Installation & Local Development

### Prerequisites

| Software | Purpose | Download |
|:---|:---|:---|
| Node.js | JavaScript runtime | [Download](https://nodejs.org/) |
| npm | Package management | Included with Node.js |
| Git | Version control | [Download](https://git-scm.com/) |
| VS Code | Code editor | [Download](https://code.visualstudio.com/) |
| PostgreSQL | Database | [Download](https://www.postgresql.org/download/) |

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Local URL:

```text
http://localhost:5173/
```

### Backend

```bash
cd backend
npm install
```

Start the backend using the development script configured in `package.json`.

```bash
npm run dev
```

*The backend development command requires a corresponding `dev` script in `package.json`.*

### Production Build

```bash
cd frontend
npm run build
npm run preview
```

---

# 🔐 9. Security & Architecture Considerations

| Security Area | Intended Approach |
|:---|:---|
| User Authentication | Individual user login and identity verification. |
| Authorization | Role-based and granular permissions. |
| Regional Access | Configurable access across Europe, India and Global operations. |
| Document Security | Controlled folder and document access. |
| Audit Trail | Traceability of user and administrative activities. |
| Data Protection | Alignment with GDPR and applicable regional requirements. |
| Data Ownership | Grupo Global Plataforma Bilateral retains ownership of platform data and content. |

These are intended architectural capabilities and are subject to implementation and validation.

---

# 🚀 10. Future Development Roadmap

| Phase | Development Area | Planned Work |
|:---:|:---|:---|
| 01 | Frontend Foundation | Complete the landing page, portal layouts and reusable components. |
| 02 | Backend Foundation | Configure Express server, environment variables and initial APIs. |
| 03 | Database Integration | Connect PostgreSQL and establish initial database models. |
| 04 | Authentication | Develop login, user management and role-based permissions. |
| 05 | Document Management | Implement Cloud Folders, Recycle Bin, Backups and MetaLinks. |
| 06 | Collaboration | Integrate External Shares, Linked Folder and Web Received Files. |
| 07 | Communication | Implement real-time chat, email integration and video conferencing. |
| 08 | Workflow Automation | Develop AutoFlow and approval workflows. |
| 09 | Cloud Infrastructure | Integrate AWS and document storage. |
| 10 | Security & Testing | Perform authorization, security and performance testing. |
| 11 | Deployment | Prepare the platform for production deployment and regional operations. |

---

# 🤝 11. Development & Contribution Workflow

### Recommended Git Workflow

```bash
# Check current branch
git branch

# Create a feature branch
git checkout -b feature/your-feature-name

# Stage changes
git add .

# Commit changes
git commit -m "Add your feature description"

# Push branch
git push origin feature/your-feature-name
```

### Development Guidelines

| Guideline | Description |
|:---|:---|
| Modular Components | Keep components reusable and independent. |
| Naming Conventions | Use consistent naming for files and components. |
| Separation of Concerns | Separate UI, logic, routing and styling. |
| Responsive Design | Support desktop, tablet and mobile layouts. |
| API Readiness | Keep future backend integration in mind. |
| Version Control | Commit changes with meaningful messages. |
| Testing | Verify changes locally before pushing. |
| Documentation | Update README and technical documentation regularly. |

---

# 📋 12. Project Information

| Field | Details |
|:---|:---|
| Project Name | Global Group Platform |
| Client | Grupo Global Plataforma Bilateral |
| Development Organization | Zeta AI Labs Pvt. Ltd. |
| Platform Type | Corporate Intranet & Extranet |
| Development Approach | Frontend-first, modular architecture |
| Frontend Framework | React.js + Vite |
| Backend | Node.js + Express.js |
| Database Direction | PostgreSQL |
| Cloud Infrastructure | AWS |
| Target Regions | Europe, India and Global |
| Current Development Phase | Backend Foundation |
| Latest Development Log | Day 3 – Backend Development |

---

<p align="center">

### 🌐 GLOBAL GROUP PLATFORM

**One Workspace. Connected Everywhere.**

*A unified digital workspace for document management, secure collaboration and global business operations.*

</p>