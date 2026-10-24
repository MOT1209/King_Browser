# King Browser — خطة التطوير الكاملة / Vollständiger Entwicklungsplan

> الحقائق مأخوذة من مراجعة الكود والاختبارات (أكتوبر 2026). الآراء والتقديرات موسومة بـ **[رأي]**، وما لم أتحقق منه بـ **[افتراض]**، وما لا أعرفه بـ **[لا أعرف]**.
> Fakten stammen aus Code- und Testprüfung (Oktober 2026). Meinungen und Schätzungen sind mit **[Meinung]**, Ungeprüftes mit **[Annahme]**, Unbekanntes mit **[Unbekannt]** markiert.

---

# العربية

## 1) الهدف والموقف
متصفح مفتوح المصدر يترك وكيل برمجة (OpenCode وأمثاله) يقود متصفحاً حقيقياً **مرئياً** مع بقاء الإنسان صاحب القرار. **ميزتك الوحيدة هي التحكم البشري**، ولذلك تُقاس كل فكرة بسؤال: هل تجعل هذا التحكم أقوى أو أسهل أو أثبت؟

**افتراضات أتحدّاها:**
- **[لا أعرف]** حجم الطلب على متصفح مستقل للوكلاء. **[حقيقة]** بدائل مجانية موجودة (Playwright MCP، Chrome DevTools MCP) ولا تحتاج متصفحاً جديداً.
- إن كان هدفك الأول استخدامك الشخصي فالسوق والإيراد ثانويان، والأولوية للثبات اليومي.
- **[رأي]** خطر استراتيجي: "طبقة موافقة" كإضافة لمتصفح موجود أو كخادم MCP وسيط قد تصل لناس أكثر بجهد أقل من متصفح كامل يلزمه تحديث Chromium الأمني كل بضعة أسابيع إلى الأبد. اختبر الطلب قبل أن تستثمر أكثر.

## 2) الحالة الحالية (حقائق)
- الإصدار المنشور: `v0.0.1`، وتم دمج ما يخص `v0.0.2` في `main` (تشغيل الإصدار قيد المتابعة).
- مكتمل ومدموج: إصلاح تحميل الإصدارات؛ سجل النشاط الدائم مع التصدير؛ قواعد المواقع (اسأل/احظر)؛ إنذار حقن الأوامر؛ نافذة موافقة تعرض الصفحة والعنصر؛ ملف معزول للوكيل (اختياري ومؤقت)؛ زر OpenCode؛ اختبار Windows مانع في CI.
- **غير مجرَّب فعلياً:** المثبّت على Windows، OpenCode الحقيقي، واجهة الإعدادات الجديدة، `browser_login` على مواقع حقيقية.
- الاختبارات الآلية (أكثر من ألف تأكيد) وCI على Linux وWindows خضراء.

## 3) حزم العمل (WP)
الصعوبة والوقت **[رأي]**. "أنا" = ما أستطيع تنفيذه في الكود؛ "أنت" = ما يحتاج جهازك أو مالك أو قراراً.

### WP1 — الاستخدام الفعلي أسبوعين (أنت، أولوية قصوى)
- ثبّت `v0.0.2` على Windows، اربط OpenCode بزر "OpenCode"، ونفّذ مهام حقيقية، وارفض إجراءً حساساً عمداً.
- سجّل كل عطل في GitHub Issues (قوالب البلاغات جاهزة).
- **معيار النجاح:** مطوّر جديد يوصل OpenCode في أقل من 5 دقائق وينفّذ الوكيل مهمة حقيقية بلا تدخل مني.
- الصعوبة: منخفضة. الوقت: أسبوعان. **هذه الحزمة تحدد أولويات الباقي؛ لا تتجاوزها.**

