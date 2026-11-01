# King Browser — خطة التطوير / Entwicklungsplan

> الحقائق مأخوذة من الكود والاختبارات (نوفمبر 2026). الآراء والتقديرات موسومة بـ **[رأي]**، وما لم أتحقق منه بـ **[افتراض]**، وما لا أعرفه بـ **[لا أعرف]**. هذه الخطة تضم ما تبقى فقط؛ ما أُنجز موجود في سجل الإصدارات (`src/data/changelog.ts`) وفي `git log`.
> Fakten stammen aus Code und Tests (November 2026). Meinungen und Schätzungen sind mit **[Meinung]**, Ungeprüftes mit **[Annahme]**, Unbekanntes mit **[Unbekannt]** markiert. Dieser Plan enthält nur, was noch offen ist; Erledigtes steht im Changelog (`src/data/changelog.ts`) und in `git log`.

---

# العربية

## 1) الهدف والموقف
متصفح مفتوح المصدر يترك وكيل برمجة (OpenCode وأمثاله) يقود متصفحاً حقيقياً **مرئياً** مع بقاء الإنسان صاحب القرار. **ميزتك الوحيدة هي التحكم البشري**، ولذلك تُقاس كل فكرة بسؤال: هل تجعل هذا التحكم أقوى أو أسهل أو أثبت؟

**افتراضات أتحدّاها:**
- **[لا أعرف]** حجم الطلب على متصفح مستقل للوكلاء. **[حقيقة]** بدائل مجانية موجودة (Playwright MCP، Chrome DevTools MCP) ولا تحتاج متصفحاً جديداً.
- إن كان هدفك الأول استخدامك الشخصي فالسوق والإيراد ثانويان، والأولوية للثبات اليومي.
- **[رأي]** خطر استراتيجي: "طبقة موافقة" كإضافة لمتصفح موجود أو كخادم MCP وسيط قد تصل لناس أكثر بجهد أقل من متصفح كامل يلزمه تحديث Chromium الأمني كل بضعة أسابيع إلى الأبد. اختبر الطلب قبل أن تستثمر أكثر.

## 2) الحالة الحالية (حقائق)
- الإصدار المنشور: `v0.0.11` (أكتوبر 2026). يُنشر إصدار تلقائياً عند رفع `version` في `main`. CI خضراء على Linux وWindows وmacOS وelectron-e2e.
- **منفَّذ لكن لم يُجرَّب على مواقع حقيقية أو بصرياً** (لا عمل برمجي متبقٍ، يحتاج تجربة فقط): استهداف العناصر بالمراجع (`browser_snapshot`)؛ التسجيل والإعادة؛ ملف الوكيل المعزول الدائم؛ النقر الأيمن والمزدوج؛ مهارة قيادة المتصفح مع وكيل حقيقي؛ مدير الأدوات المخصصة؛ `browser_login`؛ المثبّت على Windows وmacOS؛ محرر contenteditable حقيقي (Gmail أو Slack أو Docs).
- كاشف حقن الأوامر يلتقط 13 من 20 (65%) على مجموعتي الخاصة، والأرجح أقل في الواقع. هو إنذار لا حماية؛ الحماية هي بوابة الموافقة.
- لم يُتحقق حياً من المزامنة على مشروع Supabase حقيقي بحسابين.

## 3) حزم العمل المتبقية
الصعوبة والوقت **[رأي]**. "أنا" = ما أستطيع تنفيذه في الكود؛ "أنت" = ما يحتاج جهازك أو حسابك أو قرارك.

### WP1 — الاستخدام الفعلي أسبوعين (أنت، أولوية قصوى)
- ثبّت `v0.0.11` على Windows، اربط OpenCode بزر "OpenCode"، ونفّذ مهام حقيقية، وارفض إجراءً حساساً عمداً. جرّب العناصر في قائمة "منفَّذ لكن لم يُجرَّب" أعلاه.
- سجّل كل عطل في GitHub Issues (قوالب البلاغات جاهزة).
- **معيار النجاح:** مطوّر جديد يوصل OpenCode في أقل من 5 دقائق وينفّذ الوكيل مهمة حقيقية بلا تدخل مني.
- الصعوبة: منخفضة. الوقت: أسبوعان. **هذه الحزمة تحدد أولويات الباقي؛ لا تتجاوزها.**

