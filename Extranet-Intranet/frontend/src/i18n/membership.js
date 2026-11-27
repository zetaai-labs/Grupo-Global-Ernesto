// Paid membership: registration step, survey, Compliance decision, Finance revenue split, member banner.
// English key -> [es, ar, ru, fr].
const TEXTS = {
  // Registration
  'Loading membership options…': ['Cargando opciones de membresía…', 'جارٍ تحميل خيارات العضوية…', 'Загрузка вариантов членства…', 'Chargement des formules d’adhésion…'],
  '2. Membership': ['2. Membresía', '2. العضوية', '2. Членство', '2. Adhésion'],
  '3. Primary contact': ['3. Contacto principal', '3. جهة الاتصال الرئيسية', '3. Основное контактное лицо', '3. Contact principal'],
  Membership: ['Membresía', 'العضوية', 'Членство', 'Adhésion'],
  'New member': ['Nuevo miembro', 'عضو جديد', 'Новый участник', 'Nouveau membre'],
  'Join the Grupo Global network with a paid membership.': ['Únete a la red de Grupo Global con una membresía de pago.', 'انضم إلى شبكة Grupo Global بعضوية مدفوعة.', 'Присоединяйтесь к сети Grupo Global с платным членством.', 'Rejoignez le réseau Grupo Global avec une adhésion payante.'],
  'Existing Grupo Global partner': ['Socio actual de Grupo Global', 'شريك حالي لـ Grupo Global', 'Действующий партнёр Grupo Global', 'Partenaire actuel de Grupo Global'],
  'Already a direct partner: no membership fee. Compliance confirms it.': ['Ya eres socio directo: sin cuota de membresía. Cumplimiento normativo lo confirma.', 'شريك مباشر بالفعل: لا رسوم عضوية. يؤكد ذلك قسم الامتثال.', 'Уже прямой партнёр: без членского взноса. Служба комплаенса это подтвердит.', 'Déjà partenaire direct : pas de cotisation. La conformité le confirme.'],
  'Membership plan': ['Plan de membresía', 'خطة العضوية', 'План членства', 'Formule d’adhésion'],
  '1 year': ['1 año', 'سنة واحدة', '1 год', '1 an'],
  '{n} years': ['{n} años', '{n} سنوات', '{n} года', '{n} ans'],
  '+ {rate}% VAT = {total}': ['+ {rate} % IVA = {total}', '+ {rate}% ضريبة القيمة المضافة = {total}', '+ {rate}% НДС = {total}', '+ {rate} % TVA = {total}'],
  'Invoicing address': ['Dirección de facturación', 'عنوان الفوترة', 'Адрес для выставления счетов', 'Adresse de facturation'],
  'Street, number, postcode, city, country': ['Calle, número, código postal, ciudad, país', 'الشارع، الرقم، الرمز البريدي، المدينة، الدولة', 'Улица, дом, индекс, город, страна', 'Rue, numéro, code postal, ville, pays'],
  'You pay only after Compliance approves your company: the invoice appears in your portal, payable by card (Stripe) or PayPal.': [
    'Solo pagas cuando Cumplimiento normativo aprueba tu empresa: la factura aparece en tu portal y puedes pagarla con tarjeta (Stripe) o PayPal.',
    'لا تدفع إلا بعد موافقة قسم الامتثال على شركتك: تظهر الفاتورة في بوابتك ويمكن دفعها بالبطاقة (Stripe) أو PayPal.',
    'Оплата только после одобрения вашей компании службой комплаенса: счёт появится в вашем портале, оплатить можно картой (Stripe) или через PayPal.',
    'Vous ne payez qu’après l’approbation de votre entreprise par la conformité : la facture apparaît dans votre portail, payable par carte (Stripe) ou PayPal.',
  ],
  'About your company': ['Sobre tu empresa', 'عن شركتك', 'О вашей компании', 'À propos de votre entreprise'],
  'Your contact at Grupo Global': ['Tu contacto en Grupo Global', 'جهة اتصالك في Grupo Global', 'Ваш контакт в Grupo Global', 'Votre contact chez Grupo Global'],
  'Choose…': ['Elige…', 'اختر…', 'Выберите…', 'Choisir…'],

  // Survey
  'Number of employees': ['Número de empleados', 'عدد الموظفين', 'Количество сотрудников', 'Nombre d’employés'],
  'Annual revenue': ['Facturación anual', 'الإيرادات السنوية', 'Годовая выручка', 'Chiffre d’affaires annuel'],
  'Countries where you operate': ['Países en los que operas', 'الدول التي تعمل فيها', 'Страны, где вы работаете', 'Pays où vous opérez'],
  'What are you interested in?': ['¿Qué te interesa?', 'ما الذي يهمك؟', 'Что вас интересует?', 'Qu’est-ce qui vous intéresse ?'],
  'How did you hear about Grupo Global?': ['¿Cómo conociste Grupo Global?', 'كيف سمعت عن Grupo Global؟', 'Как вы узнали о Grupo Global?', 'Comment avez-vous connu Grupo Global ?'],
  'Who referred you? (optional)': ['¿Quién te recomendó? (opcional)', 'من أوصى بك؟ (اختياري)', 'Кто вас рекомендовал? (необязательно)', 'Qui vous a recommandé ? (facultatif)'],
  'What do you expect from the membership? (optional)': ['¿Qué esperas de la membresía? (opcional)', 'ماذا تتوقع من العضوية؟ (اختياري)', 'Чего вы ждёте от членства? (необязательно)', 'Qu’attendez-vous de l’adhésion ? (facultatif)'],
  'Under €1M': ['Menos de 1 M€', 'أقل من مليون يورو', 'До 1 млн €', 'Moins de 1 M€'],
  '€1M-€10M': ['1-10 M€', '1-10 ملايين يورو', '1–10 млн €', '1-10 M€'],
  '€10M-€50M': ['10-50 M€', '10-50 مليون يورو', '10–50 млн €', '10-50 M€'],
  'Over €50M': ['Más de 50 M€', 'أكثر من 50 مليون يورو', 'Более 50 млн €', 'Plus de 50 M€'],
  'Prefer not to say': ['Prefiero no decirlo', 'أفضّل عدم الإفصاح', 'Предпочитаю не указывать', 'Je préfère ne pas répondre'],
  'Business matchmaking': ['Contactos de negocio', 'التوفيق بين الأعمال', 'Подбор деловых партнёров', 'Mise en relation d’affaires'],
  'Investment opportunities': ['Oportunidades de inversión', 'فرص الاستثمار', 'Инвестиционные возможности', 'Opportunités d’investissement'],
  'Projects and tenders': ['Proyectos y licitaciones', 'المشاريع والمناقصات', 'Проекты и тендеры', 'Projets et appels d’offres'],
  'International expansion': ['Expansión internacional', 'التوسع الدولي', 'Международное расширение', 'Expansion internationale'],
  'Training and events': ['Formación y eventos', 'التدريب والفعاليات', 'Обучение и мероприятия', 'Formation et événements'],
  'Grupo Global team': ['Equipo de Grupo Global', 'فريق Grupo Global', 'Команда Grupo Global', 'Équipe Grupo Global'],
  'Partner referral': ['Recomendación de un socio', 'توصية من شريك', 'Рекомендация партнёра', 'Recommandation d’un partenaire'],
  LinkedIn: ['LinkedIn', 'LinkedIn', 'LinkedIn', 'LinkedIn'],

  // Compliance decision
  'New member (pays membership)': ['Nuevo miembro (paga membresía)', 'عضو جديد (يدفع العضوية)', 'Новый участник (оплачивает членство)', 'Nouveau membre (paie l’adhésion)'],
  'Existing Grupo Global partner (no fee)': ['Socio actual de Grupo Global (sin cuota)', 'شريك حالي لـ Grupo Global (بدون رسوم)', 'Действующий партнёр Grupo Global (без взноса)', 'Partenaire actuel de Grupo Global (sans cotisation)'],
  'Add the invoicing address before approving.': ['Añade la dirección de facturación antes de aprobar.', 'أضف عنوان الفوترة قبل الموافقة.', 'Добавьте адрес для счетов перед одобрением.', 'Ajoutez l’adresse de facturation avant d’approuver.'],
  'Approving starts the membership and sends the first invoice to the member’s portal.': ['Al aprobar se inicia la membresía y se envía la primera factura al portal del miembro.', 'تؤدي الموافقة إلى بدء العضوية وإرسال الفاتورة الأولى إلى بوابة العضو.', 'Одобрение запускает членство и отправляет первый счёт в портал участника.', 'L’approbation démarre l’adhésion et envoie la première facture dans le portail du membre.'],

  // Finance: memberships and the split
  Memberships: ['Membresías', 'العضويات', 'Членства', 'Adhésions'],
  'This year · {total} in total': ['Este año · {total} en total', 'هذا العام · {total} إجمالًا', 'В этом году · всего {total}', 'Cette année · {total} au total'],
  'Membership revenue': ['Ingresos por membresías', 'إيرادات العضوية', 'Доход от членства', 'Revenus des adhésions'],
  '{count} active members · without VAT': ['{count} miembros activos · sin IVA', '{count} أعضاء نشطون · بدون ضريبة', 'Активных участников: {count} · без НДС', '{count} membres actifs · hors TVA'],
  'Each paid membership invoice is split between the partners when it is paid; refunds are reversed the same way.': [
    'Cada factura de membresía pagada se reparte entre los socios en el momento del pago; los reembolsos se revierten del mismo modo.',
    'تُقسَّم كل فاتورة عضوية مدفوعة بين الشركاء عند دفعها، وتُعكس المبالغ المستردة بالطريقة نفسها.',
    'Каждый оплаченный счёт за членство делится между партнёрами в момент оплаты; возвраты сторнируются так же.',
    'Chaque facture d’adhésion payée est répartie entre les partenaires au moment du paiement ; les remboursements sont annulés de la même façon.',
  ],
  'Download the split (CSV)': ['Descargar el reparto (CSV)', 'تنزيل التقسيم (CSV)', 'Скачать распределение (CSV)', 'Télécharger la répartition (CSV)'],
  'Payment pending': ['Pago pendiente', 'الدفع معلّق', 'Ожидает оплаты', 'Paiement en attente'],
  'Invoice paid': ['Factura pagada', 'الفاتورة مدفوعة', 'Счёт оплачен', 'Facture payée'],
  'No paid members yet. Members appear here once Compliance approves them.': ['Aún no hay miembros de pago. Aparecerán aquí cuando Cumplimiento normativo los apruebe.', 'لا يوجد أعضاء مدفوعون بعد. يظهر الأعضاء هنا بعد موافقة قسم الامتثال.', 'Платных участников пока нет. Они появятся здесь после одобрения службой комплаенса.', 'Aucun membre payant pour l’instant. Ils apparaissent ici après approbation par la conformité.'],
  'The download could not be prepared.': ['No se ha podido preparar la descarga.', 'تعذّر تجهيز التنزيل.', 'Не удалось подготовить файл.', 'Le téléchargement n’a pas pu être préparé.'],
  '2 years': ['2 años', 'سنتان', '2 года', '2 ans'],
  '3 years': ['3 años', '3 سنوات', '3 года', '3 ans'],
  'Every 2 years': ['Cada 2 años', 'كل سنتين', 'Раз в 2 года', 'Tous les 2 ans'],
  'Every 3 years': ['Cada 3 años', 'كل 3 سنوات', 'Раз в 3 года', 'Tous les 3 ans'],
  'Plan type': ['Tipo de plan', 'نوع الخطة', 'Тип плана', 'Type de formule'],
  'Service plan': ['Plan de servicio', 'خطة خدمة', 'План услуг', 'Formule de service'],
  'Membership plan (shown at registration)': ['Plan de membresía (se muestra en el registro)', 'خطة عضوية (تظهر عند التسجيل)', 'План членства (показывается при регистрации)', 'Formule d’adhésion (affichée à l’inscription)'],
  'Membership: 1 year': ['Membresía: 1 año', 'العضوية: سنة واحدة', 'Членство: 1 год', 'Adhésion : 1 an'],
  'Membership: 2 years': ['Membresía: 2 años', 'العضوية: سنتان', 'Членство: 2 года', 'Adhésion : 2 ans'],
  'Membership: 3 years': ['Membresía: 3 años', 'العضوية: 3 سنوات', 'Членство: 3 года', 'Adhésion : 3 ans'],

  // Member portal
  'Your membership invoice is ready': ['Tu factura de membresía está lista', 'فاتورة عضويتك جاهزة', 'Ваш счёт за членство готов', 'Votre facture d’adhésion est prête'],
  'Invoice {number} · {amount}. Pay it by card or PayPal to complete your membership.': ['Factura {number} · {amount}. Págala con tarjeta o PayPal para completar tu membresía.', 'الفاتورة {number} · {amount}. ادفعها بالبطاقة أو PayPal لإكمال عضويتك.', 'Счёт {number} · {amount}. Оплатите его картой или через PayPal, чтобы завершить оформление членства.', 'Facture {number} · {amount}. Réglez-la par carte ou PayPal pour finaliser votre adhésion.'],
  'Pay now': ['Pagar ahora', 'ادفع الآن', 'Оплатить', 'Payer maintenant'],
  'Membership, subscription and payments.': ['Membresía, suscripción y pagos.', 'العضوية والاشتراك والمدفوعات.', 'Членство, подписка и платежи.', 'Adhésion, abonnement et paiements.'],

  // Server messages
  'Choose a membership plan.': ['Elige un plan de membresía.', 'اختر خطة عضوية.', 'Выберите план членства.', 'Choisissez une formule d’adhésion.'],
  'Enter the full invoicing address.': ['Indica la dirección de facturación completa.', 'أدخل عنوان الفوترة كاملًا.', 'Укажите полный адрес для выставления счетов.', 'Saisissez l’adresse de facturation complète.'],
  'Existing partners: tell us who at Grupo Global you work with.': ['Socios actuales: indícanos con quién trabajas en Grupo Global.', 'الشركاء الحاليون: أخبرنا بمن تعمل معه في Grupo Global.', 'Действующие партнёры: укажите, с кем вы работаете в Grupo Global.', 'Partenaires actuels : indiquez avec qui vous travaillez chez Grupo Global.'],
  'Choose the membership plan for this member.': ['Elige el plan de membresía para este miembro.', 'اختر خطة العضوية لهذا العضو.', 'Выберите план членства для этого участника.', 'Choisissez la formule d’adhésion de ce membre.'],
  'Add the member’s invoicing address before approving.': ['Añade la dirección de facturación del miembro antes de aprobar.', 'أضف عنوان فوترة العضو قبل الموافقة.', 'Добавьте адрес участника для счетов перед одобрением.', 'Ajoutez l’adresse de facturation du membre avant d’approuver.'],
  'Please complete the membership survey.': ['Completa la encuesta de membresía.', 'يرجى إكمال استبيان العضوية.', 'Заполните анкету для членства.', 'Veuillez remplir le questionnaire d’adhésion.'],
  'Organisation verified. Account created and NDA issued. Membership invoice issued.': ['Organización verificada. Cuenta creada y NDA emitido. Factura de membresía emitida.', 'تم التحقق من المؤسسة. تم إنشاء الحساب وإصدار اتفاقية عدم الإفصاح. تم إصدار فاتورة العضوية.', 'Организация проверена. Учётная запись создана, NDA выдано. Счёт за членство выставлен.', 'Organisation vérifiée. Compte créé et NDA émis. Facture d’adhésion émise.'],
  'Organisation verified. NDA issued. Membership invoice issued.': ['Organización verificada. NDA emitido. Factura de membresía emitida.', 'تم التحقق من المؤسسة. تم إصدار اتفاقية عدم الإفصاح. تم إصدار فاتورة العضوية.', 'Организация проверена. NDA выдано. Счёт за членство выставлен.', 'Organisation vérifiée. NDA émis. Facture d’adhésion émise.'],
}

const pick = (index) => Object.fromEntries(Object.entries(TEXTS).map(([key, values]) => [key, values[index]]))
export const membershipEs = pick(0)
export const membershipAr = pick(1)
export const membershipRu = pick(2)
export const membershipFr = pick(3)
