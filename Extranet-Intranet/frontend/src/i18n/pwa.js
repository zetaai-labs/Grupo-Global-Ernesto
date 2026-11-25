// Installable app texts. English key -> [es, ar, ru].
const TEXTS = {
  'Install the app': ['Instalar la aplicación', 'تثبيت التطبيق', 'Установить приложение'],
  'Phone & desktop alerts on this device': ['Avisos en el móvil y el escritorio en este dispositivo', 'تنبيهات الهاتف وسطح المكتب على هذا الجهاز', 'Уведомления на телефоне и компьютере на этом устройстве'],
  'The alert service did not answer. Check your connection and try again.': ['El servicio de avisos no respondió. Revisa tu conexión e inténtalo de nuevo.', 'لم تستجب خدمة التنبيهات. تحقّق من اتصالك وحاول مرة أخرى.', 'Сервис уведомлений не ответил. Проверьте подключение и попробуйте снова.'],
  'Send test': ['Enviar prueba', 'إرسال تجربة', 'Отправить тест'],
  'Test alert sent.': ['Aviso de prueba enviado.', 'تم إرسال تنبيه تجريبي.', 'Тестовое уведомление отправлено.'],
  'Test alert': ['Aviso de prueba', 'تنبيه تجريبي', 'Тестовое уведомление'],
  'Alerts are working on this device.': ['Los avisos funcionan en este dispositivo.', 'التنبيهات تعمل على هذا الجهاز.', 'Уведомления работают на этом устройстве.'],
  'Alerts could not be turned on. Try again.': ['No se pudieron activar los avisos. Inténtalo de nuevo.', 'تعذّر تفعيل التنبيهات. حاول مرة أخرى.', 'Не удалось включить уведомления. Попробуйте снова.'],
  'Alerts are blocked in this browser. Allow notifications for this site in the browser settings.': ['Los avisos están bloqueados en este navegador. Permite las notificaciones de este sitio en los ajustes del navegador.', 'التنبيهات محظورة في هذا المتصفح. اسمح بالإشعارات لهذا الموقع من إعدادات المتصفح.', 'Уведомления заблокированы в браузере. Разрешите уведомления для этого сайта в настройках браузера.'],
  'On iPhone or iPad, add this app to your Home Screen first to receive alerts.': ['En iPhone o iPad, añade primero esta aplicación a tu pantalla de inicio para recibir avisos.', 'على iPhone أو iPad، أضف هذا التطبيق إلى الشاشة الرئيسية أولًا لتلقي التنبيهات.', 'На iPhone или iPad сначала добавьте приложение на экран «Домой», чтобы получать уведомления.'],
  'Phone alerts are not set up yet.': ['Los avisos en el móvil aún no están configurados.', 'لم يتم إعداد تنبيهات الهاتف بعد.', 'Уведомления на телефон ещё не настроены.'],
  'Alerts are on for this device.': ['Avisos activados en este dispositivo.', 'تم تفعيل التنبيهات على هذا الجهاز.', 'Уведомления на этом устройстве включены.'],
  'Alerts are off for this device.': ['Avisos desactivados en este dispositivo.', 'تم إيقاف التنبيهات على هذا الجهاز.', 'Уведомления на этом устройстве выключены.'],
  'This browser sent an invalid alert subscription.': ['Este navegador envió una suscripción de avisos no válida.', 'أرسل هذا المتصفح اشتراك تنبيهات غير صالح.', 'Браузер отправил недействительную подписку на уведомления.'],
}

const pick = (index) => Object.fromEntries(Object.entries(TEXTS).map(([key, values]) => [key, values[index]]))
export const pwaEs = pick(0)
export const pwaAr = pick(1)
export const pwaRu = pick(2)
