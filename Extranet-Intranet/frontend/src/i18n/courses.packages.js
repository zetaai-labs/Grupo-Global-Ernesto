// SCORM / xAPI course package texts. Each entry: English key -> [es, ar, ru].
const TEXTS = {
  'Interactive course': ['Curso interactivo', 'دورة تفاعلية', 'Интерактивный курс'],
  'Not started': ['Sin empezar', 'لم يبدأ', 'Не начат'],
  Viewed: ['Visto', 'تمت المشاهدة', 'Просмотрен'],
  '{count} min spent': ['{count} min dedicados', '{count} دقيقة', 'Затрачено: {count} мин'],
  'Start course': ['Empezar curso', 'بدء الدورة', 'Начать курс'],
  'Resume course': ['Continuar curso', 'متابعة الدورة', 'Продолжить курс'],
  'Close course': ['Cerrar curso', 'إغلاق الدورة', 'Закрыть курс'],
  'Loading course…': ['Cargando curso…', 'جارٍ تحميل الدورة…', 'Загрузка курса…'],
  'Saving progress…': ['Guardando progreso…', 'جارٍ حفظ التقدم…', 'Сохранение прогресса…'],
  'Passed — certificate issued.': ['Superado — certificado emitido.', 'ناجح — صدرت الشهادة.', 'Пройден — сертификат выдан.'],
  'Not passed yet. You can open the course again to retry.': ['Aún no superado. Puedes volver a abrir el curso para intentarlo de nuevo.', 'لم تنجح بعد. يمكنك فتح الدورة مجددًا للمحاولة.', 'Пока не пройден. Откройте курс снова, чтобы повторить попытку.'],
  'Could not save your progress.': ['No se pudo guardar tu progreso.', 'تعذر حفظ تقدمك.', 'Не удалось сохранить прогресс.'],
  'Course package': ['Paquete del curso', 'حزمة الدورة', 'Пакет курса'],
  'SCORM 1.2, SCORM 2004 or xAPI .zip, up to 300 MB.': ['.zip SCORM 1.2, SCORM 2004 o xAPI, hasta 300 MB.', 'ملف ‎.zip بصيغة SCORM 1.2 أو SCORM 2004 أو xAPI، حتى 300 ميغابايت.', '.zip в формате SCORM 1.2, SCORM 2004 или xAPI, до 300 МБ.'],
  'Uploading package… {percent}%': ['Subiendo paquete… {percent}%', 'جارٍ رفع الحزمة… {percent}%', 'Загрузка пакета… {percent}%'],
  'Upload package': ['Subir paquete', 'رفع حزمة', 'Загрузить пакет'],
  'Replace package': ['Sustituir paquete', 'استبدال الحزمة', 'Заменить пакет'],
  'Remove package': ['Quitar paquete', 'إزالة الحزمة', 'Удалить пакет'],
  'Remove this package? Learner progress inside it is deleted; certificates already issued stay valid.': ['¿Quitar este paquete? Se borra el progreso de los alumnos en él; los certificados ya emitidos siguen siendo válidos.', 'هل تريد إزالة هذه الحزمة؟ سيُحذف تقدم المتعلمين فيها، وتبقى الشهادات الصادرة صالحة.', 'Удалить пакет? Прогресс слушателей в нём будет удалён; выданные сертификаты остаются действительными.'],
  'Could not upload the course package.': ['No se pudo subir el paquete del curso.', 'تعذر رفع حزمة الدورة.', 'Не удалось загрузить пакет курса.'],
  'Could not remove the course package.': ['No se pudo quitar el paquete del curso.', 'تعذرت إزالة حزمة الدورة.', 'Не удалось удалить пакет курса.'],
  // Server messages.
  'Course package uploaded.': ['Paquete del curso subido.', 'تم رفع حزمة الدورة.', 'Пакет курса загружен.'],
  'Course package removed.': ['Paquete del curso eliminado.', 'تمت إزالة حزمة الدورة.', 'Пакет курса удалён.'],
  'This course has no package.': ['Este curso no tiene paquete.', 'لا تحتوي هذه الدورة على حزمة.', 'У этого курса нет пакета.'],
  'Choose a SCORM or xAPI .zip file.': ['Elige un archivo .zip SCORM o xAPI.', 'اختر ملف ‎.zip بصيغة SCORM أو xAPI.', 'Выберите .zip-файл SCORM или xAPI.'],
  'Only HR and the Super Administrator can upload course packages.': ['Solo RR. HH. y el Superadministrador pueden subir paquetes de cursos.', 'لا يمكن رفع حزم الدورات إلا للموارد البشرية والمسؤول الأعلى.', 'Загружать пакеты курсов могут только отдел кадров и суперадминистратор.'],
  'Only HR and the Super Administrator can remove course packages.': ['Solo RR. HH. y el Superadministrador pueden quitar paquetes de cursos.', 'لا يمكن إزالة حزم الدورات إلا للموارد البشرية والمسؤول الأعلى.', 'Удалять пакеты курсов могут только отдел кадров и суперадминистратор.'],
  'This course session has expired. Open the course again.': ['La sesión del curso ha caducado. Vuelve a abrir el curso.', 'انتهت جلسة الدورة. افتح الدورة مجددًا.', 'Сеанс курса истёк. Откройте курс снова.'],
  'Invalid course data.': ['Datos del curso no válidos.', 'بيانات الدورة غير صالحة.', 'Неверные данные курса.'],
  'Course attempt not found.': ['No se encontró el intento del curso.', 'محاولة الدورة غير موجودة.', 'Попытка прохождения не найдена.'],
  'This file is not a valid zip archive.': ['Este archivo no es un .zip válido.', 'هذا الملف ليس أرشيف zip صالحًا.', 'Файл не является корректным zip-архивом.'],
  'The archive is empty.': ['El archivo comprimido está vacío.', 'الأرشيف فارغ.', 'Архив пуст.'],
  'No imsmanifest.xml (SCORM) or tincan.xml (xAPI) found in the archive.': ['No se encontró imsmanifest.xml (SCORM) ni tincan.xml (xAPI) en el archivo.', 'لم يُعثر على imsmanifest.xml (SCORM) أو tincan.xml (xAPI) في الأرشيف.', 'В архиве нет imsmanifest.xml (SCORM) или tincan.xml (xAPI).'],
  'The manifest does not name a launch file.': ['El manifiesto no indica un archivo de inicio.', 'لا يحدد ملف التعريف ملف التشغيل.', 'В манифесте не указан файл запуска.'],
  'tincan.xml does not name a launch file.': ['tincan.xml no indica un archivo de inicio.', 'لا يحدد tincan.xml ملف التشغيل.', 'В tincan.xml не указан файл запуска.'],
  'Symbolic links are not allowed in course packages.': ['No se permiten enlaces simbólicos en los paquetes de cursos.', 'الروابط الرمزية غير مسموح بها في حزم الدورات.', 'Символические ссылки в пакетах курсов запрещены.'],
  'The unpacked course is larger than 1 GB.': ['El curso descomprimido ocupa más de 1 GB.', 'حجم الدورة بعد فك الضغط أكبر من 1 غيغابايت.', 'Распакованный курс больше 1 ГБ.'],
  'A file in the archive is larger than 300 MB.': ['Un archivo del paquete ocupa más de 300 MB.', 'يوجد ملف في الأرشيف أكبر من 300 ميغابايت.', 'Один из файлов архива больше 300 МБ.'],
  'Invalid course id.': ['Identificador de curso no válido.', 'معرّف الدورة غير صالح.', 'Неверный идентификатор курса.'],
}

const pick = (index) => Object.fromEntries(Object.entries(TEXTS).map(([key, values]) => [key, values[index]]))
export const coursePackagesEs = pick(0)
export const coursePackagesAr = pick(1)
export const coursePackagesRu = pick(2)