### WP7 — التوزيع والثقة (أنت أساساً)
- **توقيع Windows:** سياسة التوقيع منشورة (`CODE_SIGNING.md`). الخطوة التالية: طلب SignPath Foundation، ثم ربط سير الإصدار بعد الموافقة.
- **توقيع macOS:** شهادة Apple (نحو 99$ سنوياً **[افتراض]**)؛ التحديث التلقائي على macOS يحتاجها.
- winget وHomebrew cask؛ دومين للموقع ثم canonical وsitemap؛ فيديو توضيحي قصير بصوت جديد (الحالي يقول "Nova").
- تدقيق أمني خارجي قبل أي ادعاء أمني أقوى في README.
- الصعوبة: مالية/إدارية. الوقت: يعتمد عليك.

### WP8 — تقليص السطح (قرارك أنت)
- **[رأي]** فكّر في تعطيل أو حذف VPN والمساعد المحلي بنماذج WebGPU والمزامنة إن لم تكن جزءاً من قصتك: كل واحد صيانة وسطح هجوم موروث من Nova. **لن أحذف شيئاً قبل قرارك الصريح.** البديل الأرخص: إخفاؤها خلف علامة "تجريبي".
- إزالة نقل SSE القديم في MCP (يكسر العملاء الذين يستخدمون `/sse`).
- الصعوبة: منخفضة. الوقت: أيام.

### WP9 — صيانة تقنية (أنا، تدريجياً)
- تقسيم `electron/main.ts` (نحو 5900 سطر) عند لمس أجزاء منه فقط، لا دفعة واحدة.
- تخفيض تحذيرات ESLint في `src` و`electron` (860) تدريجياً، لا دفعة واحدة.
- تحديث Electron ضمن الإصدار الرئيسي نفسه مع كل إصدار (تحديثات Chromium الأمنية التزام دائم).
- حماية المزامنة من إعادة تقديم نسخة قديمة (تحتاج صيغة تشفير جديدة وترحيلاً؛ قرارك قبل البدء).

### WP10 — تحكم الوكيل بإدخال حقيقي (أنا) — المتبقي
- **الهدف:** كل نقرة وكتابة ومفتاح وتمرير يمر عبر مسار الإدخال الأصلي للمتصفح. **ليس هدفاً:** التخفي عن كشف البوتات، أو حل CAPTCHA، أو تزييف البصمة.
- **المرحلة 2 — أدوات جديدة:** نوافذ `alert`/`confirm`/`prompt`؛ رفع الملفات (`<input type=file>` عبر CDP `DOM.setFileInputFiles`، بموافقة في كل مرة لأنه يُخرج ملفاً من الجهاز)؛ السحب والإفلات؛ دعم iframe وShadow DOM في `browser_snapshot`. الصعوبة: متوسطة-عالية. الوقت: 4-6 أسابيع **[رأي]**.
- **المرحلة 3 — الإدراك:** شجرة الوصول عبر CDP `Accessibility.getFullAXTree` بدل مسح DOM. الصعوبة: متوسطة. الوقت: 2-3 أسابيع **[رأي]**.
- **القيود:** لا مكتبات جديدة (إدخال Electron الأصلي وCDP يكفيان)، ولا إدخال على مستوى النظام (يحرّك مؤشر الإنسان ويكسر التحكم البشري). اختبار أولاً، ثم تحقق حي، ولا تخفيف لبوابة الموافقة.

## 4) الإيراد (رأي، لا تفكر فيه الآن)
- لا إيراد قبل مستخدمين فعليين. إن ظهر طلب: ميزات فرق (سياسات مشتركة، تصدير تدقيق، SSO) فوق نواة مفتوحة **[افتراض]**. تذكّر أن Vercel Hobby (للموقع) غير تجاري.

## 5) ترتيب التنفيذ
1. WP1 (أنت، بالتوازي مع الباقي).
2. WP10 المرحلة 2 بحسب ما يظهر في WP1؛ **[رأي]** نوافذ `alert`/`confirm`/`prompt` أولاً لأنها شائعة وقد توقف تشغيل الوكيل.
3. WP7 (توقيع Windows عبر SignPath) بالتوازي.
4. WP10 المرحلة 3، ثم WP8 حسب قرارك. WP9 على الهامش.

