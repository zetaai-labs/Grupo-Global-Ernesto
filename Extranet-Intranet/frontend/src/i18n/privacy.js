// Privacy acceptance, cookie notice and legal pages. English key -> [es, ar, ru, fr].
const TEXTS = {
  // Acceptance dialog
  'Privacy and data protection': ['Privacidad y protección de datos', 'الخصوصية وحماية البيانات', 'Конфиденциальность и защита данных', 'Confidentialité et protection des données'],
  'Before using the platform, please read and accept how Grupo Global processes your personal data, in line with the GDPR and Spanish data protection law.': [
    'Antes de usar la plataforma, lee y acepta cómo Grupo Global trata tus datos personales, conforme al RGPD y a la ley española de protección de datos.',
    'قبل استخدام المنصة، يُرجى قراءة كيفية معالجة Grupo Global لبياناتك الشخصية والموافقة عليها، وفقًا للائحة العامة لحماية البيانات والقانون الإسباني لحماية البيانات.',
    'Прежде чем пользоваться платформой, ознакомьтесь с тем, как Grupo Global обрабатывает ваши персональные данные в соответствии с GDPR и испанским законом о защите данных, и примите эти условия.',
    'Avant d’utiliser la plateforme, veuillez lire et accepter la manière dont Grupo Global traite vos données personnelles, conformément au RGPD et à la loi espagnole sur la protection des données.',
  ],
  'Privacy policy': ['Política de privacidad', 'سياسة الخصوصية', 'Политика конфиденциальности', 'Politique de confidentialité'],
  'Terms of use': ['Condiciones de uso', 'شروط الاستخدام', 'Условия использования', 'Conditions d’utilisation'],
  'Cookie policy': ['Política de cookies', 'سياسة ملفات تعريف الارتباط', 'Политика в отношении файлов cookie', 'Politique relative aux cookies'],
  'I have read and accept the privacy policy, the terms of use and the cookie policy.': [
    'He leído y acepto la política de privacidad, las condiciones de uso y la política de cookies.',
    'لقد قرأت سياسة الخصوصية وشروط الاستخدام وسياسة ملفات تعريف الارتباط وأوافق عليها.',
    'Я прочитал(а) и принимаю политику конфиденциальности, условия использования и политику в отношении файлов cookie.',
    'J’ai lu et j’accepte la politique de confidentialité, les conditions d’utilisation et la politique relative aux cookies.',
  ],
  'You can read, download or withdraw this at any time from Privacy (GDPR) in your profile menu. Withdrawing signs you out until you accept again.': [
    'Puedes consultarlo, descargarlo o retirarlo en cualquier momento desde Privacidad (RGPD) en el menú de tu perfil. Si lo retiras, se cerrará tu sesión hasta que vuelvas a aceptarlo.',
    'يمكنك قراءة ذلك أو تنزيله أو سحبه في أي وقت من «الخصوصية (GDPR)» في قائمة ملفك الشخصي. يؤدي السحب إلى تسجيل خروجك حتى توافق مجددًا.',
    'Вы можете в любой момент просмотреть, скачать или отозвать согласие в разделе «Конфиденциальность (GDPR)» меню профиля. После отзыва вы выйдете из системы, пока снова не примете условия.',
    'Vous pouvez le consulter, le télécharger ou le retirer à tout moment depuis Confidentialité (RGPD) dans le menu de votre profil. Le retrait vous déconnecte jusqu’à une nouvelle acceptation.',
  ],
  'Your acceptance could not be recorded. Try again.': ['No se ha podido registrar tu aceptación. Inténtalo de nuevo.', 'تعذّر تسجيل موافقتك. حاول مرة أخرى.', 'Не удалось сохранить ваше согласие. Попробуйте ещё раз.', 'Votre acceptation n’a pas pu être enregistrée. Réessayez.'],
  'Decline and sign out': ['Rechazar y cerrar sesión', 'الرفض وتسجيل الخروج', 'Отказаться и выйти', 'Refuser et se déconnecter'],
  'Accept and continue': ['Aceptar y continuar', 'الموافقة والمتابعة', 'Принять и продолжить', 'Accepter et continuer'],

  // Cookie notice
  Cookies: ['Cookies', 'ملفات تعريف الارتباط', 'Файлы cookie', 'Cookies'],
  'We use only the essential cookies and storage the platform needs to work: keeping you signed in, your language and theme. No advertising or tracking.': [
    'Solo usamos las cookies y el almacenamiento esenciales para que la plataforma funcione: mantener tu sesión, tu idioma y tu tema. Sin publicidad ni seguimiento.',
    'نستخدم فقط ملفات تعريف الارتباط والتخزين الأساسية اللازمة لعمل المنصة: إبقاؤك مسجلًا للدخول، ولغتك ومظهرك. لا إعلانات ولا تتبّع.',
    'Мы используем только необходимые файлы cookie и хранилище, без которых платформа не работает: сохранение входа, языка и темы. Никакой рекламы и отслеживания.',
    'Nous utilisons uniquement les cookies et le stockage essentiels au fonctionnement de la plateforme : rester connecté, votre langue et votre thème. Ni publicité ni suivi.',
  ],
  Understood: ['Entendido', 'فهمت', 'Понятно', 'Compris'],

  // Legal pages
  'Version {version}': ['Versión {version}', 'الإصدار {version}', 'Версия {version}', 'Version {version}'],
  'Read the full text published by Grupo Global': ['Leer el texto completo publicado por Grupo Global', 'اقرأ النص الكامل الذي نشرته Grupo Global', 'Читать полный текст, опубликованный Grupo Global', 'Lire le texte intégral publié par Grupo Global'],
  'The platform sets only what it needs to work. There are no analytics, advertising or tracking cookies, so there is nothing optional to accept or refuse.': [
    'La plataforma solo guarda lo imprescindible para funcionar. No hay cookies analíticas, publicitarias ni de seguimiento, así que no hay nada opcional que aceptar o rechazar.',
    'لا تحفظ المنصة إلا ما تحتاجه لتعمل. لا توجد ملفات تعريف ارتباط للتحليلات أو الإعلانات أو التتبّع، لذا لا يوجد شيء اختياري لقبوله أو رفضه.',
    'Платформа сохраняет только то, что нужно для работы. Аналитических, рекламных и отслеживающих cookie нет, поэтому принимать или отклонять нечего.',
    'La plateforme n’enregistre que ce dont elle a besoin pour fonctionner. Il n’y a aucun cookie d’analyse, de publicité ou de suivi : rien d’optionnel à accepter ou refuser.',
  ],
  'Cookie or storage': ['Cookie o almacenamiento', 'ملف تعريف الارتباط أو التخزين', 'Cookie или хранилище', 'Cookie ou stockage'],
  Essential: ['Esencial', 'أساسي', 'Необходимый', 'Essentiel'],
  'Session and security': ['Sesión y seguridad', 'الجلسة والأمان', 'Сеанс и безопасность', 'Session et sécurité'],
  'Keeps you signed in and protects sign-in.': ['Mantiene tu sesión iniciada y protege el acceso.', 'يبقيك مسجلًا للدخول ويحمي عملية تسجيل الدخول.', 'Сохраняет вход и защищает его.', 'Vous garde connecté et protège la connexion.'],
  Preferences: ['Preferencias', 'التفضيلات', 'Настройки', 'Préférences'],
  'Remembers your language and light or dark theme.': ['Recuerda tu idioma y el tema claro u oscuro.', 'يتذكّر لغتك والمظهر الفاتح أو الداكن.', 'Запоминает язык и светлую или тёмную тему.', 'Mémorise votre langue et le thème clair ou sombre.'],
  'Offline app': ['Aplicación sin conexión', 'التطبيق دون اتصال', 'Офлайн-приложение', 'Application hors ligne'],
  'Lets the installed app open quickly and work without connection.': ['Permite que la aplicación instalada se abra rápido y funcione sin conexión.', 'يتيح للتطبيق المثبّت الفتح بسرعة والعمل دون اتصال.', 'Позволяет установленному приложению быстро открываться и работать без сети.', 'Permet à l’application installée de s’ouvrir rapidement et de fonctionner hors connexion.'],
  'You can delete them from your browser settings at any time; you will then be signed out.': ['Puedes borrarlas desde la configuración del navegador en cualquier momento; entonces se cerrará tu sesión.', 'يمكنك حذفها من إعدادات المتصفح في أي وقت، وسيتم حينها تسجيل خروجك.', 'Их можно удалить в настройках браузера в любой момент; после этого вы выйдете из системы.', 'Vous pouvez les supprimer à tout moment dans les paramètres du navigateur ; vous serez alors déconnecté.'],
  'This is a plain-language summary of how the platform works. Grupo Global’s approved legal text will be published here.': [
    'Este es un resumen en lenguaje claro de cómo funciona la plataforma. Aquí se publicará el texto legal aprobado por Grupo Global.',
    'هذا ملخص بلغة بسيطة لطريقة عمل المنصة. سيُنشر هنا النص القانوني المعتمد من Grupo Global.',
    'Это краткое описание работы платформы простым языком. Здесь будет опубликован утверждённый юридический текст Grupo Global.',
    'Ceci est un résumé en langage clair du fonctionnement de la plateforme. Le texte juridique approuvé par Grupo Global sera publié ici.',
  ],

  // Privacy policy summary
  'Who is responsible': ['Responsable', 'الجهة المسؤولة', 'Кто отвечает', 'Responsable'],
  'Grupo Global is responsible for the personal data processed on this platform. Write to {contact} for any privacy question.': [
    'Grupo Global es responsable de los datos personales tratados en esta plataforma. Escribe a {contact} para cualquier consulta de privacidad.',
    'Grupo Global مسؤولة عن البيانات الشخصية التي تُعالَج على هذه المنصة. راسل {contact} لأي سؤال يتعلق بالخصوصية.',
    'Grupo Global отвечает за персональные данные, обрабатываемые на этой платформе. По вопросам конфиденциальности пишите на {contact}.',
    'Grupo Global est responsable des données personnelles traitées sur cette plateforme. Écrivez à {contact} pour toute question de confidentialité.',
  ],
  'What we process': ['Qué datos tratamos', 'ما الذي نعالجه', 'Какие данные мы обрабатываем', 'Ce que nous traitons'],
  'Your name, work email, role, organisation and region; what you create or upload (files, messages, records); sign-in and security records; and, for registering companies, legal and identity documents for verification.': [
    'Tu nombre, correo de trabajo, rol, organización y región; lo que creas o subes (archivos, mensajes, registros); los registros de acceso y seguridad; y, para las empresas que se registran, los documentos legales y de identidad para su verificación.',
    'اسمك وبريدك الإلكتروني للعمل ودورك ومؤسستك ومنطقتك؛ وما تنشئه أو ترفعه (ملفات ورسائل وسجلات)؛ وسجلات تسجيل الدخول والأمان؛ وللشركات المسجِّلة، المستندات القانونية ومستندات الهوية للتحقق.',
    'Ваше имя, рабочий email, роль, организация и регион; то, что вы создаёте или загружаете (файлы, сообщения, записи); записи входа и безопасности; а для регистрирующихся компаний — юридические документы и удостоверения личности для проверки.',
    'Votre nom, e-mail professionnel, rôle, organisation et région ; ce que vous créez ou téléversez (fichiers, messages, enregistrements) ; les journaux de connexion et de sécurité ; et, pour les entreprises qui s’inscrivent, les documents juridiques et d’identité nécessaires à la vérification.',
  ],
  'To give you access to the workspace, run the services you use, verify member companies as anti-money-laundering rules require, keep the platform secure and meet legal duties such as working-time records and invoicing.': [
    'Para darte acceso al espacio de trabajo, prestar los servicios que usas, verificar a las empresas miembro como exigen las normas contra el blanqueo de capitales, mantener la plataforma segura y cumplir obligaciones legales como el registro de jornada y la facturación.',
    'لمنحك الوصول إلى مساحة العمل، وتشغيل الخدمات التي تستخدمها، والتحقق من الشركات الأعضاء كما تتطلب قواعد مكافحة غسل الأموال، والحفاظ على أمان المنصة، والوفاء بالالتزامات القانونية مثل سجلات وقت العمل والفوترة.',
    'Чтобы предоставить доступ к рабочему пространству, обеспечивать работу сервисов, проверять компании-участники согласно правилам противодействия отмыванию денег, защищать платформу и выполнять юридические обязанности, например учёт рабочего времени и выставление счетов.',
    'Pour vous donner accès à l’espace de travail, faire fonctionner les services que vous utilisez, vérifier les entreprises membres comme l’exige la réglementation anti-blanchiment, sécuriser la plateforme et respecter des obligations légales comme l’enregistrement du temps de travail et la facturation.',
  ],
  'Who receives it': ['Quién lo recibe', 'من يتلقّاها', 'Кто получает данные', 'Qui les reçoit'],
  'Only service providers working for Grupo Global under contract, such as hosting, email, payments and identity screening. Data stays in the European Union unless you are told otherwise.': [
    'Solo los proveedores que trabajan para Grupo Global por contrato, como alojamiento, correo, pagos y verificación de identidad. Los datos permanecen en la Unión Europea salvo que se te informe de lo contrario.',
    'مزوّدو الخدمات الذين يعملون لصالح Grupo Global بموجب عقد فقط، مثل الاستضافة والبريد الإلكتروني والمدفوعات والتحقق من الهوية. تبقى البيانات داخل الاتحاد الأوروبي ما لم يتم إبلاغك بخلاف ذلك.',
    'Только поставщики услуг, работающие на Grupo Global по договору: хостинг, почта, платежи, проверка личности. Данные остаются в Европейском союзе, если вам не сообщено иное.',
    'Uniquement les prestataires travaillant pour Grupo Global sous contrat, comme l’hébergement, la messagerie, les paiements et la vérification d’identité. Les données restent dans l’Union européenne, sauf indication contraire.',
  ],
  'How long': ['Cuánto tiempo', 'إلى متى', 'Как долго', 'Combien de temps'],
  'While your account is active, and afterwards only as long as the law requires (for example invoices, working-time records and anti-money-laundering files). Then it is deleted.': [
    'Mientras tu cuenta esté activa y, después, solo el tiempo que exija la ley (por ejemplo, facturas, registro de jornada y expedientes de prevención del blanqueo). Después se eliminan.',
    'طوال فترة نشاط حسابك، وبعدها فقط للمدة التي يفرضها القانون (مثل الفواتير وسجلات وقت العمل وملفات مكافحة غسل الأموال). ثم تُحذف.',
    'Пока ваша учётная запись активна, а затем только столько, сколько требует закон (например, счета, учёт рабочего времени и материалы по противодействию отмыванию денег). Затем данные удаляются.',
    'Tant que votre compte est actif, puis uniquement aussi longtemps que la loi l’exige (par exemple factures, registres du temps de travail et dossiers anti-blanchiment). Ensuite, elles sont supprimées.',
  ],
  'Your rights': ['Tus derechos', 'حقوقك', 'Ваши права', 'Vos droits'],
  'You can access, correct, delete, restrict or download your data, object to its use and withdraw your consent, from Privacy (GDPR) in your profile menu or by writing to {contact}. You may also complain to the Spanish Data Protection Agency (AEPD).': [
    'Puedes acceder a tus datos, rectificarlos, suprimirlos, limitarlos o descargarlos, oponerte a su uso y retirar tu consentimiento desde Privacidad (RGPD) en el menú de tu perfil o escribiendo a {contact}. También puedes reclamar ante la Agencia Española de Protección de Datos (AEPD).',
    'يمكنك الوصول إلى بياناتك أو تصحيحها أو حذفها أو تقييدها أو تنزيلها، والاعتراض على استخدامها وسحب موافقتك، من «الخصوصية (GDPR)» في قائمة ملفك الشخصي أو بمراسلة {contact}. ويمكنك أيضًا تقديم شكوى إلى الوكالة الإسبانية لحماية البيانات (AEPD).',
    'Вы можете получить доступ к своим данным, исправить, удалить, ограничить или скачать их, возразить против их использования и отозвать согласие в разделе «Конфиденциальность (GDPR)» меню профиля или написав на {contact}. Вы также можете подать жалобу в Испанское агентство по защите данных (AEPD).',
    'Vous pouvez accéder à vos données, les rectifier, les supprimer, en limiter l’usage ou les télécharger, vous opposer à leur utilisation et retirer votre consentement depuis Confidentialité (RGPD) dans le menu de votre profil ou en écrivant à {contact}. Vous pouvez aussi saisir l’Agence espagnole de protection des données (AEPD).',
  ],
  'Connections are encrypted, files and confidential fields are stored encrypted, every sensitive action is recorded in a tamper-evident audit log, and administrators must use two-step sign-in.': [
    'Las conexiones van cifradas, los archivos y campos confidenciales se guardan cifrados, cada acción sensible queda en un registro de auditoría a prueba de manipulaciones y los administradores deben usar el inicio de sesión en dos pasos.',
    'الاتصالات مشفّرة، والملفات والحقول السرية مخزّنة بشكل مشفّر، وكل إجراء حساس يُسجَّل في سجل تدقيق يكشف أي تلاعب، ويجب على المسؤولين استخدام تسجيل الدخول بخطوتين.',
    'Соединения зашифрованы, файлы и конфиденциальные поля хранятся в зашифрованном виде, каждое важное действие записывается в защищённый от подделки журнал аудита, а администраторы обязаны использовать двухэтапный вход.',
    'Les connexions sont chiffrées, les fichiers et champs confidentiels sont stockés chiffrés, chaque action sensible est consignée dans un journal d’audit infalsifiable et les administrateurs doivent utiliser la connexion en deux étapes.',
  ],

  // Terms of use summary
  'Who may use the platform': ['Quién puede usar la plataforma', 'من يمكنه استخدام المنصة', 'Кто может пользоваться платформой', 'Qui peut utiliser la plateforme'],
  'Grupo Global staff and the verified organisations it works with. Each account is personal: do not share your password or sign-in codes.': [
    'El personal de Grupo Global y las organizaciones verificadas con las que trabaja. Cada cuenta es personal: no compartas tu contraseña ni tus códigos de acceso.',
    'موظفو Grupo Global والمؤسسات التي تم التحقق منها والتي تعمل معها. كل حساب شخصي: لا تشارك كلمة المرور أو رموز تسجيل الدخول.',
    'Сотрудники Grupo Global и проверенные организации, с которыми она работает. Каждая учётная запись личная: не передавайте пароль и коды входа.',
    'Le personnel de Grupo Global et les organisations vérifiées avec lesquelles il travaille. Chaque compte est personnel : ne partagez ni votre mot de passe ni vos codes de connexion.',
  ],
  'Acceptable use': ['Uso aceptable', 'الاستخدام المقبول', 'Допустимое использование', 'Usage acceptable'],
  'Use the platform only for legitimate business with Grupo Global. Do not upload unlawful content, try to reach information you are not entitled to, or disturb the service.': [
    'Usa la plataforma solo para actividades legítimas con Grupo Global. No subas contenido ilícito, no intentes acceder a información a la que no tienes derecho ni perturbes el servicio.',
    'استخدم المنصة فقط للأعمال المشروعة مع Grupo Global. لا ترفع محتوى غير قانوني، ولا تحاول الوصول إلى معلومات لا يحق لك الاطلاع عليها، ولا تُخلّ بالخدمة.',
    'Используйте платформу только для законной деятельности с Grupo Global. Не загружайте незаконный контент, не пытайтесь получить доступ к информации без права на это и не нарушайте работу сервиса.',
    'Utilisez la plateforme uniquement pour des activités légitimes avec Grupo Global. Ne téléversez aucun contenu illicite, ne cherchez pas à accéder à des informations auxquelles vous n’avez pas droit et ne perturbez pas le service.',
  ],
  'Information shared on the platform is confidential. Verified organisations also accept a confidentiality agreement (NDA) and the Code of Ethics.': [
    'La información compartida en la plataforma es confidencial. Las organizaciones verificadas aceptan además un acuerdo de confidencialidad (NDA) y el Código Ético.',
    'المعلومات المشتركة على المنصة سرية. وتوافق المؤسسات التي تم التحقق منها أيضًا على اتفاقية عدم الإفصاح (NDA) ومدونة الأخلاقيات.',
    'Информация, которой обмениваются на платформе, конфиденциальна. Проверенные организации также принимают соглашение о неразглашении (NDA) и Этический кодекс.',
    'Les informations partagées sur la plateforme sont confidentielles. Les organisations vérifiées acceptent aussi un accord de confidentialité (NDA) et le Code d’éthique.',
  ],
  'Membership and payments': ['Membresía y pagos', 'العضوية والمدفوعات', 'Членство и платежи', 'Adhésion et paiements'],
  'Paid memberships and invoices follow the plan and price shown when you subscribe. Payments are processed by Stripe or PayPal; the platform never stores card details.': [
    'Las membresías de pago y las facturas siguen el plan y el precio mostrados al suscribirte. Los pagos los procesan Stripe o PayPal; la plataforma nunca guarda datos de tarjetas.',
    'تتبع العضويات المدفوعة والفواتير الخطة والسعر المعروضين عند الاشتراك. تتم معالجة المدفوعات عبر Stripe أو PayPal، ولا تحفظ المنصة بيانات البطاقات أبدًا.',
    'Платное членство и счета соответствуют плану и цене, указанным при оформлении. Платежи обрабатывают Stripe или PayPal; платформа никогда не хранит данные карт.',
    'Les adhésions payantes et les factures suivent la formule et le prix affichés lors de la souscription. Les paiements sont traités par Stripe ou PayPal ; la plateforme ne conserve jamais les données de carte.',
  ],
  Suspension: ['Suspensión', 'الإيقاف', 'Приостановка доступа', 'Suspension'],
  'Grupo Global may suspend access that breaks these terms, the Code of Ethics or the law, and keeps a record of the decision.': [
    'Grupo Global puede suspender el acceso que incumpla estas condiciones, el Código Ético o la ley, y deja constancia de la decisión.',
    'يجوز لـ Grupo Global إيقاف أي وصول يخالف هذه الشروط أو مدونة الأخلاقيات أو القانون، مع الاحتفاظ بسجل للقرار.',
    'Grupo Global может приостановить доступ при нарушении этих условий, Этического кодекса или закона и сохраняет запись о решении.',
    'Grupo Global peut suspendre un accès qui enfreint ces conditions, le Code d’éthique ou la loi, et conserve une trace de la décision.',
  ],

  // Privacy (GDPR) page
  'Privacy policy acceptance': ['Aceptación de la política de privacidad', 'الموافقة على سياسة الخصوصية', 'Принятие политики конфиденциальности', 'Acceptation de la politique de confidentialité'],
  'Withdraw your acceptance? You will be signed out and cannot use the platform until you accept again.': [
    '¿Retirar tu aceptación? Se cerrará tu sesión y no podrás usar la plataforma hasta que vuelvas a aceptar.',
    'هل تريد سحب موافقتك؟ سيتم تسجيل خروجك ولن تتمكن من استخدام المنصة حتى توافق مجددًا.',
    'Отозвать согласие? Вы выйдете из системы и не сможете пользоваться платформой, пока снова не примете условия.',
    'Retirer votre acceptation ? Vous serez déconnecté et ne pourrez plus utiliser la plateforme avant d’accepter à nouveau.',
  ],
  'Accepted version {version}': ['Versión {version} aceptada', 'تمت الموافقة على الإصدار {version}', 'Принята версия {version}', 'Version {version} acceptée'],
  'Withdrawn (version {version})': ['Retirada (versión {version})', 'تم السحب (الإصدار {version})', 'Отозвано (версия {version})', 'Retirée (version {version})'],
  'No record yet.': ['Aún no hay registros.', 'لا يوجد سجل بعد.', 'Записей пока нет.', 'Aucun enregistrement pour l’instant.'],
  'Withdraw my acceptance': ['Retirar mi aceptación', 'سحب موافقتي', 'Отозвать моё согласие', 'Retirer mon acceptation'],

  // Login messages
  'You declined the privacy policy, so you have been signed out. Sign in again whenever you are ready to accept it.': [
    'Has rechazado la política de privacidad, así que se ha cerrado tu sesión. Vuelve a iniciar sesión cuando quieras aceptarla.',
    'لقد رفضت سياسة الخصوصية، لذا تم تسجيل خروجك. سجّل الدخول مجددًا متى كنت مستعدًا للموافقة عليها.',
    'Вы отклонили политику конфиденциальности, поэтому вышли из системы. Войдите снова, когда будете готовы её принять.',
    'Vous avez refusé la politique de confidentialité ; vous avez donc été déconnecté. Reconnectez-vous lorsque vous serez prêt à l’accepter.',
  ],
  'Your acceptance was withdrawn and you have been signed out. To use the platform again, sign in and accept the privacy policy.': [
    'Se ha retirado tu aceptación y se ha cerrado tu sesión. Para volver a usar la plataforma, inicia sesión y acepta la política de privacidad.',
    'تم سحب موافقتك وتسجيل خروجك. لاستخدام المنصة مجددًا، سجّل الدخول ووافق على سياسة الخصوصية.',
    'Ваше согласие отозвано, и вы вышли из системы. Чтобы снова пользоваться платформой, войдите и примите политику конфиденциальности.',
    'Votre acceptation a été retirée et vous avez été déconnecté. Pour utiliser à nouveau la plateforme, connectez-vous et acceptez la politique de confidentialité.',
  ],

  // Server messages
  'Accept the privacy policy to continue.': ['Acepta la política de privacidad para continuar.', 'وافق على سياسة الخصوصية للمتابعة.', 'Примите политику конфиденциальности, чтобы продолжить.', 'Acceptez la politique de confidentialité pour continuer.'],
  'Tick the box to accept the privacy policy.': ['Marca la casilla para aceptar la política de privacidad.', 'ضع علامة في المربع للموافقة على سياسة الخصوصية.', 'Отметьте поле, чтобы принять политику конфиденциальности.', 'Cochez la case pour accepter la politique de confidentialité.'],
  'Thank you. Your acceptance has been recorded.': ['Gracias. Tu aceptación ha quedado registrada.', 'شكرًا لك. تم تسجيل موافقتك.', 'Спасибо. Ваше согласие сохранено.', 'Merci. Votre acceptation a été enregistrée.'],
  'Your consent has been withdrawn and you have been signed out.': ['Tu consentimiento se ha retirado y se ha cerrado tu sesión.', 'تم سحب موافقتك وتسجيل خروجك.', 'Ваше согласие отозвано, и вы вышли из системы.', 'Votre consentement a été retiré et vous avez été déconnecté.'],
  'Accept the privacy policy and terms to register.': ['Acepta la política de privacidad y las condiciones para registrarte.', 'وافق على سياسة الخصوصية والشروط للتسجيل.', 'Примите политику конфиденциальности и условия, чтобы зарегистрироваться.', 'Acceptez la politique de confidentialité et les conditions pour vous inscrire.'],
}

const pick = (index) => Object.fromEntries(Object.entries(TEXTS).map(([key, values]) => [key, values[index]]))
export const privacyEs = pick(0)
export const privacyAr = pick(1)
export const privacyRu = pick(2)
export const privacyFr = pick(3)
