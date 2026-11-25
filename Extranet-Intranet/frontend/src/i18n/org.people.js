// Directors and owners declared at onboarding. Each entry: English key -> [es, ar, ru].
const TEXTS = {
  'Directors and owners': ['Administradores y titulares', 'المديرون والمالكون', 'Руководители и владельцы'],
  'List your directors or legal representatives and every person who owns more than 25%. They are screened against sanctions and PEP lists.': [
    'Indica tus administradores o representantes legales y a toda persona con más del 25 % de la propiedad. Se comprueban en listas de sanciones y PEP.',
    'أدرج المديرين أو الممثلين القانونيين وكل شخص يملك أكثر من 25%. يتم فحصهم مقابل قوائم العقوبات والأشخاص المعرضين سياسيًا.',
    'Укажите руководителей или законных представителей и всех, кому принадлежит более 25%. Они проверяются по санкционным спискам и спискам PEP.',
  ],
  'Birth year (optional)': ['Año de nacimiento (opcional)', 'سنة الميلاد (اختياري)', 'Год рождения (необязательно)'],
  'Nationality (ISO 3)': ['Nacionalidad (ISO 3)', 'الجنسية (ISO 3)', 'Гражданство (ISO 3)'],
  'Add person': ['Añadir persona', 'إضافة شخص', 'Добавить лицо'],
  'Could not add this person.': ['No se pudo añadir a esta persona.', 'تعذرت إضافة هذا الشخص.', 'Не удалось добавить это лицо.'],
  'Could not remove this person.': ['No se pudo quitar a esta persona.', 'تعذرت إزالة هذا الشخص.', 'Не удалось удалить это лицо.'],
  'Erase personal data': ['Suprimir datos personales', 'محو البيانات الشخصية', 'Стереть персональные данные'],
  'Erased person': ['Persona suprimida', 'شخص محذوف', 'Удалённое лицо'],
  'declared by applicant': ['declarado por el solicitante', 'أعلنه مقدم الطلب', 'указано заявителем'],
  'Reason for erasing this person’s data (GDPR request or end of the AML retention period)': [
    'Motivo de la supresión (solicitud RGPD o fin del plazo de conservación AML)',
    'سبب محو بيانات هذا الشخص (طلب وفق GDPR أو انتهاء مدة الاحتفاظ لمكافحة غسل الأموال)',
    'Причина удаления данных (запрос по GDPR или окончание срока хранения AML)',
  ],
  // Server messages.
  'Person added.': ['Persona añadida.', 'تمت إضافة الشخص.', 'Лицо добавлено.'],
  'Personal data erased.': ['Datos personales suprimidos.', 'تم محو البيانات الشخصية.', 'Персональные данные стёрты.'],
  'You can declare up to 30 people.': ['Puedes declarar hasta 30 personas.', 'يمكنك إعلان 30 شخصًا كحد أقصى.', 'Можно указать не более 30 лиц.'],
  'This application can no longer be changed.': ['Esta solicitud ya no se puede modificar.', 'لم يعد بالإمكان تعديل هذا الطلب.', 'Эту заявку больше нельзя изменить.'],
  'Give a reason (at least 10 characters).': ['Indica un motivo (mínimo 10 caracteres).', 'اذكر سببًا (10 أحرف على الأقل).', 'Укажите причину (не менее 10 символов).'],
  'Person not found.': ['Persona no encontrada.', 'الشخص غير موجود.', 'Лицо не найдено.'],
  'Invalid person.': ['Persona no válida.', 'بيانات الشخص غير صالحة.', 'Неверные данные лица.'],
  'Use a 3-letter country code such as ESP.': ['Usa un código de país de 3 letras, como ESP.', 'استخدم رمز دولة من 3 أحرف مثل ESP.', 'Используйте трёхбуквенный код страны, например ESP.'],
  'No director or legal representative declared.': ['No se ha declarado ningún administrador ni representante legal.', 'لم يُعلن عن مدير أو ممثل قانوني.', 'Не указан ни руководитель, ни законный представитель.'],
  'No beneficial owner declared (owners of more than 25%).': ['No se ha declarado ningún titular real (más del 25 %).', 'لم يُعلن عن مالك مستفيد (أكثر من 25%).', 'Не указан бенефициар (владеющий более 25%).'],
}

const pick = (index) => Object.fromEntries(Object.entries(TEXTS).map(([key, values]) => [key, values[index]]))
export const orgPeopleEs = pick(0)
export const orgPeopleAr = pick(1)
export const orgPeopleRu = pick(2)
