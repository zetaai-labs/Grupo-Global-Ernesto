// AI assistant texts. English key -> [es, ar, ru].
const TEXTS = {
  'AI summary': ['Resumen con IA', 'ملخص بالذكاء الاصطناعي', 'Сводка ИИ'],
  'Suggest next step': ['Sugerir siguiente paso', 'اقتراح الخطوة التالية', 'Предложить следующий шаг'],
  'Summarise document': ['Resumir documento', 'تلخيص المستند', 'Кратко изложить документ'],
  'Thinking…': ['Pensando…', 'جارٍ التفكير…', 'Думаю…'],
  'Ask AI': ['Preguntar a la IA', 'اسأل الذكاء الاصطناعي', 'Спросить ИИ'],
  'Ask AI to filter this list': ['Pide a la IA que filtre esta lista', 'اطلب من الذكاء الاصطناعي تصفية هذه القائمة', 'Попросить ИИ отфильтровать список'],
  '✨ Ask in your own words, e.g. “urgent tickets still open”': ['✨ Pregunta con tus palabras, p. ej. «incidencias urgentes aún abiertas»', '✨ اسأل بكلماتك، مثل «التذاكر العاجلة التي ما زالت مفتوحة»', '✨ Спросите своими словами, например «срочные открытые заявки»'],
  'Next step': ['Siguiente paso', 'الخطوة التالية', 'Следующий шаг'],
  'Key facts': ['Datos clave', 'حقائق رئيسية', 'Ключевые факты'],
  'Key points': ['Puntos clave', 'النقاط الرئيسية', 'Ключевые моменты'],
  'Next steps': ['Siguientes pasos', 'الخطوات التالية', 'Следующие шаги'],
  'Action items': ['Tareas pendientes', 'بنود العمل', 'Задачи'],
  'Watch out for': ['Atención a', 'انتبه إلى', 'Обратите внимание'],
  'Draft email': ['Borrador de correo', 'مسودة البريد', 'Черновик письма'],
  'Copy email': ['Copiar correo', 'نسخ البريد', 'Скопировать письмо'],
  Copied: ['Copiado', 'تم النسخ', 'Скопировано'],
  'Written by AI from the data you can see. Check it before using it.': ['Redactado por IA a partir de los datos que puedes ver. Revísalo antes de usarlo.', 'كتبه الذكاء الاصطناعي من البيانات التي يمكنك رؤيتها. راجعه قبل استخدامه.', 'Составлено ИИ по доступным вам данным. Проверьте перед использованием.'],
  // Server messages.
  'The AI assistant could not be reached. Try again later.': ['No se pudo contactar con el asistente de IA. Inténtalo más tarde.', 'تعذر الوصول إلى مساعد الذكاء الاصطناعي. حاول لاحقًا.', 'Помощник ИИ недоступен. Повторите позже.'],
  'The AI assistant is not configured yet.': ['El asistente de IA aún no está configurado.', 'مساعد الذكاء الاصطناعي غير مُعدّ بعد.', 'Помощник ИИ ещё не настроен.'],
  'The AI assistant is available to staff only.': ['El asistente de IA solo está disponible para el personal.', 'مساعد الذكاء الاصطناعي متاح للموظفين فقط.', 'Помощник ИИ доступен только сотрудникам.'],
  'You have reached today’s AI limit. Try again tomorrow.': ['Has alcanzado el límite de IA de hoy. Inténtalo mañana.', 'لقد بلغت حد الاستخدام اليومي للذكاء الاصطناعي. حاول غدًا.', 'Вы исчерпали дневной лимит ИИ. Попробуйте завтра.'],
  'The AI assistant declined this request.': ['El asistente de IA ha rechazado esta solicitud.', 'رفض مساعد الذكاء الاصطناعي هذا الطلب.', 'Помощник ИИ отклонил этот запрос.'],
  'The AI assistant is busy. Try again in a minute.': ['El asistente de IA está ocupado. Inténtalo en un minuto.', 'مساعد الذكاء الاصطناعي مشغول. حاول بعد دقيقة.', 'Помощник ИИ занят. Повторите через минуту.'],
  'The AI answer could not be read. Try again.': ['No se pudo leer la respuesta de la IA. Inténtalo de nuevo.', 'تعذرت قراءة إجابة الذكاء الاصطناعي. حاول مجددًا.', 'Не удалось прочитать ответ ИИ. Повторите.'],
  'The AI answer was too long. Try a smaller document.': ['La respuesta de la IA era demasiado larga. Prueba con un documento más corto.', 'كانت إجابة الذكاء الاصطناعي طويلة جدًا. جرّب مستندًا أصغر.', 'Ответ ИИ слишком длинный. Попробуйте документ поменьше.'],
  'The AI assistant could not read this content.': ['El asistente de IA no pudo leer este contenido.', 'تعذر على مساعد الذكاء الاصطناعي قراءة هذا المحتوى.', 'Помощник ИИ не смог прочитать этот контент.'],
  'AI summaries work with PDF and text files.': ['Los resúmenes con IA funcionan con archivos PDF y de texto.', 'تعمل ملخصات الذكاء الاصطناعي مع ملفات PDF والنصوص.', 'Сводки ИИ работают с PDF и текстовыми файлами.'],
  'This file is too large for an AI summary (10 MB maximum).': ['Este archivo es demasiado grande para un resumen con IA (máximo 10 MB).', 'هذا الملف كبير جدًا لملخص الذكاء الاصطناعي (10 ميغابايت كحد أقصى).', 'Файл слишком велик для сводки ИИ (максимум 10 МБ).'],
  'Describe what you are looking for (3 to 300 characters).': ['Describe lo que buscas (de 3 a 300 caracteres).', 'صف ما تبحث عنه (من 3 إلى 300 حرف).', 'Опишите, что ищете (от 3 до 300 символов).'],
  'Too many AI requests. Wait a minute and try again.': ['Demasiadas solicitudes de IA. Espera un minuto e inténtalo de nuevo.', 'طلبات كثيرة للذكاء الاصطناعي. انتظر دقيقة وحاول مجددًا.', 'Слишком много запросов к ИИ. Подождите минуту.'],
  'The AI assistant key was refused. Check ANTHROPIC_API_KEY.': ['Se ha rechazado la clave del asistente de IA. Revisa ANTHROPIC_API_KEY.', 'تم رفض مفتاح مساعد الذكاء الاصطناعي. تحقق من ANTHROPIC_API_KEY.', 'Ключ помощника ИИ отклонён. Проверьте ANTHROPIC_API_KEY.'],
  'AI assistant (Claude)': ['Asistente de IA (Claude)', 'مساعد الذكاء الاصطناعي (Claude)', 'Помощник ИИ (Claude)'],
  'AI summaries, smart search and CRM suggestions are off.': ['Los resúmenes con IA, la búsqueda inteligente y las sugerencias del CRM están desactivados.', 'ملخصات الذكاء الاصطناعي والبحث الذكي واقتراحات إدارة العملاء متوقفة.', 'Сводки ИИ, умный поиск и подсказки CRM отключены.'],
  AI: ['IA', 'الذكاء الاصطناعي', 'ИИ'],
}

const pick = (index) => Object.fromEntries(Object.entries(TEXTS).map(([key, values]) => [key, values[index]]))
export const aiEs = pick(0)
export const aiAr = pick(1)
export const aiRu = pick(2)
