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

## 🎬 Project Demo

Explore the initial frontend interface and workspace navigation through the project demonstration video.

<p align="center">

**[▶ Watch Global Group Platform Demo Video](https://drive.google.com/file/d/1YEFBk3q8lZ2R5NVyE6IYEkPo9z0X_h_1/view)**

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

## 🔹 Day 3 — Backend Foundation, Database Planning & Business Data Analysis

<sub>Phase 03 · Backend Implementation & Data Preparation</sub>

**Objective:** Move towards full-stack development by preparing the backend architecture, analyzing the business datasets supplied by Grupo Global and defining the initial database structure and implementation sequence.

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
| 09 | Backend Scripts | Configured development and start scripts in `package.json`. | ✅ |
| 10 | PostgreSQL Planning | Identified PostgreSQL as the intended database. | 🟡 |

### 3.2 Business Dataset Analysis

As part of the initial backend planning, the datasets provided by Grupo Global were reviewed to understand their structure and determine how they should be represented in the platform database.

#### Dataset Overview

| File | Contents | Assessment |
|:---|:---|:---|
| `CANACO BASE DATOS DIRECTORIO 121017 - 220218.xlsx` | Business membership directory containing commercial names, activities, addresses, phone numbers, emails, websites and owner/contact information. | Older business directory, reported as updated through February 2018. |
| `asociaciones_2025.xlsx` — Sheet 1 | Spanish association registry information. | 64,999 records. |
| `asociaciones_2025.xlsx` — Sheet 2 | Additional association registry information. | 28,745 records. |
| `asociaciones_2025_Sheet 2.csv` | CSV copy of Sheet 2. | Duplicate dataset; should not be imported twice. |

**Dataset observations:**

- The two sheets in `asociaciones_2025.xlsx` contain 93,744 records in total.
- Sheet 1 contains three duplicate rows.
- The association registry includes fields such as `REGISTRO`, `DENOMINACION`, `PATRONIMICO`, `NIF`, `FECHA_REGISTRO`, `FECHA_CONSTITUCION`, `SEDE`, `DOMICILIO`, `CP`, `PROVINCIA`, `LOCALIDAD` and `WEB`.
- The CANACO directory has a different structure and includes business and contact information.

> **Data confidentiality:** The supplied datasets contain business and contact information. In accordance with the client's confidentiality instructions, access and processing must be restricted to authorized purposes. Data permissions and import requirements should be confirmed before records are exposed to portal users.

### 3.3 Database Design — Proposed Structure

The initial data model separates user authentication from organization records and individual contacts.

| Entity | Purpose |
|:---|:---|
| `users` | Employee, administrator, partner and client login accounts. |
| `roles` | Defines user roles such as Admin, Employee, Partner and Client. |
| `user_roles` | Connects users with their assigned roles. |
| `organizations` | Stores business and association directory records. |
| `contacts` | Stores contact persons and their organization relationships. |
| `import_staging` | Temporarily stores imported records for validation and review. |

**Important architectural distinction:**

An organization listed in an Excel directory is not automatically a registered portal user.

For example, an association can exist in the `organizations` table without having any login credentials. If an authorized representative is later invited to the Extranet, a separate user account can be created and linked to that organization.

### 3.4 Revised Backend Development Order

Based on the supplied datasets and the initial business requirements, the recommended implementation sequence is:

| # | Task | Description | Priority |
|:---:|:---|:---|:---:|
| 01 | Database Setup | Configure PostgreSQL connection and database environment. | High |
| 02 | Data Analysis & Cleaning | Validate spreadsheet columns, missing values, duplicates and formats. | High |
| 03 | Organization Management | Create the `organizations` table and organization APIs. | High |
| 04 | Contact Management | Create the `contacts` table and contact APIs. | High |
| 05 | Data Import System | Build a staging and validation process for Excel/CSV imports. | High |
| 06 | Authentication | Implement users, password hashing, login and logout. | High |
| 07 | Authorization | Implement roles, permissions and Intranet/Extranet access rules. | High |
| 08 | Cloud Folders | Implement folder and file management. | High |
| 09 | Other Portal Modules | Develop sharing, submissions, links, workflows and communication features. | Medium |

> An import staging system is proposed so that raw records can be reviewed and validated before being inserted into the main organization and contact tables.

### 3.5 Proposed Database Architecture

```text
PostgreSQL Database
│
├── users
│   ├── id
│   ├── name
│   ├── email
│   ├── password_hash
│   ├── account_type
│   └── status
│
├── roles
│   ├── id
│   └── name
│
├── user_roles
│   ├── user_id
│   └── role_id
│
├── organizations
│   ├── id
│   ├── registration_number
│   ├── name
│   ├── tax_identifier
│   ├── address
│   ├── province
│   ├── locality
│   ├── website
│   └── source
│
├── contacts
│   ├── id
│   ├── organization_id
│   ├── contact_name
│   ├── email
│   ├── phone
│   └── designation
│
└── import_staging
    ├── id
    ├── source_file
    ├── raw_data
    ├── validation_status
    └── import_status
```

*This is a proposed initial database structure. The final schema and relationships will be refined after receiving the client's detailed segmentation and access requirements.*

### 3.6 Initial API Development Targets

| Method | Endpoint | Purpose |
|:---:|:---|:---|
| POST | `/api/organizations` | Create an organization. |
| GET | `/api/organizations` | List and search organizations. |
| GET | `/api/organizations/:id` | Retrieve organization details. |
| PATCH | `/api/organizations/:id` | Update organization information. |
| POST | `/api/contacts` | Add a contact. |
| GET | `/api/contacts` | List and search contacts. |
| POST | `/api/import/preview` | Preview spreadsheet records before importing. |
| POST | `/api/import/confirm` | Import validated records. |
| POST | `/api/auth/login` | Future user authentication endpoint. |
| POST | `/api/auth/logout` | Future logout endpoint. |

These are planned API endpoints and should only be marked as implemented after development and testing.

### 3.7 Immediate Development Tasks

| # | Task | Description | Status |
|:---:|:---|:---|:---:|
| 01 | PostgreSQL Connection | Configure Node.js database connectivity using `pg`. | ⚪ Pending |
| 02 | Initial Database Tables | Create the organization, contact and import staging tables. | ⚪ Pending |
| 03 | Organization APIs | Develop initial organization CRUD operations. | ⚪ Pending |
| 04 | Contact APIs | Develop contact management operations. | ⚪ Pending |
| 05 | Spreadsheet Validation | Validate a small sample of association records. | ⚪ Pending |
| 06 | Data Import | Test importing cleaned records into PostgreSQL. | ⚪ Pending |
| 07 | Authentication | Implement login, logout and password hashing. | ⚪ Planned |
| 08 | Role-Based Access | Configure user roles and portal-level permissions. | ⚪ Planned |

### 3.8 Client Requirements & Pending Clarifications

The following requirements need confirmation from Grupo Global before finalizing the database and authorization architecture:

- Which associations and businesses should be represented in the Intranet versus the Extranet?
- Which organizations should receive portal accounts?
- Who is authorized to access, view, update or manage each organization's information?
- What are the detailed user segments, roles and permissions?
- What are the client's approved data-import and data-retention requirements?

The detailed segmentation document expected from the client will help finalize these decisions.

### 3.9 Expected Day 3 Outcome

- Complete initial backend environment and dependency setup.
- Review and understand the business datasets supplied by Grupo Global.
- Identify the distinction between user accounts, organizations and contacts.
- Define the initial PostgreSQL database structure.
- Establish the revised backend implementation sequence.
- Prepare the organization and contact management modules.
- Plan a controlled spreadsheet import and validation workflow.
- Identify the client requirements needed for authentication and authorization.

**Day 3 Focus:** Transition from frontend-only development towards a structured full-stack application, with business data management and database architecture as the initial backend priorities.

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
| Business Dataset Analysis | Initial Review | 🟡 Completed |
| Backend Architecture Planning | Initial Structure | 🟡 Completed |
| PostgreSQL Integration | — | ⚪ Pending |
| Organization Management APIs | — | ⚪ Planned |
| Contact Management APIs | — | ⚪ Planned |
| Spreadsheet Import System | — | ⚪ Planned |
| Express Server Implementation | — | ⚪ Pending |
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
| Data Confidentiality | Restrict business and contact datasets to authorized purposes and users. |
| Data Ownership | Grupo Global Plataforma Bilateral retains ownership of platform data and content. |

These are intended architectural capabilities and are subject to implementation and validation.

---

# 🚀 10. Future Development Roadmap

| Phase | Development Area | Planned Work |
|:---:|:---|:---|
| 01 | Frontend Foundation | Complete the landing page, portal layouts and reusable components. |
| 02 | Backend Foundation | Configure Express server, environment variables and initial APIs. |
| 03 | Database Integration | Connect PostgreSQL and establish initial database models. |
| 04 | Business Data Management | Develop organization management, contact management and spreadsheet import. |
| 05 | Authentication | Develop login, user management and role-based permissions. |
| 06 | Document Management | Implement Cloud Folders, Recycle Bin, Backups and MetaLinks. |
| 07 | Collaboration | Integrate External Shares, Linked Folder and Web Received Files. |
| 08 | Communication | Implement real-time chat, email integration and video conferencing. |
| 09 | Workflow Automation | Develop AutoFlow and approval workflows. |
| 10 | Cloud Infrastructure | Integrate AWS and document storage. |
| 11 | Security & Testing | Perform authorization, security and performance testing. |
| 12 | Deployment | Prepare the platform for production deployment and regional operations. |

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
| Current Development Phase | Backend Foundation & Database Planning |
| Latest Development Log | Day 3 – Backend Foundation & Business Data Analysis |

---

<p align="center">

### 🌐 GLOBAL GROUP PLATFORM

**One Workspace. Connected Everywhere.**

*A unified digital workspace for document management, secure collaboration and global business operations.*

</p>