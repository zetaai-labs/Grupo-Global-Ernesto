// Client & Partner Hub (extranet home). English key -> [es, ar, ru, fr].
const TEXTS = {
  'Client & Partner Hub': ['Centro de clientes y socios', 'مركز العملاء والشركاء', 'Центр клиентов и партнёров', 'Espace clients et partenaires'],
  'Investor Confidential Vault': ['Bóveda confidencial del inversor', 'خزنة المستثمر السرية', 'Конфиденциальное хранилище инвестора', 'Coffre confidentiel de l’investisseur'],
  'Supplier Hub': ['Centro de proveedores', 'مركز الموردين', 'Центр поставщиков', 'Espace fournisseurs'],
  'Welcome, {name}': ['Bienvenido, {name}', 'مرحبًا يا {name}', 'Добро пожаловать, {name}', 'Bienvenue, {name}'],
  'Your secure workspace with Global Group.': ['Tu espacio de trabajo seguro con Global Group.', 'مساحة عملك الآمنة مع Global Group.', 'Ваше защищённое рабочее пространство с Global Group.', 'Votre espace de travail sécurisé avec Global Group.'],
  'Open my vault': ['Abrir mi bóveda', 'افتح خزنتي', 'Открыть моё хранилище', 'Ouvrir mon coffre'],
  'Accept the confidentiality agreement (NDA) to unlock shared documents': [
    'Acepta el acuerdo de confidencialidad (NDA) para desbloquear los documentos compartidos',
    'اقبل اتفاقية السرية (NDA) لفتح المستندات المشتركة',
    'Примите соглашение о конфиденциальности (NDA), чтобы открыть общие документы',
    'Acceptez l’accord de confidentialité (NDA) pour débloquer les documents partagés',
  ],
  'Read and accept': ['Leer y aceptar', 'اقرأ واقبل', 'Прочитать и принять', 'Lire et accepter'],
  'Invoices to pay: {total}': ['Facturas por pagar: {total}', 'فواتير مستحقة الدفع: {total}', 'Счета к оплате: {total}', 'Factures à payer : {total}'],
  'Pay now': ['Pagar ahora', 'ادفع الآن', 'Оплатить', 'Payer maintenant'],
  'Quotes waiting for your answer': ['Presupuestos esperando tu respuesta', 'عروض أسعار بانتظار ردك', 'Предложения ждут вашего ответа', 'Devis en attente de votre réponse'],
  'Send us a document': ['Envíanos un documento', 'أرسل لنا مستندًا', 'Отправить нам документ', 'Nous envoyer un document'],
  'Message the Global Group team': ['Escribir al equipo de Global Group', 'راسل فريق Global Group', 'Написать команде Global Group', 'Écrire à l’équipe Global Group'],
  'Start a video meeting': ['Iniciar una videollamada', 'ابدأ اجتماع فيديو', 'Начать видеовстречу', 'Démarrer une visioconférence'],
  'Deal rooms': ['Salas de operaciones', 'غرف الصفقات', 'Комнаты сделок', 'Salles de transactions'],
  'Opened to you': ['Abiertas para ti', 'مفتوحة لك', 'Открыты для вас', 'Ouvertes pour vous'],
  'Shared with your company': ['Compartidos con tu empresa', 'مشتركة مع شركتك', 'Доступны вашей компании', 'Partagés avec votre entreprise'],
  Membership: ['Membresía', 'العضوية', 'Членство', 'Adhésion'],
  None: ['Ninguna', 'لا يوجد', 'Нет', 'Aucune'],
  'Until {date}': ['Hasta el {date}', 'حتى {date}', 'До {date}', 'Jusqu’au {date}'],
  'No plan yet': ['Aún sin plan', 'لا توجد خطة بعد', 'Пока нет плана', 'Pas encore de formule'],
  'Files you sent to us': ['Archivos que nos enviaste', 'الملفات التي أرسلتها إلينا', 'Файлы, которые вы нам отправили', 'Fichiers que vous nous avez envoyés'],
  'Upcoming project milestones': ['Próximos hitos de proyecto', 'المراحل القادمة للمشاريع', 'Ближайшие этапы проектов', 'Prochains jalons de projet'],
  'All projects': ['Todos los proyectos', 'كل المشاريع', 'Все проекты', 'Tous les projets'],
  'No upcoming milestones shared with you.': ['No hay hitos próximos compartidos contigo.', 'لا توجد مراحل قادمة مشتركة معك.', 'Нет ближайших этапов, доступных вам.', 'Aucun jalon à venir partagé avec vous.'],
  'Invoice history': ['Historial de facturas', 'سجل الفواتير', 'История счетов', 'Historique des factures'],
  'No invoices yet.': ['Aún no hay facturas.', 'لا توجد فواتير بعد.', 'Счетов пока нет.', 'Aucune facture pour l’instant.'],
}

const pick = (index) => Object.fromEntries(Object.entries(TEXTS).map(([key, values]) => [key, values[index]]))
export const extranetHubEs = pick(0)
export const extranetHubAr = pick(1)
export const extranetHubRu = pick(2)
export const extranetHubFr = pick(3)