### WP2 — استهداف العناصر بلقطة وصول بدل محددات CSS (أنا) — **منفَّذ، لم يُقَس على مواقع حقيقية**
- **المشكلة:** الوكلاء يفشلون كثيراً لأنهم يخمّنون محددات CSS **[افتراض]**.
- **الحل:** أداة جديدة `browser_snapshot` تُرجع قائمة العناصر التفاعلية (دور + اسم + مرجع مثل `e12`). تقبل أدوات النقر والكتابة والاختيار الوسيط `ref` وتحوّله الطبقة الرئيسية إلى محدد قبل التصنيف، فتبقى سياسة الموافقة وسجل النشاط وقواعد المواقع كما هي دون تغيير.
- **الأمان:** ناتج اللقطة نص صفحة غير موثوق: يمر عبر كاشف الحقن؛ المراجع تُختم على العناصر ولا تُقبل إلا بصيغة `e<رقم>`.
- **القبول:** اختبارات: صيغة المرجع، التحويل، رفض المراجع المشوهة، المسح الضوئي للحقن؛ التوثيق في README.
- الصعوبة: متوسطة. الوقت: 1-2 أسبوع. **الحد:** لا أستطيع قياس تحسن النجاح على مواقع حقيقية (لا إنترنت هنا).

### WP3 — إعدادات أمان جاهزة وواجهة سجل النشاط (أنا) — **منفَّذ بنمطين فقط**
- **تعديل عن الاقتراح:** نمطان فقط، **متوازن** (الحالي) و**صارم** (كل إجراء يحتاج موافقة عدا أدوات البيانات الوصفية). حذفتُ نمط "مرن" عمداً: لا نمط يخفف بوابة الموافقة. النمط يُحفظ في العملية الرئيسية ولا يُزامَن بين الأجهزة. السجل يظهر في الإعدادات > MCP مع تصفية.
- عرض السجل في الواجهة (جدول: الوقت، الأداة، الموقع، القرار، السبب) مع تصفية.
- الصعوبة: منخفضة-متوسطة. الوقت: أسبوع.

### WP4 — تسجيل وإعادة (أنا، بعد WP2) — **منفَّذ، غير مجرَّب بصرياً ولا على مواقع حقيقية**
- تسجيل ما نفّذه الوكيل كسلسلة خطوات (باستخدام المراجع/المحددات) وإعادتها بلا نموذج ذكاء اصطناعي، مع المرور بنفس بوابة الموافقة في كل إعادة.
- **الخطر:** صفحات تتغير تكسر الإعادة؛ نحتاج رسالة فشل واضحة ولا إعادة صامتة.
- الصعوبة: متوسطة. الوقت: أسبوعان.

### WP5 — ملف معزول دائم وتسليم الدخول (أنا + أنت) — **منفَّذ (اختياري، افتراضه معطّل)، غير مجرَّب بصرياً**
- الحالي مؤقت (يُمسح عند إغلاق النافذة). المطلوب خيار "حفظ جلسة الوكيل" يسجّل فيه **أنت** الدخول يدوياً ثم يستخدمه الوكيل دون الوصول إلى كلمات مرورك.
- **مخاطرة:** جلسة دائمة تعني أن سرقة الجهاز أو تعليمة خبيثة تصل لحسابات مفعّلة؛ تحتاج زر "امسح جلسة الوكيل" واضحاً وتنبيهاً.
- الصعوبة: متوسطة. الوقت: أسبوع.

### WP6 — مجموعة اختبار حقن الأوامر (أنا) — **منفَّذ: النتيجة 13 من 20 (65%) على مجموعتي الخاصة، والأرجح أقل في الواقع**
- مجموعة صفحات هجوم معروفة (تعليمات مخفية، نص أبيض، تعليقات HTML، لغات متعددة) وسكربت يقيس ما يلتقطه الكاشف ويطبع نسبة صادقة بما فيه الإخفاقات.
- **الهدف:** أرقام صادقة قابلة للنشر. الكاشف إنذار لا حماية؛ الحماية الحقيقية هي بوابة الموافقة.
- الصعوبة: متوسطة. الوقت: أسبوع.

