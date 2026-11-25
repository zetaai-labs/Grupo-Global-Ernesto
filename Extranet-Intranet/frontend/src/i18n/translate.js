// Content translation (Translate links, feed search). English key -> [es, ar, ru].
const TEXTS = {
  'Translate to {language}': ['Traducir al {language}', 'ترجمة إلى {language}', 'Перевести: {language}'],
  'Translate to': ['Traducir a', 'ترجمة إلى', 'Переводить на'],
  'Show original': ['Ver original', 'عرض الأصل', 'Показать оригинал'],
  'Translating…': ['Traduciendo…', 'جارٍ الترجمة…', 'Перевод…'],
  'Machine translation': ['Traducción automática', 'ترجمة آلية', 'Машинный перевод'],
  'The text could not be translated.': ['No se pudo traducir el texto.', 'تعذّرت ترجمة النص.', 'Не удалось перевести текст.'],
  'Search posts in any language': ['Buscar publicaciones en cualquier idioma', 'ابحث في المنشورات بأي لغة', 'Поиск публикаций на любом языке'],
  'Choose a language to translate into.': ['Elige el idioma al que traducir.', 'اختر اللغة المراد الترجمة إليها.', 'Выберите язык перевода.'],
  'Nothing to translate.': ['No hay nada que traducir.', 'لا يوجد ما يُترجم.', 'Нечего переводить.'],
  'The text is too long to translate (5,000 characters at most).': ['El texto es demasiado largo para traducirlo (máximo 5.000 caracteres).', 'النص طويل جدًا للترجمة (5000 حرف كحد أقصى).', 'Текст слишком длинный для перевода (не более 5000 символов).'],
}

const pick = (index) => Object.fromEntries(Object.entries(TEXTS).map(([key, values]) => [key, values[index]]))
export const translateEs = pick(0)
export const translateAr = pick(1)
export const translateRu = pick(2)
