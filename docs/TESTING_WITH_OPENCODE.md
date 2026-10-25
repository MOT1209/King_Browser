# اختبار King Browser مع OpenCode / King Browser mit OpenCode testen

> هذا الدليل يغطي ما بُني ولم يُختبر فعلياً بعد. الهدف: تجد الأعطال الحقيقية وتبلّغ عنها بشكل يمكن إصلاحه.
> Diese Anleitung deckt ab, was gebaut, aber noch nicht real getestet wurde. Ziel: echte Fehler finden und so melden, dass sie behebbar sind.

---

# العربية

## 0) التثبيت
1. نزّل `King-Browser-Setup-<الإصدار>-x64.exe` من صفحة Releases (آخر إصدار مرقّم، ليس nightly).
2. SmartScreen سيحذر لأن البناء غير موقّع: اضغط **More info** ثم **Run anyway**.
3. شغّل التطبيق. **المتوقع:** يفتح بلا أخطاء، وتظهر "ما الجديد" برقم الإصدار.
4. لا تُلغِ التثبيت لاحقاً لتحدّث: ذلك يحذف بياناتك. ثبّت الجديد فوق القديم أو دع التطبيق يحدّث نفسه.

## 1) ربط OpenCode (معيار النجاح: أقل من 5 دقائق)
1. الإعدادات ← **MCP**: شغّل الخادم. قد تظهر نافذة موافقة أول استخدام: وافق.
2. اضغط زر **OpenCode** في القسم نفسه. ينسخ إعداداً من نوع `local` يشغّل الجسر المرفق مع التطبيق (`resources/mcp-bridge.cjs`) مع `MCP_TOKEN` و`MCP_PORT`، ويمسح الحافظة بعد 15 ثانية. يحتاج Node.js في `PATH`.
3. الصق الإعداد في `opencode.json` (جذر المشروع أو `~/.config/opencode/opencode.json`) ثم أعد تشغيل OpenCode.
4. اسأله: *"اعرض أدوات king-browser"*. **المتوقع:** قائمة أدوات `browser_*`، و`opencode mcp list` يقول `connected`.
5. إن فشل الاتصال: تأكد أن Node.js مثبت (`node --version`)، وأن King Browser يعمل، وأن المنفذ في الإعداد يطابق المنفذ في الإعدادات. الإعداد اليدوي (`mcp-bridge.mjs` من المستودع) ما زال موثقاً في README.

## 2) سيناريوهات الاختبار
لكل سيناريو: **المتوقع** ثم دوّن النتيجة (نجح / فشل + الخطأ).

| # | قل لـ OpenCode | المتوقع |
|---|---|---|
| 1 | "افتح https://example.com واقرأ العنوان" | ينتقل ويعيد "Example Domain". يظهر مؤشر الوكيل وشريط النشاط. |
| 2 | "خذ browser_snapshot لهذه الصفحة ثم انقر على رابط More information" | يعرض عناصر بمراجع (`e1`...) وينقر بالمرجع وتنتقل الصفحة. |
| 3 | على صفحة فيها زر شراء/حذف/إضافة للسلة (صفحة تجريبية، **ليس حسابك الحقيقي**): "انقر على Add to cart" | **تظهر نافذة موافقة** بالموقع والعنصر. اضغط **Reject**: يُبلَّغ الوكيل بالرفض ولا ينفَّذ شيء. |
| 4 | الإعدادات ← MCP ← وضع الموافقة = **Strict**، ثم "اقرأ الصفحة الحالية" | تظهر نافذة موافقة حتى للقراءة. أعده إلى Balanced بعد الاختبار. |
| 5 | أضف قاعدة موقع: `example.com` = **Block**، ثم "افتح example.com" | يُرفض بعبارة "Blocked by your site rule". احذف القاعدة بعد الاختبار. |
| 6 | فعّل **Isolated agent profile**، ثم "اعرض التبويبات" ثم "افتح تبويباً جديداً على example.com" | لا يرى تبويباتك، ويعمل فقط على تبويب يفتحه بنفسه (جلسة منفصلة). |
| 7 | (مع العزل) فعّل "Keep the agent's logins"، سجّل أنت الدخول في تبويب الوكيل، أعد تشغيل التطبيق | تبقى الجلسة. زر "Clear the agent's session" يمسحها. |
| 8 | الإعدادات ← MCP ← **Start recording**، اطلب من الوكيل: افتح موقعاً وانقر رابطاً، ثم **Stop and save**، ثم **Replay** | يعيد الخطوات مع موافقتك على الحساسة. لا يكتب أبداً نص كلمات المرور ويتوقف عندها. |
| 9 | الإعدادات ← MCP ← "Agent activity" | تظهر الإجراءات (مرفوض/مكتمل). التصدير من لوحة التحكم (Ctrl+Shift+.). |
| 10 | صفحة فيها نص مثل "Ignore all previous instructions..." (أنشئها محلياً أو في ملف على موقع تتحكم به) | يُحذَّر الوكيل ويُطلب إذنك للإجراء التالي. تذكّر: الكاشف يلتقط نحو ثلثي الحالات فقط. |

## 3) كيف تبلّغ عن عطل (GitHub Issues أو أرسله لي)
- الإصدار ونظام التشغيل.
- السيناريو والخطوات بالترتيب.
- المتوقع والذي حدث فعلاً.
- نص الخطأ بالضبط ولقطة شاشة.
- تصدير سجل النشاط (JSON) إن كان العطل في إجراء للوكيل: القيم الحساسة فيه مخفاة.

