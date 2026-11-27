// Audit log search and the privacy column in User Management. English key -> [es, ar, ru, fr].
const TEXTS = {
  'Sign-in & security': ['Acceso y seguridad', 'تسجيل الدخول والأمان', 'Вход и безопасность', 'Connexion et sécurité'],
  'Users & access': ['Usuarios y accesos', 'المستخدمون والصلاحيات', 'Пользователи и доступ', 'Utilisateurs et accès'],
  'Compliance & KYC': ['Cumplimiento y KYC', 'الامتثال واعرف عميلك', 'Комплаенс и KYC', 'Conformité et KYC'],
  'Billing & membership': ['Facturación y membresías', 'الفوترة والعضوية', 'Счета и членство', 'Facturation et adhésions'],
  'Business modules': ['Módulos de negocio', 'وحدات الأعمال', 'Бизнес-модули', 'Modules métier'],
  'Documents & files': ['Documentos y archivos', 'المستندات والملفات', 'Документы и файлы', 'Documents et fichiers'],
  'AI & assistant': ['IA y asistente', 'الذكاء الاصطناعي والمساعد', 'ИИ и ассистент', 'IA et assistant'],
  'Every operation on the platform: who did what, and when. Search, filter by area or person, open the details and export.': [
    'Todas las operaciones de la plataforma: quién hizo qué y cuándo. Busca, filtra por área o persona, abre los detalles y exporta.',
    'كل العمليات على المنصة: من فعل ماذا ومتى. ابحث وصفِّ حسب المجال أو الشخص وافتح التفاصيل وصدّرها.',
    'Все операции на платформе: кто, что и когда сделал. Ищите, фильтруйте по разделу или человеку, открывайте подробности и экспортируйте.',
    'Toutes les opérations de la plateforme : qui a fait quoi, et quand. Recherchez, filtrez par domaine ou par personne, ouvrez les détails et exportez.',
  ],
  'Export CSV': ['Exportar CSV', 'تصدير CSV', 'Экспорт CSV', 'Exporter en CSV'],
  'Events today': ['Eventos de hoy', 'أحداث اليوم', 'Событий сегодня', 'Événements aujourd’hui'],
  '{count} in total': ['{count} en total', '{count} إجمالًا', 'Всего {count}', '{count} au total'],
  'Active people today': ['Personas activas hoy', 'الأشخاص النشطون اليوم', 'Активных сегодня', 'Personnes actives aujourd’hui'],
  'People who did something today': ['Personas que hicieron algo hoy', 'أشخاص قاموا بإجراء اليوم', 'Люди, которые сегодня что-то делали', 'Personnes ayant agi aujourd’hui'],
  'Click to see them': ['Haz clic para verlos', 'انقر لعرضها', 'Нажмите, чтобы посмотреть', 'Cliquez pour les voir'],
  'Problems (7 days)': ['Incidencias (7 días)', 'المشكلات (7 أيام)', 'Проблемы (7 дней)', 'Problèmes (7 jours)'],
  'Refused, failed or suspended actions': ['Acciones rechazadas, fallidas o suspendidas', 'إجراءات مرفوضة أو فاشلة أو موقوفة', 'Отклонённые, неудачные или приостановленные действия', 'Actions refusées, échouées ou suspendues'],
  'Search action, person, email or record…': ['Buscar acción, persona, correo o registro…', 'ابحث عن إجراء أو شخص أو بريد أو سجل…', 'Поиск по действию, человеку, email или записи…', 'Rechercher une action, une personne, un e-mail ou un enregistrement…'],
  'Only problems': ['Solo incidencias', 'المشكلات فقط', 'Только проблемы', 'Problèmes uniquement'],
  'Show everything this person did': ['Ver todo lo que hizo esta persona', 'عرض كل ما فعله هذا الشخص', 'Показать всё, что сделал этот человек', 'Afficher tout ce que cette personne a fait'],
  Record: ['Registro', 'السجل', 'Запись', 'Enregistrement'],
  'Load older entries': ['Cargar entradas anteriores', 'تحميل إدخالات أقدم', 'Загрузить более ранние записи', 'Charger les entrées plus anciennes'],
  'Nothing matches these filters': ['Nada coincide con estos filtros', 'لا شيء يطابق هذه المرشحات', 'Ничего не найдено по этим фильтрам', 'Rien ne correspond à ces filtres'],
  'Change the search or the dates.': ['Cambia la búsqueda o las fechas.', 'غيّر البحث أو التواريخ.', 'Измените запрос или даты.', 'Modifiez la recherche ou les dates.'],
  'Privacy policy accepted': ['Política de privacidad aceptada', 'تمت الموافقة على سياسة الخصوصية', 'Политика конфиденциальности принята', 'Politique de confidentialité acceptée'],
  'Active accounts that accepted the current policy': ['Cuentas activas que aceptaron la política vigente', 'الحسابات النشطة التي وافقت على السياسة الحالية', 'Активные учётные записи, принявшие действующую политику', 'Comptes actifs ayant accepté la politique en vigueur'],
  'Policy owner': ['Responsable de la política', 'مالك السياسة', 'Владелец политики', 'Responsable de la politique'],
  'Privacy accepted': ['Privacidad aceptada', 'تمت الموافقة على الخصوصية', 'Конфиденциальность принята', 'Confidentialité acceptée'],
  'Privacy pending': ['Privacidad pendiente', 'الخصوصية معلّقة', 'Конфиденциальность не принята', 'Confidentialité en attente'],
  // Employee profile privacy
  'HR only': ['Solo RR. HH.', 'الموارد البشرية فقط', 'Только отдел кадров', 'RH uniquement'],
  'Documents and notes on this profile are private to HR and the employee.': ['Los documentos y notas de este perfil son privados: solo los ven RR. HH. y el empleado.', 'المستندات والملاحظات في هذا الملف خاصة بالموارد البشرية والموظف.', 'Документы и заметки этого профиля видят только отдел кадров и сам сотрудник.', 'Les documents et notes de ce profil sont réservés aux RH et à l’employé.'],
  'Documents and notes here are seen only by HR and this employee. Tick “HR only” to keep one from the employee.': ['Los documentos y notas solo los ven RR. HH. y este empleado. Marca «Solo RR. HH.» para que el empleado no lo vea.', 'لا يرى المستندات والملاحظات هنا إلا الموارد البشرية وهذا الموظف. اختر «الموارد البشرية فقط» لإخفاء أحدها عن الموظف.', 'Документы и заметки здесь видят только отдел кадров и этот сотрудник. Отметьте «Только отдел кадров», чтобы скрыть их от сотрудника.', 'Seuls les RH et cet employé voient ces documents et notes. Cochez « RH uniquement » pour en cacher un à l’employé.'],
  'A document was added to your profile': ['Se ha añadido un documento a tu perfil', 'تمت إضافة مستند إلى ملفك', 'В ваш профиль добавлен документ', 'Un document a été ajouté à votre profil'],
  'Only HR and the person concerned can add notes here.': ['Solo RR. HH. y la persona interesada pueden añadir notas aquí.', 'يمكن للموارد البشرية والشخص المعني فقط إضافة ملاحظات هنا.', 'Добавлять заметки здесь могут только отдел кадров и сам сотрудник.', 'Seuls les RH et la personne concernée peuvent ajouter des notes ici.'],
  'Only HR and the person concerned can add documents here.': ['Solo RR. HH. y la persona interesada pueden añadir documentos aquí.', 'يمكن للموارد البشرية والشخص المعني فقط إضافة مستندات هنا.', 'Добавлять документы здесь могут только отдел кадров и сам сотрудник.', 'Seuls les RH et la personne concernée peuvent ajouter des documents ici.'],
}

const pick = (index) => Object.fromEntries(Object.entries(TEXTS).map(([key, values]) => [key, values[index]]))
export const auditEs = pick(0)
export const auditAr = pick(1)
export const auditRu = pick(2)
export const auditFr = pick(3)
