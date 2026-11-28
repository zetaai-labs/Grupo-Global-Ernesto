// Spanish (Spain) translations. Keys are the English source text.
// Add entries here to translate more of the interface — untranslated text stays in English.
import esZylax from './es.zylax'
import esServer from './es.server'
import esIntegrations from './es.integrations'
import esBilling from './es.billing'
import esAccounts from './es.accounts'
import esExtra1 from './es.extra.1'
import esExtra2 from './es.extra.2'
import esExtra3 from './es.extra.3'
import esExtra4 from './es.extra.4'
import esExtra5 from './es.extra.5'
import esExtra6 from './es.extra.6'
import { landingEs } from './landing'
import { coursePackagesEs } from './courses.packages'
import { orgPeopleEs } from './org.people'
import { zylaxDepthEs } from './zylax.depth'
import { eventsHybridEs } from './events.hybrid'
import { aiEs } from './ai'
import { pwaEs } from './pwa'
import { aiEngineEs } from './ai.engine'
import { clockEs } from './clock'
import { videoEs } from './video'
import { monitoringEs } from './monitoring'
import { attendanceEs } from './attendance'
import { translateEs } from './translate'
import { workspaceEs } from './workspace'
import { privacyEs } from './privacy'
import { membershipEs } from './membership'
import { assistantEs } from './assistant'
import { auditEs } from './audit'
import { callCenterEs } from './callcenter'
import { privateChatEs } from './privatechat'
import { userMgmtEs } from './usermgmt'
import { presidentialEs } from './presidential'
import { extranetHubEs } from './extranethub'