### WP7 — التوزيع والثقة (أنت أساساً)
- شهادات توقيع (Apple نحو 99$ سنوياً؛ Windows: OV أو Azure Trusted Signing) وأسرار GitHub؛ الـ workflow جاهز.
- winget وHomebrew cask؛ دومين للموقع ثم canonical وsitemap؛ فيديو توضيحي قصير بصوت جديد (الحالي يقول "Nova").
- تدقيق أمني خارجي قبل أي ادعاء "تشفير طرف لطرف".
- الصعوبة: مالية/إدارية. الوقت: يعتمد عليك.

### WP8 — تقليص السطح (قرارك أنت)
- **[رأي]** فكّر في تعطيل أو حذف VPN والمساعد المحلي بنماذج WebGPU والمزامنة إن لم تكن جزءاً من قصتك: كل واحد صيانة وسطح هجوم موروث من Nova. **لن أحذف شيئاً قبل قرارك الصريح.** البديل الأرخص: إخفاؤها خلف علامة "تجريبي".
- الصعوبة: منخفضة. الوقت: أيام.

### WP9 — صيانة تقنية (أنا، تدريجياً)
- تقسيم `electron/main.ts` (نحو 6900 سطر) عند لمس أجزاء منه فقط، لا دفعة واحدة.
- تخفيض تحذيرات ESLint (1081) تدريجياً؛ macOS في CI؛ سياسة تحديث Electron (تحديثات Chromium الأمنية كل بضعة أسابيع التزام دائم).

## 4) الإيراد (رأي، لا تفكر فيه الآن)
- لا إيراد قبل مستخدمين فعليين. إن ظهر طلب: ميزات فرق (سياسات مشتركة، تصدير تدقيق، SSO) فوق نواة مفتوحة **[افتراض]**. تذكّر أن Vercel Hobby (للموقع) غير تجاري.

## 5) ترتيب التنفيذ
1. WP1 (أنت، بالتوازي مع الباقي).
2. WP2 ثم WP3 (أنا، أعلى قيمة).
3. WP6 ثم WP5 ثم WP4.
4. WP7 و WP8 حسب هدفك وقراراتك. WP9 على الهامش.

## 6) ما لن أفعله بلا اتفاق
حذف ميزات، تغيير الإصدار/النشر العلني، الدمج على CI أحمر، تقسيم `main.ts` دفعة واحدة، ادعاءات أمان لم تُثبت.

---

# Deutsch

## 1) Ziel und Haltung
Ein Open-Source-Browser, in dem ein Coding-Agent (OpenCode u. ä.) einen echten, **sichtbaren** Browser steuert, während der Mensch entscheidet. **Dein einziger Vorteil ist die menschliche Kontrolle.** Jede Idee wird an der Frage gemessen: Macht sie diese Kontrolle stärker, einfacher oder stabiler?

**Annahmen, die ich hinterfrage:**
- **[Unbekannt]** Wie groß die Nachfrage nach einem eigenen Agenten-Browser ist. **[Fakt]** Kostenlose Alternativen existieren (Playwright MCP, Chrome DevTools MCP) und brauchen keinen neuen Browser.
- Ist dein Hauptziel der eigene Gebrauch, sind Markt und Einnahmen zweitrangig; Alltagsstabilität hat Vorrang.
- **[Meinung]** Strategisches Risiko: Eine „Freigabe-Schicht“ als Erweiterung eines bestehenden Browsers oder als vermittelnder MCP-Server erreicht mit weniger Aufwand eventuell mehr Menschen als ein kompletter Browser, der auf Dauer alle paar Wochen Chromium-Sicherheitsupdates braucht. Nachfrage testen, bevor du mehr investierst.

