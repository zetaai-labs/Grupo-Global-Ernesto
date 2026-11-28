# 📅 Development Log — Early Phase (Days 1–3)

> Archived from the original README. It records the first days of the project (setup, landing page and backend planning). For the current state of the platform, see the main [README](../README.md).

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

