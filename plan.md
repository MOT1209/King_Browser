# King Browser — خطة التحسينات / Verbesserungsplan

> الحقائق مأخوذة من مراجعة الكود (أكتوبر 2026). التقديرات والآراء موسومة بـ **[رأي]** وما لم أتحقق منه بـ **[افتراض]**.
> Fakten stammen aus der Code-Prüfung (Oktober 2026). Schätzungen und Meinungen sind mit **[Meinung]**, Ungeprüftes mit **[Annahme]** markiert.

---

# العربية

## الهدف
متصفح مفتوح المصدر يجعل وكيل برمجة (مثل OpenCode) يتحكم في متصفح حقيقي مرئي، مع بقاء الإنسان هو صاحب القرار. **ميزتك الوحيدة هي هذا التحكم**، ولذلك تأتي كل الأولويات من حمايته وإثباته.

## المرحلة 1 — أثبت الميزة الأساسية (أعلى أولوية)
- [ ] **اختبار تكامل حقيقي مع OpenCode.** ✅ بدأ: `npm run test:integration` يشغّل التطبيق فعلاً في Electron (شاشة افتراضية)، يشغّل خادم MCP من واجهة الإعدادات كالمستخدم، ويتحقق من المصادقة وحظر التنقل إلى عناوين محلية. ⏳ المتبقي: النقر على صفحة حقيقية وموافقة/رفض إجراء حساس. حارس الوكيل يمنع الصفحات المحلية (وهذا صحيح)، والبيئة هنا بلا إنترنت، فيلزم صفحة عامة أو مُحلِّل أسماء قابل للحقن. لم أجرّب OpenCode نفسه بعد. سيناريو آلي يشغّل التطبيق في Electron، ويوصل OpenCode، وينقر ويكتب، ويرفض إجراءً حساساً. الاختبارات الحالية تحاكي الواجهة ولا تشغّل التطبيق، وهذا ما أخفى عيب "الأوامر لا تُنفَّذ" أصلاً. الجهد **[رأي]**: أسبوع.
- [ ] **توسيع كشف الإجراءات الحساسة.** ✅ أُضيفت الألمانية والتركية في `electron/main/policyEngine.ts` مع اختبار. ⏳ المتبقي: عرض لقطة للعنصر المستهدف في نافذة الموافقة.
- [ ] **سجل نشاط قابل للتصدير.** كل أمر وقراره (نُفّذ / رُفض / السبب). ✅ التصدير JSON/CSV جاهز في `electron/main/activityLog.ts` وقناة IPC باسم `mcp-engine-export-log`. ⏳ المتبقي: زر في لوحة التحكم، والسجل في الذاكرة فقط ويضيع عند إعادة التشغيل.
- [x] **مؤشر الوكيل المرئي وشريط نشاط حي، وتسجيل الدخول بحساب محفوظ (`browser_login`) بموافقة نعم/لا.** المؤشر يتحرك إلى العنصر قبل الإجراء ويُخفي النص الحساس؛ الشريط يعرض آخر 6 إجراءات؛ كلمة المرور يملؤها المتصفح ولا تصل للوكيل، وتُثبَّت الموافقة على أصل الصفحة. ⏳ غير مجرَّب على موقع حقيقي (لا إنترنت هنا). صفحات الدخول على خطوتين (Google) غير مدعومة بعد، وقد يحظر Google الدخول الآلي **[افتراض]**.
- [ ] **قواعد موافقة لكل موقع.** "اسمح دائماً على موقعي، اسأل دائماً على المصارف".
- [ ] **قرار:** هل تحتاج أدوات قراءة الصفحة واللقطات موافقة في كل مرة؟ حالياً تعمل بلا موافقة بعد تفعيلها في الإعدادات.

## المرحلة 2 — الأمان والثقة
- [ ] **مواجهة حقن الأوامر (prompt injection).** الصفحات تستطيع أن تكتب تعليمات للوكيل. حذّر عند نص مشبوه، وامنع الانتقال إلى نطاق جديد بعد قراءة محتوى لم يطلبه المستخدم.
- [ ] **توقيع الكود** (يحتاج شهادات مدفوعة منك): macOS حساب Apple Developer (~99$ سنوياً)، وWindows شهادة OV أو Azure Trusted Signing. الـ workflow جاهز في `.github/workflows/release.yml` ويكفي إضافة الأسرار.
- [ ] **تدقيق خارجي** لطبقة MCP ولمزامنة E2EE. لا تروّج "تشفير طرف لطرف" قبل مراجعة مستقلة.
- [ ] **سياسة تحديثات Electron.** تحديثات أمان Chromium تصدر كل بضعة أسابيع، وهي التزام دائم.

