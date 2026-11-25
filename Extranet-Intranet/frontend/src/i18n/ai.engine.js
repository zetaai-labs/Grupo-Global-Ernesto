// AI engine (matchmaking, renewal risk), sectors and corridor names. English key -> [es, ar, ru].
const TEXTS = {
  'People you should meet': ['Personas que deberías conocer', 'أشخاص يجدر بك مقابلتهم', 'С кем стоит познакомиться'],
  'Suggested for you': ['Sugeridos para ti', 'مقترحون لك', 'Рекомендации для вас'],
  Choose: ['Elegir', 'اختيار', 'Выбрать'],
  'Match score': ['Afinidad', 'درجة التوافق', 'Совпадение'],
  'Suggested from shared sectors, committees, events, complementary roles and corridors.': ['Sugerido por sectores, comités y eventos compartidos, roles complementarios y corredores.', 'مقترح بناءً على القطاعات واللجان والفعاليات المشتركة والأدوار المتكاملة والممرات.', 'Подобрано по общим отраслям, комитетам, мероприятиям, дополняющим ролям и коридорам.'],
  'Same sector: {list}': ['Mismo sector: {list}', 'القطاع نفسه: {list}', 'Та же отрасль: {list}'],
  'Both in {list}': ['Ambos en {list}', 'كلاهما في {list}', 'Оба в: {list}'],
  '{a} ↔ {b}': ['{a} ↔ {b}', '{a} ↔ {b}', '{a} ↔ {b}'],
  '{a} ↔ {b} corridor': ['Corredor {a} ↔ {b}', 'ممر {a} ↔ {b}', 'Коридор {a} ↔ {b}'],
  'Renewal risk': ['Riesgo de renovación', 'مخاطر عدم التجديد', 'Риск непродления'],
  'Recalculate risk': ['Recalcular riesgo', 'إعادة حساب المخاطر', 'Пересчитать риск'],
  'Renewal risk updated.': ['Riesgo de renovación actualizado.', 'تم تحديث مخاطر عدم التجديد.', 'Риск непродления обновлён.'],
  Member: ['Miembro', 'العضو', 'Участник'],
  Risk: ['Riesgo', 'المخاطر', 'Риск'],
  Why: ['Motivo', 'السبب', 'Почему'],
  'Cancellation scheduled at the end of the period': ['Cancelación programada al final del periodo', 'إلغاء مجدول في نهاية الفترة', 'Отмена запланирована на конец периода'],
  'Subscription payment is past due': ['El pago de la suscripción está vencido', 'دفعة الاشتراك متأخرة', 'Оплата подписки просрочена'],
  '{count} invoice(s) unpaid for more than 30 days': ['{count} factura(s) sin pagar desde hace más de 30 días', '{count} فاتورة غير مدفوعة منذ أكثر من 30 يومًا', 'Неоплаченных счетов более 30 дней: {count}'],
  'Nobody from the organisation signed in during the last 30 days': ['Nadie de la organización ha iniciado sesión en los últimos 30 días', 'لم يسجّل أحد من المؤسسة الدخول خلال آخر 30 يومًا', 'За последние 30 дней никто из организации не входил'],
  'Sign-ins fell from {before} to {now} compared with the previous 30 days': ['Los accesos bajaron de {before} a {now} respecto a los 30 días anteriores', 'انخفضت تسجيلات الدخول من {before} إلى {now} مقارنة بالثلاثين يومًا السابقة', 'Входов стало {now} вместо {before} за предыдущие 30 дней'],
  'Few sign-ins per active user': ['Pocos accesos por usuario activo', 'تسجيلات دخول قليلة لكل مستخدم نشط', 'Мало входов на активного пользователя'],
  'Renewal in {count} day(s)': ['Renovación en {count} día(s)', 'التجديد خلال {count} يوم', 'Продление через {count} дн.'],
  '{count} course(s) completed in 90 days': ['{count} curso(s) completado(s) en 90 días', '{count} دورة مكتملة خلال 90 يومًا', 'Курсов пройдено за 90 дней: {count}'],
  '{count} event registration(s) in 90 days': ['{count} inscripción(es) a eventos en 90 días', '{count} تسجيل في فعاليات خلال 90 يومًا', 'Записей на мероприятия за 90 дней: {count}'],
  'Sectors you work in (optional)': ['Sectores en los que trabajas (opcional)', 'القطاعات التي تعمل فيها (اختياري)', 'Ваши отрасли (необязательно)'],
  Fintech: ['Fintech', 'التقنية المالية', 'Финтех'],
  'Real estate': ['Inmobiliario', 'العقارات', 'Недвижимость'],
  Healthcare: ['Salud', 'الرعاية الصحية', 'Здравоохранение'],
  Cybersecurity: ['Ciberseguridad', 'الأمن السيبراني', 'Кибербезопасность'],
  'Cross-border trade': ['Comercio transfronterizo', 'التجارة العابرة للحدود', 'Трансграничная торговля'],
  'Spain / European Union': ['España / Unión Europea', 'إسبانيا / الاتحاد الأوروبي', 'Испания / Европейский союз'],
  'UAE / Dubai': ['EAU / Dubái', 'الإمارات / دبي', 'ОАЭ / Дубай'],
  'United States & Canada': ['Estados Unidos y Canadá', 'الولايات المتحدة وكندا', 'США и Канада'],
  'Global (all corridors)': ['Global (todos los corredores)', 'عالمي (جميع الممرات)', 'Глобально (все коридоры)'],
  'Business unit': ['Unidad de negocio', 'وحدة أعمال', 'Подразделение'],
  'Delegation node': ['Delegación', 'مكتب تمثيلي', 'Представительство'],
}

const pick = (index) => Object.fromEntries(Object.entries(TEXTS).map(([key, values]) => [key, values[index]]))
export const aiEngineEs = pick(0)
export const aiEngineAr = pick(1)
export const aiEngineRu = pick(2)
