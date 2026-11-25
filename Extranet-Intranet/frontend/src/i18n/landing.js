// Landing page texts (greeting, features and regions) in Spanish, Arabic and Russian.
// Each entry: English key -> [es, ar, ru].
const LANDING = {
  'Good morning': ['Buenos días', 'صباح الخير', 'Доброе утро'],
  'Good afternoon': ['Buenas tardes', 'مساء الخير', 'Добрый день'],
  'Good evening': ['Buenas noches', 'مساء الخير', 'Добрый вечер'],
  'Centralised access': ['Acceso centralizado', 'وصول مركزي', 'Централизованный доступ'],
  'Connected teams': ['Equipos conectados', 'فرق متصلة', 'Связанные команды'],
  'Secure collaboration': ['Colaboración segura', 'تعاون آمن', 'Безопасное сотрудничество'],
  'A structured environment for internal and external collaboration.': ['Un entorno estructurado para la colaboración interna y externa.', 'بيئة منظمة للتعاون الداخلي والخارجي.', 'Структурированная среда для внутреннего и внешнего сотрудничества.'],
  'Access your organisation’s workspace and resources from one place.': ['Accede al espacio y los recursos de tu organización desde un único lugar.', 'ادخل إلى مساحة عمل مؤسستك ومواردها من مكان واحد.', 'Доступ к пространству и ресурсам организации из одного места.'],
  'Bring colleagues, partners and collaborators together.': ['Reúne a compañeros, socios y colaboradores.', 'اجمع الزملاء والشركاء والمتعاونين معًا.', 'Объединяйте коллег, партнёров и участников.'],
  'Building a connected network across the African continent.': ['Construyendo una red conectada en todo el continente africano.', 'نبني شبكة متصلة عبر القارة الأفريقية.', 'Создаём связанную сеть по всему африканскому континенту.'],
  'Building stronger connections with teams and organisations in India.': ['Fortaleciendo las conexiones con equipos y organizaciones en India.', 'نبني روابط أقوى مع الفرق والمؤسسات في الهند.', 'Укрепляем связи с командами и организациями в Индии.'],
  'Connecting businesses and partners throughout Latin America.': ['Conectando empresas y socios en toda América Latina.', 'نربط الشركات والشركاء في أنحاء أمريكا اللاتينية.', 'Соединяем компании и партнёров по всей Латинской Америке.'],
  'Connecting organisations and partners across the European Union.': ['Conectando organizaciones y socios en toda la Unión Europea.', 'نربط المؤسسات والشركاء في أنحاء الاتحاد الأوروبي.', 'Соединяем организации и партнёров по всему Европейскому союзу.'],
  'Enabling collaboration with organisations across the United States.': ['Facilitando la colaboración con organizaciones de todo Estados Unidos.', 'نتيح التعاون مع المؤسسات في أنحاء الولايات المتحدة.', 'Сотрудничество с организациями по всем США.'],
  'Extending our connected workspace to partners across Canada.': ['Extendiendo nuestro espacio conectado a socios de todo Canadá.', 'نوسّع مساحة عملنا المتصلة لتشمل الشركاء في أنحاء كندا.', 'Расширяем наше пространство для партнёров по всей Канаде.'],
  'Strengthening business connections with partners in Morocco.': ['Reforzando las relaciones comerciales con socios en Marruecos.', 'نعزز الروابط التجارية مع الشركاء في المغرب.', 'Укрепляем деловые связи с партнёрами в Марокко.'],
  'Supporting collaboration and business connections in the UAE.': ['Impulsando la colaboración y las relaciones comerciales en los EAU.', 'ندعم التعاون والروابط التجارية في الإمارات.', 'Поддерживаем сотрудничество и деловые связи в ОАЭ.'],
  EUROPE: ['EUROPA', 'أوروبا', 'ЕВРОПА'],
  'MIDDLE EAST': ['ORIENTE MEDIO', 'الشرق الأوسط', 'БЛИЖНИЙ ВОСТОК'],
  'NORTH AFRICA': ['NORTE DE ÁFRICA', 'شمال أفريقيا', 'СЕВЕРНАЯ АФРИКА'],
  'NORTH AMERICA': ['NORTEAMÉRICA', 'أمريكا الشمالية', 'СЕВЕРНАЯ АМЕРИКА'],
  'REGIONAL NETWORK': ['RED REGIONAL', 'شبكة إقليمية', 'РЕГИОНАЛЬНАЯ СЕТЬ'],
  'SOUTH ASIA': ['ASIA DEL SUR', 'جنوب آسيا', 'ЮЖНАЯ АЗИЯ'],
  Africa: ['África', 'أفريقيا', 'Африка'],
  Canada: ['Canadá', 'كندا', 'Канада'],
  'European Union': ['Unión Europea', 'الاتحاد الأوروبي', 'Европейский союз'],
  India: ['India', 'الهند', 'Индия'],
  'Latin America': ['América Latina', 'أمريكا اللاتينية', 'Латинская Америка'],
  Morocco: ['Marruecos', 'المغرب', 'Марокко'],
  'United Arab Emirates': ['Emiratos Árabes Unidos', 'الإمارات العربية المتحدة', 'Объединённые Арабские Эмираты'],
  'United States': ['Estados Unidos', 'الولايات المتحدة', 'США'],
}

const pick = (index) => Object.fromEntries(Object.entries(LANDING).map(([key, values]) => [key, values[index]]))
export const landingEs = pick(0)
export const landingAr = pick(1)
export const landingRu = pick(2)