## المرحلة 3 — التمايز
- [ ] **التسجيل والإعادة.** سجّل ما فعله الوكيل وأعد تشغيله بلا نموذج ذكاء اصطناعي.
- [ ] **ملفات تعريف معزولة لكل وكيل.** جلسة وكوكيز منفصلة، فلا يصل الوكيل إلى حساباتك الشخصية.
- [ ] **إعداد OpenCode بسطر واحد.** أمر يكتب `opencode.json` تلقائياً.

## المرحلة 4 — تقليص الأسطح (تجنّب الإفراط في الهندسة)
- لا تضف مزيداً من ميزات "المتصفح العادي". موروثة من Nova: المزامنة، الـ VPN، الإضافات، القارئ، الترجمة.
- **[رأي] فكّر في تعطيل أو حذف:** الـ VPN، والمساعد المحلي بنماذج WebGPU إن لم يكونا جزءاً من قصتك. كل واحد سطح هجوم وصيانة.
- لا تنافس Chrome في السرعة.

## المرحلة 5 — الصيانة التقنية
- [ ] تقسيم `electron/main.ts` (6800+ سطر) تدريجياً عند لمس أجزاء منه، لا دفعة واحدة.
- [ ] اختبار Windows وmacOS في CI (الحالي Linux فقط).
- [ ] نقل الفيديو والصوت الثقيل إلى LFS أو CDN (المستودع 44MB).
- [ ] تسجيل صوتي جديد لفيديو الموقع (الحالي يقول "Nova") ثم إعادة الترجمات.
- [ ] نطاق (دومين) للموقع ثم إضافة canonical وsitemap.
- [ ] تخفيض تحذيرات ESLint (1081 تحذيراً، أغلبها `any` ومتغيرات غير مستخدمة).

## تقييم السوق
- **المنافسة [حقيقة جزئية]:** Playwright MCP وChrome DevTools MCP مجانيان ولا يحتاجان متصفحاً جديداً، وأدوات أخرى مثل BrowserOS.
- **الطلب [افتراض]:** شريحة صغيرة من مطوري الوكلاء. لم أتحقق من حجمها.
- **الإيراد [رأي]:** غير واضح. لا تفكر في الربح قبل وجود مستخدمين فعليين. تذكّر أن Vercel Hobby (المستخدم للموقع) غير تجاري.
- **ما لا أعرفه:** هل يفضّل المستخدمون متصفحاً مستقلاً على حل MCP خفيف.

## ترتيب التنفيذ المقترح
1. المرحلة 1 كاملة. 2. التوقيع والتدقيق. 3. التسجيل والملفات المعزولة. 4. التقليص والصيانة.
**معيار النجاح:** مطوّر جديد يوصل OpenCode بأقل من خمس دقائق، وينفّذ الوكيل مهمة حقيقية، ويرفض هو إجراءً حساساً، بلا أي تدخل منك.

## حالة مراجعة الاعتماد والمزامنة (أكتوبر 2026) — [منفَّذ ومختبر] / [يحتاج بيئة خارجية]
- [منفَّذ ومختبر] حارس الحساب المتعدد في `initSupabaseListener` (`src/services/syncService.ts`): جلسة `INITIAL_SESSION` قديمة تخص حساباً آخر لا تُعتمد بعد الآن ولا تُكتب مفتاح المزامنة في خانة حساب مغاير. مغطاة باختبارات سلوك حقيقية (`tests/king_cloud_auth_behaviour.test.ts`، 61 فحصاً).
- [منفَّذ ومختبر] تكامل الاختبارات: بقية الأجنحة خضراء في تشغيلين كاملين متتاليين لـ `npm test` (منها 32 فحص اعتماد، 78 فحص صحة مزامنة، 11 فحص لوحة الوكيل، 17 فحص لوح المقص/Q).
- [منفَّذ ومختبر] مراجعة `supabase_schema.sql`: سياسات RLS سليمة (قبو المستخدم، الدعوات، دالة الاستهلاك security definer). ملاحظة واحدة: العمود `consumed_by` بلا `on delete`، فحذف مستخدم استهلك دعوة سيفشل — لكن ميزة الإقران معطّلة اليوم (`PAIRING_AVAILABLE = false`)، فلا أثر فعلياً.
- [يحتاج بيئة خارجية] تحقق حي على Supabase حقيقي بحسابين حقيقيين وسياسات RLS الفعلية: لا يوجد مشروع اختبار متاح من هذه البيئة.
- [يحتاج بيئة خارجية] Workflow الليلي في PR #15 (مدموج في main): ترتيب «حذف ثم رفع» يجعل أي فشل في الروفع يترك بدون نسخة ليلية؛ محلول بمقترح في تقرير المراجعة — لا يُطبَّق هنا.