## 6) ما لن أفعله بلا اتفاق
حذف ميزات، تغيير الإصدار/النشر العلني، الدمج على CI أحمر، تقسيم `main.ts` دفعة واحدة، ادعاءات أمان لم تُثبت، تغيير صيغة تشفير المزامنة أو سياسة الموافقة.

---

# Deutsch

## 1) Ziel und Haltung
Ein Open-Source-Browser, in dem ein Coding-Agent (OpenCode u. ä.) einen echten, **sichtbaren** Browser steuert, während der Mensch entscheidet. **Dein einziger Vorteil ist die menschliche Kontrolle.** Jede Idee wird an der Frage gemessen: Macht sie diese Kontrolle stärker, einfacher oder stabiler?

**Annahmen, die ich hinterfrage:**
- **[Unbekannt]** Wie groß die Nachfrage nach einem eigenen Agenten-Browser ist. **[Fakt]** Kostenlose Alternativen existieren (Playwright MCP, Chrome DevTools MCP) und brauchen keinen neuen Browser.
- Ist dein Hauptziel der eigene Gebrauch, sind Markt und Einnahmen zweitrangig; Alltagsstabilität hat Vorrang.
- **[Meinung]** Strategisches Risiko: Eine „Freigabe-Schicht" als Erweiterung eines bestehenden Browsers oder als vermittelnder MCP-Server erreicht mit weniger Aufwand eventuell mehr Menschen als ein kompletter Browser, der auf Dauer alle paar Wochen Chromium-Sicherheitsupdates braucht. Nachfrage testen, bevor du mehr investierst.

## 2) Aktueller Stand (Fakten)
- Veröffentlicht: `v0.0.11` (Oktober 2026). Ein Release erscheint automatisch, wenn `version` in `main` erhöht wird. CI grün auf Linux, Windows, macOS und electron-e2e.
- **Umgesetzt, aber nicht an echten Seiten oder visuell getestet** (keine Programmierarbeit offen, nur Ausprobieren): Element-Refs (`browser_snapshot`); Aufzeichnen und Abspielen; dauerhaftes isoliertes Agent-Profil; Rechts- und Doppelklick; der Driver-Skill mit einem echten Agenten; der Tool Manager für eigene Tools; `browser_login`; die Installer unter Windows und macOS; ein echter contenteditable-Editor (Gmail, Slack oder Docs).
- Der Prompt-Injection-Detektor erkennt 13 von 20 (65 %) auf meinem eigenen Satz, real vermutlich weniger. Er ist ein Alarm, kein Schutz; der Schutz ist das Freigabe-Tor.
- Sync wurde nicht live gegen ein echtes Supabase-Projekt mit zwei Konten geprüft.

## 3) Offene Arbeitspakete
Schwierigkeit und Zeit sind **[Meinung]**. „Ich" = per Code umsetzbar; „du" = braucht deinen Rechner, dein Konto oder deine Entscheidung.

### WP1 — Zwei Wochen echte Nutzung (du, höchste Priorität)
- `v0.0.11` unter Windows installieren, OpenCode über den „OpenCode"-Button verbinden, echte Aufgaben erledigen und absichtlich eine sensible Aktion ablehnen. Die Punkte aus „umgesetzt, aber nicht getestet" oben ausprobieren.
- Jeden Fehler als GitHub Issue melden (Vorlagen sind vorhanden).
- **Erfolgskriterium:** Ein neuer Entwickler verbindet OpenCode in unter 5 Minuten, und der Agent erledigt eine echte Aufgabe ohne mein Eingreifen.
- Schwierigkeit: niedrig. Zeit: zwei Wochen. **Dieses Paket bestimmt die Prioritäten des Rests; nicht überspringen.**

