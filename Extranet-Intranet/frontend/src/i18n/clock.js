// Attendance clock (top bar + Overview card) and server clock messages. English key -> [es, ar, ru].
const TEXTS = {
  Attendance: ['Fichaje', 'الحضور', 'Учёт времени'],
  'Not clocked in': ['Sin fichar', 'لم تسجّل الحضور', 'Вы не отметились'],
  Working: ['Trabajando', 'أثناء العمل', 'Работаю'],
  'On a break': ['En pausa', 'في استراحة', 'Перерыв'],
  'Clock in': ['Fichar entrada', 'تسجيل الحضور', 'Начать работу'],
  'Clock out': ['Fichar salida', 'تسجيل الانصراف', 'Закончить работу'],
  'Take a break': ['Hacer una pausa', 'أخذ استراحة', 'Сделать перерыв'],
  'End break': ['Terminar pausa', 'إنهاء الاستراحة', 'Закончить перерыв'],
  Today: ['Hoy', 'اليوم', 'Сегодня'],
  'This week': ['Esta semana', 'هذا الأسبوع', 'На этой неделе'],
  'Annual leave': ['Vacaciones anuales', 'الإجازة السنوية', 'Ежегодный отпуск'],
  'days left': ['días restantes', 'يوم متبقٍ', 'дн. осталось'],
  '{s} s': ['{s} s', '{s} ث', '{s} с'],
  'Worked today. Press Clock in to continue.': ['Trabajado hoy. Pulsa Fichar entrada para continuar.', 'عملت اليوم. اضغط تسجيل الحضور للمتابعة.', 'Отработано сегодня. Нажмите «Начать работу», чтобы продолжить.'],
  '{h} h {m} min': ['{h} h {m} min', '{h} س {m} د', '{h} ч {m} мин'],
  'Since {time}': ['Desde las {time}', 'منذ {time}', 'С {time}'],
  'Breaks: {time}': ['Pausas: {time}', 'الاستراحات: {time}', 'Перерывы: {time}'],
  'Press Clock in to start your working day.': ['Pulsa Fichar entrada para empezar tu jornada.', 'اضغط تسجيل الحضور لبدء يوم عملك.', 'Нажмите «Начать работу», чтобы начать рабочий день.'],
  'Clocked in.': ['Entrada registrada.', 'تم تسجيل الحضور.', 'Начало работы отмечено.'],
  'Clocked in (late).': ['Entrada registrada (con retraso).', 'تم تسجيل الحضور (متأخر).', 'Начало работы отмечено (с опозданием).'],
  'Clocked out. You worked {time}.': ['Salida registrada. Has trabajado {time}.', 'تم تسجيل الانصراف. عملت {time}.', 'Окончание работы отмечено. Вы отработали {time}.'],
  'Clock out now?': ['¿Fichar la salida ahora?', 'تسجيل الانصراف الآن؟', 'Закончить работу сейчас?'],
  'Clock out now? You have worked {time} today.': ['¿Fichar la salida ahora? Hoy has trabajado {time}.', 'تسجيل الانصراف الآن؟ عملت اليوم {time}.', 'Закончить работу сейчас? Сегодня вы отработали {time}.'],
  'Break started. Your time is paused.': ['Pausa iniciada. Tu tiempo está detenido.', 'بدأت الاستراحة. تم إيقاف احتساب وقتك.', 'Перерыв начат. Учёт времени приостановлен.'],
  'Welcome back. Your time is running again.': ['Bienvenido de nuevo. Tu tiempo vuelve a contar.', 'مرحبًا بعودتك. عاد احتساب وقتك.', 'С возвращением. Учёт времени продолжается.'],
  'This shift has been open for more than 14 hours. Did you forget to clock out?': ['Este turno lleva abierto más de 14 horas. ¿Olvidaste fichar la salida?', 'هذه الوردية مفتوحة منذ أكثر من 14 ساعة. هل نسيت تسجيل الانصراف؟', 'Смена открыта больше 14 часов. Вы не забыли отметить окончание?'],
  'The action could not be completed.': ['No se pudo completar la acción.', 'تعذّر إكمال الإجراء.', 'Не удалось выполнить действие.'],
  'You are already clocked in.': ['Ya has fichado la entrada.', 'لقد سجّلت الحضور بالفعل.', 'Вы уже отметили начало работы.'],
  'You are not clocked in.': ['No has fichado la entrada.', 'لم تسجّل الحضور.', 'Вы не отметили начало работы.'],
  'You are already on a break.': ['Ya estás en pausa.', 'أنت في استراحة بالفعل.', 'Вы уже на перерыве.'],
  'You are not on a break.': ['No estás en pausa.', 'لست في استراحة.', 'Вы не на перерыве.'],
  'Break (minutes)': ['Pausa (minutos)', 'الاستراحة (بالدقائق)', 'Перерыв (мин)'],
}

const pick = (index) => Object.fromEntries(Object.entries(TEXTS).map(([key, values]) => [key, values[index]]))
export const clockEs = pick(0)
export const clockAr = pick(1)
export const clockRu = pick(2)