## 2) Aktueller Stand (Fakten)
- Veröffentlicht: `v0.0.1`; der Inhalt für `v0.0.2` ist in `main` gemerged (Release-Lauf wird verfolgt).
- Fertig und gemerged: Release-Download repariert; dauerhaftes Aktivitätsprotokoll mit Export; Site-Regeln (fragen/blockieren); Injection-Alarm; Freigabe-Dialog mit Seite und Element; isoliertes Agent-Profil (optional, flüchtig); OpenCode-Button; blockierender Windows-Test in der CI.
- **Nicht real getestet:** Installer unter Windows, echtes OpenCode, neue Einstellungsoberfläche, `browser_login` an echten Seiten.
- Automatische Tests (über tausend Assertions) und CI auf Linux und Windows sind grün.

## 3) Arbeitspakete (WP)
Schwierigkeit und Zeit sind **[Meinung]**. „Ich“ = per Code umsetzbar; „du“ = braucht deinen Rechner, Besitz oder eine Entscheidung.

### WP1 — Zwei Wochen echte Nutzung (du, höchste Priorität)
- `v0.0.2` unter Windows installieren, OpenCode per Button verbinden, echte Aufgaben ausführen, bewusst eine sensible Aktion ablehnen.
- Jeden Fehler als GitHub-Issue erfassen (Vorlagen vorhanden).
- **Erfolgskriterium:** Ein neuer Entwickler verbindet OpenCode in unter 5 Minuten, der Agent erledigt eine echte Aufgabe, ohne dass ich eingreife.
- Schwierigkeit: niedrig. Zeit: zwei Wochen. **Dieses Paket bestimmt die Prioritäten der übrigen; nicht überspringen.**

### WP2 — Elemente über Zugänglichkeits-Snapshot statt CSS-Selektoren (ich) — **umgesetzt, an echten Seiten nicht gemessen**
- **Problem:** Agenten scheitern oft, weil sie CSS-Selektoren raten **[Annahme]**.
- **Lösung:** Neues Werkzeug `browser_snapshot` liefert interaktive Elemente (Rolle + Name + Referenz wie `e12`). Klick-, Eingabe- und Auswahl-Werkzeuge akzeptieren `ref`; der Hauptprozess wandelt es vor der Klassifizierung in einen Selektor um, sodass Freigabe-Policy, Aktivitätsprotokoll und Site-Regeln unverändert greifen.
- **Sicherheit:** Die Snapshot-Ausgabe ist nicht vertrauenswürdiger Seitentext: sie läuft durch den Injection-Detektor; Referenzen werden auf Elemente gestempelt und nur im Format `e<Zahl>` akzeptiert.
- **Abnahme:** Tests zu Referenzformat, Umwandlung, Ablehnung fehlerhafter Referenzen, Injection-Scan; Doku im README.
- Schwierigkeit: mittel. Zeit: 1–2 Wochen. **Grenze:** Ich kann die Erfolgsverbesserung an echten Seiten nicht messen (hier kein Internet).

### WP3 — Sicherheitsprofile und Oberfläche für das Protokoll (ich) — **mit nur zwei Modi umgesetzt**
- **Abweichung vom Vorschlag:** Nur zwei Modi, **Ausgewogen** (heute) und **Streng** (jede Aktion braucht Freigabe, außer reinen Metadaten-Werkzeugen). Den Modus „Locker“ habe ich bewusst weggelassen: kein Modus darf das Freigabe-Tor lockern. Der Modus liegt im Hauptprozess und wird nicht zwischen Geräten synchronisiert. Das Protokoll steht unter Einstellungen > MCP mit Filter.
- Protokollansicht in der Oberfläche (Zeit, Werkzeug, Seite, Entscheidung, Grund) mit Filter.
- Schwierigkeit: niedrig–mittel. Zeit: eine Woche.

### WP4 — Aufzeichnen und Abspielen (ich, nach WP2) — **umgesetzt, weder visuell noch an echten Seiten getestet**
- Aktionen des Agenten als Schrittfolge aufzeichnen und ohne KI-Modell erneut abspielen, jedes Mal durch dasselbe Freigabe-Tor.
- **Risiko:** Sich ändernde Seiten brechen das Abspielen; es braucht klare Fehlermeldungen, kein stilles Weiterlaufen.
- Schwierigkeit: mittel. Zeit: zwei Wochen.