### WP7 — Verteilung und Vertrauen (hauptsächlich du)
- **Windows-Signatur:** Die Signing Policy ist veröffentlicht (`CODE_SIGNING.md`). Nächster Schritt: Antrag bei der SignPath Foundation, nach der Genehmigung den Release-Workflow anbinden.
- **macOS-Signatur:** Apple-Zertifikat (ca. 99 $/Jahr **[Annahme]**); automatische Updates unter macOS brauchen es.
- winget und Homebrew-Cask; Domain für die Website, danach canonical und Sitemap; kurzes Demo-Video mit neuer Tonspur (die aktuelle sagt „Nova").
- Externes Sicherheits-Audit vor stärkeren Sicherheitsaussagen im README.
- Schwierigkeit: finanziell/organisatorisch. Zeit: hängt von dir ab.

### WP8 — Angriffsfläche verkleinern (deine Entscheidung)
- **[Meinung]** VPN, lokalen WebGPU-Assistenten und Sync deaktivieren oder entfernen, wenn sie nicht zu deiner Geschichte gehören: Jedes ist Wartung und von Nova geerbte Angriffsfläche. **Ich lösche nichts ohne deine ausdrückliche Entscheidung.** Günstigere Alternative: hinter einem „Experimentell"-Schalter verstecken.
- Den alten SSE-Transport von MCP entfernen (bricht Clients, die `/sse` nutzen).
- Schwierigkeit: niedrig. Zeit: Tage.

### WP9 — Technische Wartung (ich, schrittweise)
- `electron/main.ts` (ca. 5900 Zeilen) nur bei ohnehin anstehenden Änderungen aufteilen, nicht in einem Zug.
- ESLint-Warnungen in `src` und `electron` (860) schrittweise abbauen, nicht in einem Zug.
- Electron mit jedem Release innerhalb der Hauptversion aktualisieren (Chromium-Sicherheitsupdates sind eine Dauerverpflichtung).
- Sync gegen das erneute Ausliefern einer alten Version schützen (braucht ein neues Verschlüsselungsformat und eine Migration; vorher deine Entscheidung).

### WP10 — Agent steuert mit echter Eingabe (ich) — offen
- **Ziel:** Jeder Klick, jede Eingabe, jede Taste und jedes Scrollen läuft über den nativen Eingabepfad des Browsers. **Kein Ziel:** Bot-Erkennung umgehen, CAPTCHAs lösen oder Fingerabdrücke fälschen.
- **Phase 2 — neue Werkzeuge:** `alert`/`confirm`/`prompt`-Dialoge; Datei-Upload (`<input type=file>` über CDP `DOM.setFileInputFiles`, jedes Mal mit Freigabe, weil eine Datei den Rechner verlässt); Drag-and-drop; iframe- und Shadow-DOM-Unterstützung in `browser_snapshot`. Schwierigkeit: mittel bis hoch. Zeit: 4-6 Wochen **[Meinung]**.
- **Phase 3 — Wahrnehmung:** Zugänglichkeitsbaum über CDP `Accessibility.getFullAXTree` statt DOM-Scan. Schwierigkeit: mittel. Zeit: 2-3 Wochen **[Meinung]**.
- **Grenzen:** keine neuen Bibliotheken (native Electron-Eingabe und CDP reichen), keine Eingabe auf Systemebene (bewegt den Mauszeiger des Menschen und bricht die menschliche Kontrolle). Erst Test, dann Live-Prüfung, keine Lockerung des Freigabe-Tors.

## 4) Einnahmen (Meinung, jetzt nicht darüber nachdenken)
- Keine Einnahmen vor echten Nutzern. Falls Nachfrage entsteht: Team-Funktionen (gemeinsame Richtlinien, Audit-Export, SSO) auf offenem Kern **[Annahme]**. Vercel Hobby (Website) ist nicht kommerziell.

## 5) Reihenfolge
1. WP1 (du, parallel zum Rest).
2. WP10 Phase 2 nach dem, was WP1 zeigt; **[Meinung]** zuerst `alert`/`confirm`/`prompt`-Dialoge, weil sie häufig sind und einen Agentenlauf anhalten können.
3. WP7 (Windows-Signatur über SignPath) parallel.
4. WP10 Phase 3, dann WP8 nach deiner Entscheidung. WP9 nebenbei.

## 6) Was ich nicht ohne Absprache tue
Funktionen löschen, Version/öffentliche Veröffentlichung ändern, bei roter CI mergen, `main.ts` in einem Zug aufteilen, unbewiesene Sicherheitsaussagen, das Sync-Verschlüsselungsformat oder die Freigabe-Politik ändern.
