// Shorter registration form (country list, automatic corridor, optional EU PIC). English key -> [es, ar, ru, fr].
const TEXTS = {
  'choose at least one': ['elige al menos una', 'اختر واحدًا على الأقل', 'выберите хотя бы один', 'choisissez-en au moins un'],
  'Choose at least one option.': ['Elige al menos una opción.', 'اختر خيارًا واحدًا على الأقل.', 'Выберите хотя бы один вариант.', 'Choisissez au moins une option.'],
  Country: ['País', 'الدولة', 'Страна', 'Pays'],
  'Other country…': ['Otro país…', 'دولة أخرى…', 'Другая страна…', 'Autre pays…'],
  '3-letter code, e.g. JPN': ['Código de 3 letras, p. ej. JPN', 'رمز من 3 أحرف، مثل JPN', 'Код из 3 букв, например JPN', 'Code à 3 lettres, ex. JPN'],
  'I have an EU PIC number': ['Tengo un número PIC de la UE', 'لدي رقم PIC أوروبي', 'У меня есть номер EU PIC', 'J’ai un numéro PIC de l’UE'],
  'The membership options could not be loaded. The server may be starting up; this can take up to a minute.': [
    'No se pudieron cargar las opciones de membresía. Puede que el servidor se esté iniciando; esto puede tardar hasta un minuto.',
    'تعذّر تحميل خيارات العضوية. قد يكون الخادم قيد التشغيل؛ قد يستغرق ذلك حتى دقيقة.',
    'Не удалось загрузить варианты членства. Возможно, сервер запускается; это может занять до минуты.',
    'Les options d’adhésion n’ont pas pu être chargées. Le serveur démarre peut-être ; cela peut prendre jusqu’à une minute.',
  ],
}

const pick = (index) => Object.fromEntries(Object.entries(TEXTS).map(([key, values]) => [key, values[index]]))
export const onboardingFormEs = pick(0)
export const onboardingFormAr = pick(1)
export const onboardingFormRu = pick(2)
export const onboardingFormFr = pick(3)
