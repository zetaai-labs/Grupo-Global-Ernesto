// User Management "Add a user" form. English key -> [es, ar, ru, fr].
const TEXTS = {
  'Choose a role': ['Elige un rol', 'اختر دورًا', 'Выберите роль', 'Choisissez un rôle'],
  'Temporary password': ['Contraseña temporal', 'كلمة مرور مؤقتة', 'Временный пароль', 'Mot de passe temporaire'],
  Generate: ['Generar', 'إنشاء', 'Создать', 'Générer'],
  'Show password': ['Mostrar contraseña', 'إظهار كلمة المرور', 'Показать пароль', 'Afficher le mot de passe'],
  'Hide password': ['Ocultar contraseña', 'إخفاء كلمة المرور', 'Скрыть пароль', 'Masquer le mot de passe'],
  'Country corridor (optional)': ['Corredor de país (opcional)', 'ممر الدولة (اختياري)', 'Страновой коридор (необязательно)', 'Corridor pays (facultatif)'],
  'Company (optional)': ['Empresa (opcional)', 'الشركة (اختياري)', 'Компания (необязательно)', 'Entreprise (facultatif)'],
  'Decides which country folders and records this person sees. Leave empty for staff who work across all countries.': [
    'Decide qué carpetas y registros de país ve esta persona. Déjalo vacío para el personal que trabaja en todos los países.',
    'يحدد مجلدات وسجلات الدولة التي يراها هذا الشخص. اتركه فارغًا للموظفين الذين يعملون في جميع الدول.',
    'Определяет, какие папки и записи по странам видит этот человек. Оставьте пустым для сотрудников, работающих во всех странах.',
    'Détermine les dossiers et fiches pays que cette personne voit. Laissez vide pour le personnel qui travaille dans tous les pays.',
  ],
  'The Grupo Global company or member company this person belongs to.': [
    'La empresa de Grupo Global o empresa miembro a la que pertenece esta persona.',
    'شركة Grupo Global أو الشركة العضو التي ينتمي إليها هذا الشخص.',
    'Компания Grupo Global или компания-участник, к которой относится этот человек.',
    'La société de Grupo Global ou l’entreprise membre à laquelle appartient cette personne.',
  ],
  'At least 10 characters. Use Generate for a strong one.': [
    'Al menos 10 caracteres. Usa Generar para una segura.',
    '10 أحرف على الأقل. استخدم «إنشاء» لكلمة مرور قوية.',
    'Не менее 10 символов. Нажмите «Создать» для надёжного пароля.',
    'Au moins 10 caractères. Utilisez Générer pour un mot de passe robuste.',
  ],
  'Account created. Send these sign-in details to {name} privately (not in a group chat):': [
    'Cuenta creada. Envía estos datos de acceso a {name} en privado (no en un chat de grupo):',
    'تم إنشاء الحساب. أرسل بيانات الدخول هذه إلى {name} بشكل خاص (ليس في محادثة جماعية):',
    'Учётная запись создана. Отправьте эти данные для входа {name} лично (не в групповой чат):',
    'Compte créé. Envoyez ces identifiants à {name} en privé (pas dans une discussion de groupe) :',
  ],
  'Copy sign-in details': ['Copiar datos de acceso', 'نسخ بيانات الدخول', 'Скопировать данные для входа', 'Copier les identifiants'],
  Copied: ['Copiado', 'تم النسخ', 'Скопировано', 'Copié'],
  'Ask them to change this password after their first sign-in.': [
    'Pídele que cambie esta contraseña después de su primer acceso.',
    'اطلب منه تغيير كلمة المرور هذه بعد أول تسجيل دخول.',
    'Попросите сменить этот пароль после первого входа.',
    'Demandez-lui de changer ce mot de passe après sa première connexion.',
  ],
  'Sign-in page': ['Página de acceso', 'صفحة تسجيل الدخول', 'Страница входа', 'Page de connexion'],
  'Super Administrator': ['Superadministrador', 'المسؤول الأعلى', 'Суперадминистратор', 'Super-administrateur'],
  'Technical Administrator': ['Administrador técnico', 'المسؤول التقني', 'Технический администратор', 'Administrateur technique'],
  'HR Manager': ['Responsable de RR. HH.', 'مدير الموارد البشرية', 'Менеджер по персоналу', 'Responsable RH'],
  'Finance Manager': ['Responsable de finanzas', 'المدير المالي', 'Финансовый менеджер', 'Responsable financier'],
  'Manager / Delegate': ['Responsable / Delegado', 'مدير / مندوب', 'Руководитель / Делегат', 'Responsable / Délégué'],
  'Employee / Delegate': ['Empleado / Delegado', 'موظف / مندوب', 'Сотрудник / Делегат', 'Employé / Délégué'],
  'Partner company': ['Empresa socia', 'شركة شريكة', 'Компания-партнёр', 'Entreprise partenaire'],
  'Client company': ['Empresa cliente', 'شركة عميلة', 'Компания-клиент', 'Entreprise cliente'],
  'Supplier / Vendor': ['Proveedor', 'مورّد', 'Поставщик', 'Fournisseur'],
  'Confidential Investor': ['Inversor confidencial', 'مستثمر سري', 'Конфиденциальный инвестор', 'Investisseur confidentiel'],
  'Two-step sign-in is required for your role. Set it up to continue.': [
    'Tu rol requiere verificación en dos pasos. Configúrala para continuar.',
    'دورك يتطلب تسجيل الدخول بخطوتين. قم بإعداده للمتابعة.',
    'Для вашей роли требуется двухэтапный вход. Настройте его, чтобы продолжить.',
    'Votre rôle exige la connexion en deux étapes. Configurez-la pour continuer.',
  ],
  'Set up with QR code': ['Configurar con código QR', 'الإعداد برمز QR', 'Настроить по QR-коду', 'Configurer avec un code QR'],
  'Use Google Authenticator, Microsoft Authenticator or any similar app on your phone.': [
    'Usa Google Authenticator, Microsoft Authenticator o una app similar en tu móvil.',
    'استخدم Google Authenticator أو Microsoft Authenticator أو أي تطبيق مشابه على هاتفك.',
    'Используйте Google Authenticator, Microsoft Authenticator или похожее приложение на телефоне.',
    'Utilisez Google Authenticator, Microsoft Authenticator ou une application similaire sur votre téléphone.',
  ],
  'QR code for your authenticator app': ['Código QR para tu app de autenticación', 'رمز QR لتطبيق المصادقة', 'QR-код для приложения-аутентификатора', 'Code QR pour votre application d’authentification'],
  'Install Google Authenticator or Microsoft Authenticator on your phone.': [
    'Instala Google Authenticator o Microsoft Authenticator en tu móvil.',
    'ثبّت Google Authenticator أو Microsoft Authenticator على هاتفك.',
    'Установите Google Authenticator или Microsoft Authenticator на телефон.',
    'Installez Google Authenticator ou Microsoft Authenticator sur votre téléphone.',
  ],
  'In the app, tap + and scan this QR code.': ['En la app, pulsa + y escanea este código QR.', 'في التطبيق، اضغط + وامسح رمز QR هذا.', 'В приложении нажмите + и отсканируйте этот QR-код.', 'Dans l’application, appuyez sur + et scannez ce code QR.'],
  'Type the 6-digit code the app shows, then press Enable.': [
    'Escribe el código de 6 dígitos que muestra la app y pulsa Activar.',
    'اكتب الرمز المكوّن من 6 أرقام الذي يظهره التطبيق، ثم اضغط تفعيل.',
    'Введите 6-значный код из приложения и нажмите «Включить».',
    'Saisissez le code à 6 chiffres affiché par l’application, puis appuyez sur Activer.',
  ],
  'Cannot scan? Enter the key by hand': ['¿No puedes escanear? Introduce la clave a mano', 'لا يمكنك المسح؟ أدخل المفتاح يدويًا', 'Не получается отсканировать? Введите ключ вручную', 'Impossible de scanner ? Saisissez la clé à la main'],
  Enable: ['Activar', 'تفعيل', 'Включить', 'Activer'],
  'Security keys (optional)': ['Llaves de seguridad (opcional)', 'مفاتيح الأمان (اختياري)', 'Ключи безопасности (необязательно)', 'Clés de sécurité (facultatif)'],
}

const pick = (index) => Object.fromEntries(Object.entries(TEXTS).map(([key, values]) => [key, values[index]]))
export const userMgmtEs = pick(0)
export const userMgmtAr = pick(1)
export const userMgmtRu = pick(2)
export const userMgmtFr = pick(3)