---

# Deutsch

## Ziel
Ein Open-Source-Browser, in dem ein Coding-Agent (z. B. OpenCode) einen echten, sichtbaren Browser steuert, während der Mensch die Entscheidungen behält. **Dein einziger Vorteil ist diese Kontrolle**, deshalb dient jede Priorität ihrem Schutz und Nachweis.

## Phase 1 — Kernfunktion belegen (höchste Priorität)
- [ ] **Echter Integrationstest mit OpenCode.** ✅ Gestartet: `npm run test:integration` startet die App wirklich in Electron (virtuelles Display), startet den MCP-Server über die Einstellungen wie ein Nutzer und prüft Authentifizierung sowie die Sperre für lokale Adressen. ⏳ Offen: Klick auf eine echte Seite und Freigabe/Ablehnung einer sensiblen Aktion. Der Agent-Guard blockiert lokale Seiten (zu Recht), und hier gibt es kein Internet; nötig ist eine öffentliche Seite oder ein injizierbarer Resolver. OpenCode selbst habe ich noch nicht getestet. Automatisches Szenario, das die App in Electron startet, OpenCode anbindet, klickt, tippt und eine sensible Aktion ablehnt. Die bisherigen Tests simulieren die Oberfläche statt die App zu starten, genau das hat den Fehler „Befehle werden nie ausgeführt“ verdeckt. Aufwand **[Meinung]**: eine Woche.
- [ ] **Erkennung sensibler Aktionen erweitern.** ✅ Deutsch und Türkisch in `electron/main/policyEngine.ts` ergänzt, mit Test. ⏳ Offen: Screenshot des Zielelements im Freigabe-Dialog.
- [ ] **Exportierbares Aktivitätsprotokoll.** Jeder Befehl und seine Entscheidung (ausgeführt / abgelehnt / Grund). ✅ JSON/CSV-Export in `electron/main/activityLog.ts` und IPC-Kanal `mcp-engine-export-log`. ⏳ Offen: Button in der Steuerung; das Protokoll liegt nur im Speicher und geht beim Neustart verloren.
- [x] **Sichtbarer Agent-Zeiger, Live-Aktivitätsleiste und Login mit gespeichertem Konto (`browser_login`) mit Ja/Nein-Freigabe.** Der Zeiger fährt vor der Aktion zum Element und maskiert sensible Texte; die Leiste zeigt die letzten 6 Aktionen; das Passwort trägt der Browser ein und der Agent sieht es nie; die Freigabe ist an den Seitenursprung gebunden. ⏳ Nicht an einer echten Seite getestet (hier kein Internet). Zweistufige Logins (Google) werden noch nicht unterstützt, und Google kann automatische Logins blockieren **[Annahme]**.
- [ ] **Regeln pro Website.** „Auf meiner Seite immer erlauben, bei Banken immer fragen.“
- [ ] **Entscheidung:** Sollen Seitenlese- und Screenshot-Tools jedes Mal eine Freigabe brauchen? Aktuell laufen sie nach Aktivierung in den Einstellungen ohne Freigabe.

## Phase 2 — Sicherheit und Vertrauen
- [ ] **Schutz vor Prompt-Injection.** Webseiten können Anweisungen für den Agenten einschleusen. Bei verdächtigem Text warnen und einen Wechsel auf eine neue Domain nach dem Lesen ungeforderter Inhalte verhindern.
- [ ] **Code-Signierung** (kostenpflichtige Zertifikate von dir): macOS Apple-Developer-Konto (~99 $/Jahr), Windows OV-Zertifikat oder Azure Trusted Signing. Der Workflow liegt in `.github/workflows/release.yml`, es fehlen nur die Secrets.
- [ ] **Externe Prüfung** der MCP-Schicht und der E2EE-Synchronisierung. Nicht mit „Ende-zu-Ende-Verschlüsselung“ werben, bevor eine unabhängige Prüfung stattgefunden hat.
- [ ] **Electron-Update-Politik.** Chromium-Sicherheitsupdates erscheinen alle paar Wochen, das ist eine dauerhafte Verpflichtung.