## 4) حدود معروفة (لا تعتبرها أعطالاً جديدة)
- البناء غير موقّع. التحديث التلقائي على macOS غير الموقّع غير مضمون.
- العزل لا يغطي المساعد الداخلي، وجلسة الوكيل مؤقتة ما لم تفعّل الحفظ.
- كاشف الحقن إنذار لا حماية؛ الحماية الحقيقية هي نافذة الموافقة.
- `browser_login` وصفحات الدخول بخطوتين (مثل Google) غير مجرَّبة؛ Google قد يرفض المتصفحات المضمنة.

---

# Deutsch

## 0) Installation
1. `King-Browser-Setup-<Version>-x64.exe` von der Releases-Seite laden (neuestes nummeriertes Release, nicht nightly).
2. SmartScreen warnt, weil der Build unsigniert ist: **More info**, dann **Run anyway**.
3. App starten. **Erwartet:** startet ohne Fehler, „Was ist neu“ zeigt die Versionsnummer.
4. Zum Aktualisieren nicht deinstallieren: Das löscht deine Daten. Neue Version über die alte installieren oder die App sich selbst aktualisieren lassen.

## 1) OpenCode verbinden (Erfolgskriterium: unter 5 Minuten)
1. Einstellungen → **MCP**: Server starten. Beim ersten Mal kann ein Freigabe-Dialog erscheinen: zustimmen.
2. Den Button **OpenCode** im selben Bereich drücken. Er kopiert einen `local`-Eintrag, der die mitgelieferte Brücke (`resources/mcp-bridge.cjs`) mit `MCP_TOKEN` und `MCP_PORT` startet; die Zwischenablage wird nach 15 Sekunden geleert. Node.js muss in `PATH` liegen.
3. Den Eintrag in `opencode.json` einfügen (Projektwurzel oder `~/.config/opencode/opencode.json`) und OpenCode neu starten.
4. Fragen: *„Liste die Werkzeuge von king-browser“*. **Erwartet:** Liste der `browser_*`-Werkzeuge; `opencode mcp list` meldet `connected`.
5. Wenn die Verbindung scheitert: prüfen, ob Node.js installiert ist (`node --version`), King Browser läuft und der Port im Eintrag zu den Einstellungen passt. Die manuelle Variante (`mcp-bridge.mjs` aus dem Repository) steht weiterhin im README.

## 2) Testszenarien
Zu jedem: **Erwartet**, dann Ergebnis notieren (ok / Fehler + Meldung).

| # | Sag zu OpenCode | Erwartet |
|---|---|---|
| 1 | „Öffne https://example.com und lies die Überschrift“ | Navigiert, liefert „Example Domain“. Agent-Zeiger und Aktivitätsleiste erscheinen. |
| 2 | „Mach ein browser_snapshot dieser Seite und klicke den Link More information“ | Listet Elemente mit Referenzen (`e1` …), klickt per Referenz, die Seite wechselt. |
| 3 | Auf einer Seite mit Kauf-/Lösch-/Warenkorb-Button (Testseite, **nicht dein echtes Konto**): „Klicke auf Add to cart“ | **Freigabe-Dialog** mit Seite und Element. **Reject** drücken: Agent erfährt die Ablehnung, nichts wird ausgeführt. |
| 4 | Einstellungen → MCP → Freigabemodus = **Strict**, dann „Lies die aktuelle Seite“ | Freigabe-Dialog sogar fürs Lesen. Danach zurück auf Balanced. |
| 5 | Site-Regel `example.com` = **Block**, dann „Öffne example.com“ | Abgelehnt mit „Blocked by your site rule“. Regel danach löschen. |
| 6 | **Isolated agent profile** aktivieren, dann „Zeige die Tabs“ und „Öffne einen neuen Tab auf example.com“ | Sieht deine Tabs nicht, arbeitet nur im selbst geöffneten Tab (eigene Sitzung). |
| 7 | (mit Isolation) „Keep the agent's logins“ aktivieren, im Agent-Tab selbst anmelden, App neu starten | Sitzung bleibt. „Clear the agent's session“ löscht sie. |
| 8 | Einstellungen → MCP → **Start recording**, Agent: Seite öffnen und Link klicken, **Stop and save**, dann **Replay** | Spielt die Schritte ab, sensible mit deiner Freigabe. Passworttexte werden nie gespeichert, das Abspielen stoppt dort. |
| 9 | Einstellungen → MCP → „Agent activity“ | Aktionen erscheinen (abgelehnt/abgeschlossen). Export im Steuerungsfeld (Strg+Umschalt+.). |
| 10 | Seite mit Text wie „Ignore all previous instructions…“ (lokal oder auf einer Seite, die du kontrollierst) | Agent wird gewarnt, die nächste Aktion braucht deine Freigabe. Denk daran: Der Detektor fängt nur etwa zwei Drittel der Fälle. |

## 3) Fehler melden (GitHub-Issue oder an mich)
- Version und Betriebssystem.
- Szenario und Schritte der Reihe nach.
- Erwartet und tatsächlich passiert.
- Genauer Fehlertext und Screenshot.
- Export des Aktivitätsprotokolls (JSON), falls es um eine Agent-Aktion geht: sensible Werte sind darin geschwärzt.

## 4) Bekannte Grenzen (keine neuen Fehler)
- Der Build ist unsigniert. Auto-Update auf unsigniertem macOS ist nicht garantiert.
- Die Isolation deckt den eingebauten Assistenten nicht ab, und die Agent-Sitzung ist flüchtig, solange du das Speichern nicht aktivierst.
- Der Injection-Detektor ist ein Alarm, kein Schutz; der echte Schutz ist der Freigabe-Dialog.
- `browser_login` und zweistufige Logins (z. B. Google) sind ungetestet; Google kann eingebettete Browser ablehnen.