### WP5 — Dauerhaftes isoliertes Profil und Login-Übergabe (ich + du) — **umgesetzt (optional, standardmäßig aus), visuell nicht getestet**
- Heute flüchtig (beim Schließen gelöscht). Gewünscht: Option „Agent-Sitzung speichern“, in der **du** dich manuell anmeldest und der Agent sie nutzt, ohne an deine Passwörter zu kommen.
- **Risiko:** Eine dauerhafte Sitzung bedeutet, dass Gerätediebstahl oder eine bösartige Anweisung angemeldete Konten erreicht; es braucht einen klaren Button „Agent-Sitzung löschen“ und einen Hinweis.
- Schwierigkeit: mittel. Zeit: eine Woche.

### WP6 — Testsatz für Prompt-Injection (ich) — **umgesetzt: 13 von 20 (65 %) auf meinem eigenen Satz, real vermutlich weniger**
- Sammlung bekannter Angriffsseiten (versteckte Anweisungen, weißer Text, HTML-Kommentare, mehrere Sprachen) und ein Skript, das misst, was der Detektor fängt, und eine ehrliche Quote inklusive Fehlschlägen ausgibt.
- **Ziel:** Ehrliche, veröffentlichbare Zahlen. Der Detektor ist ein Alarm, kein Schutz; der echte Schutz ist das Freigabe-Tor.
- Schwierigkeit: mittel. Zeit: eine Woche.

### WP7 — Verteilung und Vertrauen (hauptsächlich du)
- Signaturzertifikate (Apple ca. 99 $/Jahr; Windows: OV oder Azure Trusted Signing) und GitHub-Secrets; der Workflow ist bereit.
- winget und Homebrew-Cask; Domain für die Website, danach canonical und Sitemap; kurzes Demo-Video mit neuer Tonspur (die aktuelle sagt „Nova“).
- Externes Sicherheits-Audit, bevor mit „Ende-zu-Ende-Verschlüsselung“ geworben wird.
- Schwierigkeit: finanziell/organisatorisch. Zeit: hängt von dir ab.

### WP8 — Angriffsfläche verkleinern (deine Entscheidung)
- **[Meinung]** VPN, lokalen WebGPU-Assistenten und Sync deaktivieren oder entfernen, wenn sie nicht zu deiner Geschichte gehören: Jedes ist Wartung und von Nova geerbte Angriffsfläche. **Ich lösche nichts ohne deine ausdrückliche Entscheidung.** Günstigere Alternative: hinter einem „Experimentell“-Schalter verstecken.
- Schwierigkeit: niedrig. Zeit: Tage.

### WP9 — Technische Wartung (ich, schrittweise)
- `electron/main.ts` (ca. 6900 Zeilen) nur bei ohnehin anstehenden Änderungen aufteilen, nicht in einem Zug.
- ESLint-Warnungen (1081) schrittweise abbauen; macOS in der CI; Electron-Update-Politik (Chromium-Sicherheitsupdates alle paar Wochen sind eine Dauerverpflichtung).

## 4) Einnahmen (Meinung, jetzt nicht darüber nachdenken)
- Keine Einnahmen vor echten Nutzern. Falls Nachfrage entsteht: Team-Funktionen (gemeinsame Richtlinien, Audit-Export, SSO) auf offenem Kern **[Annahme]**. Vercel Hobby (Website) ist nicht kommerziell.

## 5) Reihenfolge
1. WP1 (du, parallel zum Rest).
2. WP2, dann WP3 (ich, höchster Nutzen).
3. WP6, dann WP5, dann WP4.
4. WP7 und WP8 je nach deinem Ziel und deinen Entscheidungen. WP9 nebenbei.

## 6) Was ich nicht ohne Absprache tue
Funktionen löschen, Version ändern/öffentlich veröffentlichen, auf rote CI mergen, `main.ts` in einem Zug aufteilen, Sicherheitsversprechen ohne Beleg.
