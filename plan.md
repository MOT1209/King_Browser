# King Browser — خطة التحسينات / Verbesserungsplan

> الحقائق مأخوذة من مراجعة الكود (أكتوبر 2026). التقديرات والآراء موسومة بـ **[رأي]** وما لم أتحقق منه بـ **[افتراض]**.
> Fakten stammen aus der Code-Prüfung (Oktober 2026). Schätzungen und Meinungen sind mit **[Meinung]**, Ungeprüftes mit **[Annahme]** markiert.

---

# العربية

## الهدف
متصفح مفتوح المصدر يجعل وكيل برمجة (مثل OpenCode) يتحكم في متصفح حقيقي مرئي، مع بقاء الإنسان هو صاحب القرار. **ميزتك الوحيدة هي هذا التحكم**، ولذلك تأتي كل الأولويات من حمايته وإثباته.

## المرحلة 1 — أثبت الميزة الأساسية (أعلى أولوية)
- [ ] **اختبار تكامل حقيقي مع OpenCode.** سيناريو آلي يشغّل التطبيق في Electron، ويوصل OpenCode، وينقر ويكتب، ويرفض إجراءً حساساً. الاختبارات الحالية تحاكي الواجهة ولا تشغّل التطبيق، وهذا ما أخفى عيب "الأوامر لا تُنفَّذ" أصلاً. الجهد **[رأي]**: أسبوع.
- [ ] **توسيع كشف الإجراءات الحساسة.** يعتمد الآن على كلمات مفتاحية بالعربية والإنجليزية فقط (`electron/main/policyEngine.ts`). أضف الألمانية والتركية. اعرض في نافذة الموافقة لقطة للعنصر المستهدف.
- [ ] **سجل نشاط قابل للتصدير.** كل أمر وقراره (نُفّذ / رُفض / السبب).
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

---

# Deutsch

## Ziel
Ein Open-Source-Browser, in dem ein Coding-Agent (z. B. OpenCode) einen echten, sichtbaren Browser steuert, während der Mensch die Entscheidungen behält. **Dein einziger Vorteil ist diese Kontrolle**, deshalb dient jede Priorität ihrem Schutz und Nachweis.

## Phase 1 — Kernfunktion belegen (höchste Priorität)
- [ ] **Echter Integrationstest mit OpenCode.** Automatisches Szenario, das die App in Electron startet, OpenCode anbindet, klickt, tippt und eine sensible Aktion ablehnt. Die bisherigen Tests simulieren die Oberfläche statt die App zu starten, genau das hat den Fehler „Befehle werden nie ausgeführt“ verdeckt. Aufwand **[Meinung]**: eine Woche.
- [ ] **Erkennung sensibler Aktionen erweitern.** Sie beruht derzeit nur auf Schlüsselwörtern in Arabisch und Englisch (`electron/main/policyEngine.ts`). Deutsch und Türkisch ergänzen. Im Freigabe-Dialog einen Screenshot des Zielelements zeigen.
- [ ] **Exportierbares Aktivitätsprotokoll.** Jeder Befehl und seine Entscheidung (ausgeführt / abgelehnt / Grund).
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

## Empfohlene Reihenfolge
1. Phase 1 komplett. 2. Signierung und Prüfung. 3. Aufzeichnen und isolierte Profile. 4. Verkleinern und Wartung.
**Erfolgskriterium:** Ein neuer Entwickler verbindet OpenCode in unter fünf Minuten, der Agent erledigt eine echte Aufgabe, und er lehnt selbst eine sensible Aktion ab, ohne dass du eingreifst.
