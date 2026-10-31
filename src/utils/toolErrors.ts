/**
 * Tool Manager validation runs in the main process and answers in English. This
 * maps the messages a user can reach through the form to the interface language;
 * an unrecognised message is shown as received rather than hidden or guessed.
 * tests/tool_errors.test.ts feeds real validator output through this table, so a
 * reworded main-process message that stops matching fails the build.
 */
export type Localized = { en: string; ar: string; de: string };
export type Translate = (text: Localized, params?: Record<string, string | number>) => string;

const RULES: Array<[RegExp, (m: RegExpMatchArray) => [Localized, Record<string, string | number>?]]> = [
  [/^Tool name is required\.$/, () => [{ en: 'Tool name is required.', ar: 'اسم الأداة مطلوب.', de: 'Der Werkzeugname ist erforderlich.' }]],
  [/^Tool name must be "custom_"/, () => [{ en: 'The name must use 2-56 lowercase letters, digits or underscores, starting with a letter.', ar: 'يجب أن يتكون الاسم من 2 إلى 56 حرفاً صغيراً أو رقماً أو شرطة سفلية، ويبدأ بحرف.', de: 'Der Name muss aus 2-56 Kleinbuchstaben, Ziffern oder Unterstrichen bestehen und mit einem Buchstaben beginnen.' }]],
  [/^Description is required\.$/, () => [{ en: 'Description is required.', ar: 'الوصف مطلوب.', de: 'Die Beschreibung ist erforderlich.' }]],
  [/^Description must be at least 30 characters/, () => [{ en: 'The description must be at least 30 characters: say what the tool does and when an agent should use it.', ar: 'يجب ألا يقل الوصف عن 30 حرفاً: اشرح ما تفعله الأداة ومتى يستخدمها الوكيل.', de: 'Die Beschreibung braucht mindestens 30 Zeichen: Sagen Sie, was das Werkzeug tut und wann ein Agent es nutzen soll.' }]],
  [/^Description must be at most 1000/, () => [{ en: 'The description must be at most 1000 characters.', ar: 'يجب ألا يزيد الوصف عن 1000 حرف.', de: 'Die Beschreibung darf höchstens 1000 Zeichen haben.' }]],
  [/^Description must be a real sentence/, () => [{ en: 'The description must be a real sentence (at least 5 words).', ar: 'يجب أن يكون الوصف جملة حقيقية (5 كلمات على الأقل).', de: 'Die Beschreibung muss ein echter Satz sein (mindestens 5 Wörter).' }]],
  [/^Description must not be filler text\.$/, () => [{ en: 'The description must not be filler text.', ar: 'يجب ألا يكون الوصف نصاً حشواً.', de: 'Die Beschreibung darf kein Füllertext sein.' }]],
  [/^Description looks like an instruction/, () => [{ en: 'The description reads like an instruction to an AI agent; describe the tool instead.', ar: 'يبدو الوصف كتعليمات لوكيل ذكاء اصطناعي؛ صف الأداة بدلاً من ذلك.', de: 'Die Beschreibung liest sich wie eine Anweisung an einen KI-Agenten; beschreiben Sie stattdessen das Werkzeug.' }]],
  [/^A tool named "(.+)" already exists\.$/, (m) => [{ en: 'A tool named "{name}" already exists.', ar: 'توجد أداة باسم "{name}" بالفعل.', de: 'Ein Werkzeug namens "{name}" existiert bereits.' }, { name: m[1] }]],
  [/^Only https:\/\/ URLs are allowed\.$/, () => [{ en: 'Only https:// addresses are allowed.', ar: 'عناوين https:// فقط مسموحة.', de: 'Nur https://-Adressen sind erlaubt.' }]],
  [/^Local and internal hostnames are not allowed\.$/, () => [{ en: 'Local and internal host names are not allowed.', ar: 'أسماء المضيفين المحلية والداخلية غير مسموحة.', de: 'Lokale und interne Hostnamen sind nicht erlaubt.' }]],
  [/^The host and port of the URL cannot contain placeholders\.$/, () => [{ en: 'The host and port of the address cannot contain parameters.', ar: 'لا يمكن أن يحتوي المضيف والمنفذ في العنوان على معاملات.', de: 'Host und Port der Adresse dürfen keine Parameter enthalten.' }]],
  [/^(?:The URL|Query "[^"]*"|The body) uses \{(\w+)\} which is not a declared parameter\.$/, (m) => [{ en: '{p} is used but is not a declared input parameter.', ar: '{p} مستخدم لكنه ليس معامل إدخال معرّفاً.', de: '{p} wird verwendet, ist aber kein deklarierter Eingabeparameter.' }, { p: `{${m[1]}}` }]],
  [/^Put query parameters in the query list/, () => [{ en: 'Put query parameters in the query list, not in the address.', ar: 'ضع معاملات الاستعلام في قائمة الاستعلام وليس في العنوان.', de: 'Abfrageparameter gehören in die Abfrageliste, nicht in die Adresse.' }]],
  [/^A credential is required/, () => [{ en: 'A credential is required for the selected authentication type.', ar: 'بيانات الاعتماد مطلوبة لنوع المصادقة المحدد.', de: 'Für die gewählte Authentifizierung sind Zugangsdaten erforderlich.' }]],
  [/^Automatic approval is only available for GET and HEAD/, () => [{ en: 'Automatic approval is only available for GET and HEAD requests.', ar: 'الموافقة التلقائية متاحة لطلبات GET و HEAD فقط.', de: 'Die automatische Freigabe gibt es nur für GET- und HEAD-Anfragen.' }]],
  [/^Tools that send a credential always require approval\.$/, () => [{ en: 'Tools that send a credential always require approval.', ar: 'الأدوات التي ترسل بيانات اعتماد تتطلب الموافقة دائماً.', de: 'Werkzeuge, die Zugangsdaten senden, erfordern immer eine Freigabe.' }]],
  [/^That tool no longer exists\.$/, () => [{ en: 'That tool no longer exists.', ar: 'هذه الأداة لم تعد موجودة.', de: 'Dieses Werkzeug existiert nicht mehr.' }]],
  [/^Requests to private\/internal IP addresses are blocked\.$/, () => [{ en: 'The address points to a private or internal network and is blocked.', ar: 'العنوان يشير إلى شبكة خاصة أو داخلية وهو محظور.', de: 'Die Adresse zeigt auf ein privates oder internes Netz und ist gesperrt.' }]],
  [/^At most (\d+) custom tools are allowed\.$/, (m) => [{ en: 'At most {n} custom tools are allowed.', ar: 'الحد الأقصى {n} أداة مخصصة.', de: 'Höchstens {n} eigene Werkzeuge sind erlaubt.' }, { n: m[1] }]],
];

/** Every rule's pattern, so a test can prove each one matches something the validator really says. */
export const TOOL_ERROR_PATTERNS = RULES.map(([pattern]) => pattern);

export function translateToolError(message: string, l: Translate): string {
  for (const [pattern, build] of RULES) {
    const match = message.match(pattern);
    if (match) {
      const [text, params] = build(match);
      return l(text, params);
    }
  }
  return message;
}