const es = {
  // ---- Login & password reset ----
  'One Platform.': 'Una plataforma.',
  'Connected Globally.': 'Conectados globalmente.',
  'A unified digital workspace connecting our people, partners and business operations across regions.':
    'Un espacio de trabajo digital unificado que conecta a nuestras personas, socios y operaciones en todas las regiones.',
  Spain: 'España',
  Europe: 'Europa',
  India: 'India',
  Global: 'Global',
  Collaborate: 'Colaborar',
  Innovate: 'Innovar',
  Grow: 'Crecer',
  'Welcome to Global Group': 'Bienvenido a Global Group',
  'Sign in to access your workspace.': 'Inicia sesión para acceder a tu espacio de trabajo.',
  'Email Address': 'Correo electrónico',
  'Enter your email address': 'Introduce tu correo electrónico',
  Password: 'Contraseña',
  'Enter your password': 'Introduce tu contraseña',
  'Show password': 'Mostrar contraseña',
  'Hide password': 'Ocultar contraseña',
  'Remember Me': 'Recordarme',
  'Forgot Password?': '¿Olvidaste tu contraseña?',
  'Sign In': 'Iniciar sesión',
  'Signing in…': 'Iniciando sesión…',
  'Need help?': '¿Necesitas ayuda?',
  'Contact Support': 'Contactar con soporte',
  'Secure Access': 'Acceso seguro',
  'We could not verify those credentials. Please try again.': 'No hemos podido verificar esas credenciales. Inténtalo de nuevo.',
  'The backend is not reachable. Start the Express server on port 5000.': 'No se puede conectar con el servidor. Inténtalo de nuevo en unos minutos.',
  'Invalid email or password.': 'Correo o contraseña incorrectos.',
  'Too many login attempts. Please try again later.': 'Demasiados intentos de inicio de sesión. Inténtalo más tarde.',
  'Reset your password': 'Restablecer contraseña',
  'Choose a new password': 'Elige una nueva contraseña',
  'Enter your email and we will send you a reset link.': 'Introduce tu correo y te enviaremos un enlace para restablecerla.',
  'Enter a new password for your Global Group account.': 'Introduce una nueva contraseña para tu cuenta de Global Group.',
  'Send reset link': 'Enviar enlace',
  'Sending…': 'Enviando…',
  'New password': 'Nueva contraseña',
  'Confirm password': 'Confirmar contraseña',
  'Update password': 'Actualizar contraseña',
  'Saving…': 'Guardando…',
  'Back to sign in': 'Volver a iniciar sesión',
  'Password must be at least 8 characters.': 'La contraseña debe tener al menos 8 caracteres.',
  'Passwords do not match.': 'Las contraseñas no coinciden.',
  'If an account exists for that email, a password reset link has been sent.':
    'Si existe una cuenta con ese correo, se ha enviado un enlace para restablecer la contraseña.',
  'Password updated. You can sign in now.': 'Contraseña actualizada. Ya puedes iniciar sesión.',
  'Development mode (no SMTP):': 'Modo desarrollo (sin SMTP):',
  'open the reset link': 'abrir el enlace',

  // ---- Shell: sidebars, top bars, toolbar ----
  WORKSPACE: 'ESPACIO DE TRABAJO',
  'DOCUMENT MANAGEMENT': 'GESTIÓN DOCUMENTAL',
  COLLABORATION: 'COLABORACIÓN',
  COMMUNICATION: 'COMUNICACIÓN',
  ADMINISTRATION: 'ADMINISTRACIÓN',
  DOCUMENTS: 'DOCUMENTOS',
  INFORMATION: 'INFORMACIÓN',
  'INTERNAL WORKSPACE': 'ESPACIO INTERNO',
  'PARTNER WORKSPACE': 'ESPACIO DE SOCIOS',
  'CLIENT WORKSPACE': 'ESPACIO DE CLIENTES',
  'SUPPLIER WORKSPACE': 'ESPACIO DE PROVEEDORES',
  'EXTERNAL WORKSPACE': 'ESPACIO EXTERNO',
  INTRANET: 'INTRANET',
  EXTRANET: 'EXTRANET',
  Intranet: 'Intranet',
  Extranet: 'Extranet',
  Overview: 'Inicio',
  'Cloud Folders': 'Carpetas en la nube',
  'Linked Folder': 'Carpeta vinculada',
  MetaLinks: 'MetaEnlaces',
  'Web Received Files': 'Archivos recibidos web',
  Backups: 'Copias de seguridad',
  'Recycle Bin': 'Papelera',
  AutoFlow: 'AutoFlow',
  Calendar: 'Calendario',
  Emails: 'Correos',
  'External Shares': 'Compartidas externas',
  'Team Chat': 'Chat de equipo',
  Chat: 'Chat',
  'Video Conferencing': 'Videoconferencia',
  'Video Meetings': 'Videoreuniones',
  'System Web Page': 'Página web del sistema',
  'Audit Log': 'Registro de auditoría',
  'User Management': 'Gestión de usuarios',
  'Security (MFA)': 'Seguridad (MFA)',
  Security: 'Seguridad',
  'Shared Documents': 'Documentos compartidos',
  'My Submissions': 'Mis envíos',
  'Shared Links': 'Enlaces compartidos',
  'Project Updates': 'Novedades del proyecto',
  Resources: 'Recursos',
  'Need assistance?': '¿Necesitas ayuda?',
  'Contact your administrator': 'Contacta con tu administrador',
  'Switch to Extranet': 'Cambiar a Extranet',
  Support: 'Soporte',
  'Get help with your workspace': 'Ayuda con tu espacio de trabajo',
  'Search workspace...': 'Buscar en el espacio…',
  'Search shared workspace...': 'Buscar en el espacio compartido…',
  'Sign out': 'Cerrar sesión',
  Guest: 'Invitado',
  'No role assigned': 'Sin rol asignado',
  'External user': 'Usuario externo',
  'External collaborator': 'Colaborador externo',
  admin: 'Administrador',
  employee: 'Empleado',
  hr: 'RR. HH.',
  manager: 'Responsable',
  partner: 'Socio',
  client: 'Cliente',
  supplier: 'Proveedor',
  Partner: 'Socio',
  Client: 'Cliente',
  Supplier: 'Proveedor',
  Profile: 'Perfil',
  Apps: 'Apps',
  Video: 'Vídeo',
  'Portal hub': 'Portal principal',
  'Download my data': 'Descargar mis datos',
  'Connecting…': 'Conectando…',
  'Connecting to server…': 'Conectando con el servidor…',
  Synced: 'Sincronizado',
  'Synced with server': 'Sincronizado con el servidor',
  Offline: 'Sin conexión',
  'Server unreachable — changes may not sync': 'Servidor no disponible: los cambios podrían no sincronizarse',
  'Last sync {time}': 'Última sincronización {time}',

  // ---- Notifications ----
  Notifications: 'Notificaciones',
  'Mark all as read': 'Marcar todo como leído',
  "You're all caught up.": 'No tienes notificaciones pendientes.',
  'just now': 'ahora mismo',
  '{n} min ago': 'hace {n} min',
  '{n} h ago': 'hace {n} h',

  // ---- Page headings ----
  'Welcome back, {name}. Here is your workspace at a glance.': 'Bienvenido de nuevo, {name}. Este es el resumen de tu espacio de trabajo.',
  'Welcome back. Here is your workspace at a glance.': 'Bienvenido de nuevo. Este es el resumen de tu espacio de trabajo.',
  'Access and organize corporate documents, folders and shared resources.': 'Accede y organiza documentos, carpetas y recursos corporativos.',
  'Keep quick shortcuts to the folders you use most.': 'Accesos directos a las carpetas que más utilizas.',
  'SECURE FILE SHARING': 'COMPARTICIÓN SEGURA',
  'Create and manage secure links for controlled document distribution.': 'Crea y gestiona enlaces seguros para distribuir documentos de forma controlada.',
  'INCOMING DOCUMENTS': 'DOCUMENTOS ENTRANTES',
  'Review and organize documents uploaded by external users.': 'Revisa y organiza los documentos subidos por usuarios externos.',
  'DOCUMENT RECOVERY': 'RECUPERACIÓN DE DOCUMENTOS',
  'Scheduled and on-demand backups of the database and uploaded files.': 'Copias de seguridad programadas y manuales de la base de datos y los archivos.',
  'Review deleted files and restore items when required.': 'Revisa los archivos eliminados y restáuralos cuando sea necesario.',
  'WORKFLOW AUTOMATION': 'AUTOMATIZACIÓN DE FLUJOS',
  'Approval chains for purchases, leave, documents and onboarding — each step notifies the next approver.':
    'Cadenas de aprobación para compras, permisos, documentos e incorporaciones: cada paso avisa al siguiente aprobador.',
  'Schedule meetings, invite colleagues and partners, and join online meetings in one click.':
    'Programa reuniones, invita a compañeros y socios, y únete a reuniones online con un clic.',
  'Your private mailbox. Messages to colleagues arrive instantly; external mail uses the company mail server.':
    'Tu buzón privado. Los mensajes a compañeros llegan al instante; el correo externo usa el servidor de la empresa.',
  'Share internal folders with partners, clients and suppliers in the Extranet.':
    'Comparte carpetas internas con socios, clientes y proveedores en la Extranet.',
  'CORPORATE INFORMATION': 'INFORMACIÓN CORPORATIVA',
  'Company news and announcements for the internal workspace.': 'Noticias y avisos de la empresa para el espacio interno.',
  'Trace security-relevant activity across the platform.': 'Traza la actividad relevante para la seguridad en toda la plataforma.',
  'Manage user profiles, workspace access and organisational permissions.': 'Gestiona perfiles de usuario, accesos y permisos de la organización.',
  'Protect your account with time-based one-time passwords.': 'Protege tu cuenta con contraseñas de un solo uso basadas en tiempo.',
  'Secure group meetings for up to 8 people. Schedule one from the Calendar to invite colleagues, clients or suppliers.':
    'Reuniones seguras de hasta 8 personas. Prográmalas desde el Calendario para invitar a compañeros, clientes o proveedores.',
  'Secure team conversations in real time.': 'Conversaciones seguras del equipo en tiempo real.',
  'DOCUMENT ACCESS': 'ACCESO A DOCUMENTOS',
  'Browse documents and folders shared with your external account.': 'Consulta los documentos y carpetas compartidos con tu cuenta externa.',
  'FILE SUBMISSIONS': 'ENVÍO DE ARCHIVOS',
  'Upload documents to Global Group and track their review status.': 'Sube documentos a Global Group y sigue el estado de su revisión.',
  'SECURE ACCESS': 'ACCESO SEGURO',
  'Access secure document links provided by your organisation.': 'Accede a los enlaces seguros que te ha facilitado la organización.',
  'PROJECT INFORMATION': 'INFORMACIÓN DEL PROYECTO',
  'Stay informed about announcements and updates relevant to your collaboration.': 'Mantente al día de los avisos y novedades de tu colaboración.',
  'PARTNER RESOURCES': 'RECURSOS PARA SOCIOS',
  'Find useful documents, reference materials and shared resources.': 'Encuentra documentos útiles, material de referencia y recursos compartidos.',
  'Your secure workspace for accessing shared documents and collaborating with Global Group.':
    'Tu espacio seguro para acceder a documentos compartidos y colaborar con Global Group.',
  'SECURE SUBMISSION': 'ENVÍO SEGURO',
  'Send files to Global Group': 'Envía archivos a Global Group',
  'No account is required. Our staff will review the file you submit.': 'No necesitas cuenta. Nuestro equipo revisará el archivo que envíes.',
  'Access restricted': 'Acceso restringido',
  'Your account does not have permission to open this workspace.': 'Tu cuenta no tiene permiso para abrir este espacio.',
  // ---- Business modules (Schema & Technical documents) ----
  BUSINESS: 'NEGOCIO',
  CONFIDENTIAL: 'CONFIDENCIAL',
  COMPLIANCE: 'CUMPLIMIENTO',
  GOVERNANCE: 'GOBERNANZA',
  COMMUNITY: 'COMUNIDAD',
  'LEARNING & EVENTS': 'FORMACIÓN Y EVENTOS',
  'INVESTOR WORKSPACE': 'ESPACIO DE INVERSORES',
  'Confidential Investor': 'Inversor confidencial',
  investor: 'Inversor',
  tech_admin: 'Administrador técnico',
  'Organizations & KYC': 'Organizaciones y KYC',
  'CRM Pipeline': 'Embudo CRM',
  'Projects & Programs': 'Proyectos y programas',
  'Investor Vault': 'Bóveda de inversores',
  'Ethics & Compliance': 'Ética y cumplimiento',
  Community: 'Comunidad',
  'Courses & Events': 'Cursos y eventos',
  'Registry of business units, partners, clients, vendors and investors, with the 5-step KYC/KYB verification.':
    'Registro de unidades de negocio, socios, clientes, proveedores e inversores, con verificación KYC/KYB en 5 pasos.',
  'Business relationships across corridors, from first lead to active contract, with confidentiality controls.':
    'Relaciones de negocio en todos los corredores, del primer contacto al contrato activo, con controles de confidencialidad.',
  'Joint ventures, corporate initiatives, real estate developments and software deployments across the corridors.':
    'Empresas conjuntas, iniciativas corporativas, promociones inmobiliarias y despliegues de software en los corredores.',
  'Isolated, separately encrypted investor records and tier-1 deal rooms. Every access is logged.':
    'Registros de inversores aislados y cifrados por separado, y salas de operaciones de nivel 1. Cada acceso queda registrado.',
  'Platform access is conditioned on the corporate Code of Ethics, with a three-tier disciplinary regime.':
    'El acceso a la plataforma está condicionado al Código Ético corporativo, con un régimen disciplinario de tres niveles.',
  'Activity feed, corporate directory and sector committees across all delegations.':
    'Actividad, directorio corporativo y comités sectoriales de todas las delegaciones.',
  'Compliance courses, technical workshops and corporate events, with verifiable digital certificates.':
    'Cursos de cumplimiento, talleres técnicos y eventos corporativos, con certificados digitales verificables.',
  'Register your organisation': 'Registra tu organización',
  'Join the Grupo Global ecosystem. Every organisation is verified in 5 steps to meet EU anti-money-laundering rules.':
    'Únete al ecosistema Grupo Global. Cada organización se verifica en 5 pasos para cumplir la normativa europea contra el blanqueo de capitales.',
  'Pre-registration': 'Prerregistro',
  'Legal documents': 'Documentos legales',
  'Automatic validation': 'Validación automática',
  'AML / PEP screening': 'Control AML / PEP',
  'Approval & credentials': 'Aprobación y credenciales',
  'Confidentiality agreement (NDA)': 'Acuerdo de confidencialidad (NDA)',
  'I accept the NDA': 'Acepto el NDA',
  'Code of Ethics': 'Código Ético',
  'Presidential Master Console': 'Consola presidencial',
  'DevOps & Tech Control Center': 'Centro de control técnico y DevOps',
  'HR Operations Dashboard': 'Panel de operaciones de RR. HH.',
  'Employee & Delegate Workspace': 'Espacio de empleados y delegados',
  'Quick access': 'Acceso rápido',
  'Jump into the most used areas of the intranet.': 'Accede a las áreas más usadas de la intranet.',
  'Verify a certificate': 'Verificar un certificado',
  'Required Training': 'Formación obligatoria',
  'Complete required course': 'Completar curso obligatorio',
  'Finance Control Panel': 'Panel de control financiero',
  finance: 'Finanzas',
  'DATA PROTECTION': 'PROTECCIÓN DE DATOS',
  'Privacy (GDPR)': 'Privacidad (RGPD)',
  'Exercise your rights of Access, Rectification, Cancellation and Opposition. We respond within one month.':
    'Ejerce tus derechos de Acceso, Rectificación, Cancelación y Oposición. Respondemos en el plazo de un mes.',
  'Download my data (ZIP)': 'Descargar mis datos (ZIP)',
  'New request': 'Nueva solicitud',
  'My requests': 'Mis solicitudes',
  'Send request': 'Enviar solicitud',
  'Create new': 'Crear nuevo',
  'Your records will appear here.': 'Tus registros aparecerán aquí.',
}

export default { ...esExtra1, ...esExtra2, ...esExtra3, ...esExtra4, ...esExtra5, ...esExtra6, ...landingEs, ...coursePackagesEs, ...orgPeopleEs, ...zylaxDepthEs, ...eventsHybridEs, ...aiEs, ...pwaEs, ...aiEngineEs, ...clockEs, ...videoEs, ...monitoringEs, ...attendanceEs, ...translateEs, ...workspaceEs, ...privacyEs, ...membershipEs, ...assistantEs, ...auditEs, ...callCenterEs, ...privateChatEs, ...userMgmtEs, ...presidentialEs, ...extranetHubEs, ...esAccounts, ...esBilling, ...esIntegrations, ...esServer, ...esZylax, ...es }