## Phase 3 — Abgrenzung
- [ ] **Aufzeichnen und Abspielen.** Aktionen des Agenten aufzeichnen und ohne KI-Modell erneut abspielen.
- [ ] **Isolierte Profile pro Agent.** Eigene Sitzung und Cookies, damit der Agent nicht an private Konten kommt.
- [ ] **Ein-Zeilen-Einrichtung für OpenCode.** Ein Befehl schreibt `opencode.json` automatisch.

## Phase 4 — Angriffsfläche verkleinern (Überentwicklung vermeiden)
- Keine weiteren „normalen Browser“-Funktionen. Von Nova geerbt: Sync, VPN, Erweiterungen, Reader, Übersetzung.
- **[Meinung] Deaktivieren oder entfernen prüfen:** VPN und den lokalen WebGPU-Assistenten, wenn sie nicht zu deiner Geschichte gehören. Beide sind Angriffs- und Wartungsfläche.
- Nicht mit Chrome bei der Geschwindigkeit konkurrieren.

## Phase 5 — Technische Wartung
- [ ] `electron/main.ts` (6800+ Zeilen) schrittweise aufteilen, wenn ohnehin Teile angefasst werden, nicht in einem Zug.
- [ ] Windows und macOS im CI testen (aktuell nur Linux).
- [ ] Schwere Videos und Audio nach LFS oder CDN auslagern (Repository 44 MB).
- [ ] Neue Tonspur für das Website-Video (aktuell „Nova“), danach Untertitel anpassen.
- [ ] Domain für die Website, danach canonical und Sitemap ergänzen.
- [ ] ESLint-Warnungen reduzieren (1081, meist `any` und ungenutzte Variablen).

## Markteinschätzung
- **Konkurrenz [teilweise Fakt]:** Playwright MCP und Chrome DevTools MCP sind kostenlos und brauchen keinen neuen Browser, dazu Tools wie BrowserOS.
- **Nachfrage [Annahme]:** kleine Gruppe von Agent-Entwicklern, Größe nicht geprüft.
- **Einnahmen [Meinung]:** unklar. Erst über Geld nachdenken, wenn es echte Nutzer gibt. Vercel Hobby (für die Website) ist nicht kommerziell.
- **Was ich nicht weiß:** ob Nutzer einen eigenen Browser einer schlanken MCP-Lösung vorziehen.

## Stand der Auth- und Sync-Prüfung (Oktober 2026) — [umgesetzt und getestet] / [benötigt externe Umgebung]
- [umgesetzt und getestet] Kontenwachschutz in `initSupabaseListener` (`src/services/syncService.ts`): eine ältere `INITIAL_SESSION` eines fremden Kontos wird nicht mehr adoptiert und deren Sync-Schlüssel nicht mehr in den Vault-Slot des falschen Kontos geschrieben. Abgedeckt durch echte Verhaltenstests (`tests/king_cloud_auth_behaviour.test.ts`, 61 Prüfpunkte).
- [umgesetzt und getestet] Suite-Integration: alle übrigen Suites sind in zwei aufeinanderfolgenden vollständigen `npm test`-Läufen grün (u. a. 32 Auth-Prüfpunkte, 78 Sync-Richtigkeit, 11 Agent-Panel, 17 Clipboard/QR).
- [umgesetzt und getestet] Prüfung von `supabase_schema.sql`: RLS-Richtlinien in Ordnung (Benutzer-Vault, Einladungen, security-definer-RPC). Ein Befund: `consumed_by` hat kein `on delete`, das Löschen eines Benutzers, der eine Einladung verbraucht hat, würde fehlschlagen — das Pairing-Feature ist aber derzeit deaktiviert (`PAIRING_AVAILABLE = false`), keine praktische Auswirkung.
- [benötigt externe Umgebung] Live-Verifikation auf echtem Supabase mit zwei echten Konten und den tatsächlichen RLS-Richtlinien: in dieser Umgebung kein Testprojekt verfügbar.
- [benötigt externe Umgebung] Der Nightly-Workflow aus PR #15 (bereits in main gemerged): die Reihenfolge „löschen vor hochladen“ lässt das Nightly-Release wegfallen, wenn der Upload fehlschlägt; Korrekturvorschlag steht im Abschlussbericht und wird hier nicht angewendet.
