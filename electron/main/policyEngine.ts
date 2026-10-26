/**
 * King Browser — Human Approval Policy Engine (§12 of the Master Prompt).
 *
 * Deterministic risk classification for agent actions. Given a tool call and
 * the page context at submission time, it decides:
 *   - safe      → may run automatically (when the engine is in auto-run)
 *   - sensitive → requires explicit human approval before execution
 *
 * §12 approval triggers implemented:
 *   send, purchase, delete, security_settings, publish, share_private,
 *   grant_permission, dangerous_download, plus sensitive_input and
 *   consequential_form for concrete form submissions, and `login` for the
 *   agent signing in with a saved account.
 *
 * Also provides:
 *   - domain extraction for the approval screen ("website domain")
 *   - argument redaction (§13: passwords and sensitive input never appear in
 *     approvals, run history, or logs)
 *   - approval summary assembly ("intended action, affected resource,
 *     consequences, uncertainty")
 *
 * Classification is heuristic by nature: the engine therefore defaults to
 * `sensitive` whenever a tool is unknown or a destination is ambiguous. False
 * positives only cost one approval tap; false negatives cost money or data.
 *
 * Dependency-free (no Electron imports).
 */

export type RiskLevel = 'safe' | 'sensitive';

export type ApprovalTrigger =
  | 'send'
  | 'purchase'
  | 'delete'
  | 'security_settings'
  | 'publish'
  | 'share_private'
  | 'grant_permission'
  | 'dangerous_download'
  | 'sensitive_input'
  | 'consequential_form'
  | 'arbitrary_code'
  | 'login'
  | 'site_rule'
  | 'prompt_injection'
  | 'strict_mode';

export interface PolicyInput {
  toolName: string;
  args: Record<string, unknown>;
  currentUrl?: string;
  pageTitle?: string;
  elementText?: string;
  /**
   * Set when the page URL or target element could not be read. Acting tools
   * are then classified `sensitive`: the heuristics below need that context.
   */
  contextUnavailable?: boolean;
}

export interface PolicyDecision {
  risk: RiskLevel;
  triggers: ApprovalTrigger[];
  reasons: string[];
  domain?: string;
  redactedArgs: Record<string, unknown>;
}

export interface ApprovalSummary {
  domain: string;
  intendedAction: string;
  affectedResource?: string;
  /** The page the action lands on (query string dropped so tokens in URLs are not shown). */
  pageUrl?: string;
  /** What the target element says about itself (label, text, type), shortened to one line. */
  targetText?: string;
  details: Record<string, unknown>;
  consequences: string[];
  uncertainty: string[];
}

const READ_ONLY_TOOLS = new Set([
  'browser_status',
  'king_browser_info',
  'browser_read_page',
  'browser_snapshot',
  'browser_screenshot',
  'browser_get_url',
  'browser_get_element_text',
  'browser_list_tabs',
  'browser_find_element',
  'browser_console_messages',
  'browser_element_screenshot'
]);

const PASSIVE_ACTION_TOOLS = new Set([
  'browser_scroll',
  'browser_scroll_to_element',
  'browser_wait',
  'browser_wait_for',
  'browser_hover',
  'browser_focus',
  'browser_zoom',
  'browser_mute_tab',
  'browser_pin_tab',
  'browser_duplicate_tab',
  'browser_new_tab',
  'browser_close_tab',
  'browser_switch_tab'
]);

const ENGINE_CONTROL_TOOLS = new Set([
  'browser_request_approval',
  'browser_next_step',
  'browser_next_phase',
  'browser_pause',
  'browser_resume',
  'browser_stop'
]);

// Same pattern as src/utils/sensitiveField.ts (the cursor overlay masks with it).
// Duplicated on purpose: this module must stay import-free; a test pins them equal.
export const SENSITIVE_SELECTOR_PATTERNS = /pass(word|wd|phrase)?|passwd|\bpwd\b|\bpin\b|cvv|cvc|card.?number|credit.?card|cc.?number|ssn|social.?security|secret|token|api.?key|recovery|otp|one.?time|verification.?code|mfa|2fa/i;

const REDACTED_VALUE = '••••••••';

const PURCHASE_TEXT = /(buy|purchase|pay\b|payment|checkout|place order|complete order|subscribe|donate|upgrade to|add to cart|شراء|اشتر|ادفع|الدفع|دفع|تبرع|اكمل الطلب|إتمام الطلب|اشترك)/i;
const SEND_TEXT = /(\bsend\b|send now|submit (application|comment|reply|message)|post comment|post reply|dm |direct message|أرسل|إرسال|ارسال|انشر التعليق|رد)/i;
const DELETE_TEXT = /(delete|remove|trash|unsubscribe|deactivate|close account|cancel subscription|حذف|احذف|إزالة|الغاء الاشتراك|الغاء حسابي|إلغاء الحساب|إلغاء الاشتراك)/i;
const SECURITY_TEXT = /(change password|two.?factor|2fa|recovery (email|phone|key)|security (settings|key)|revoke access|sign out of all|enable 2|disable 2|تعيين كلمة المرور|تغيير كلمة المرور|التحقق بخطوتين|إعدادات الأمان)/i;
const PUBLISH_TEXT = /(publish|post\b|tweet|share publicly|make public|new post|نشر|انشر|تغريدة|منشور جديد)/i;
const SHARE_PRIVATE_TEXT = /(share\b|share with|invite|send file|attach|forward|مشاركة|شارك|دعوة)/i;
const PERMISSION_TEXT = /(allow|grant|authorize|authorise|permit|accept permissions|give access|السماح|اسمح|منح|تصريح|تفويض)/i;
const DOWNLOAD_TEXT = /(download|install|save file|run installer|تحميل|نزّل|تثبيت)/i;

// German and Turkish keywords. Kept apart from the Arabic/English patterns
// above because `\b` is ASCII-only: these use a Unicode-aware start boundary
// (stems may take suffixes) and `[iİıI]` because the `i` flag does not fold the
// Turkish dotted capital İ.
const i18n = (stems: string): RegExp => new RegExp(`(?<![\\p{L}])(?:${stems})`, 'iu');
const PURCHASE_TEXT_I18N = i18n('kaufen|jetzt kaufen|bezahl|zahlung|zur kasse|kasse|bestellung abschlie|zahlungspflichtig|kostenpflichtig|spend|abonnier|satın al|öde|ödeme|sipariş|siparişi tamamla|bağış|abone ol');
const SEND_TEXT_I18N = i18n('senden|absenden|abschicken|nachricht senden|antworten|gönder|yanıtla|mesaj gönder');
const DELETE_TEXT_I18N = i18n('lösch|entfern|konto schlie|konto deaktiv|abo kündigen|kündig|s[iİıI]l(?![\\p{L}])|kald[iİıI]r|hesab[iİıI] kapat|hesab[iİıI] sil|abonel[iİıI]ği [iİıI]ptal|[iİıI]ptal et');
const SECURITY_TEXT_I18N = i18n('passwort (ändern|zurücksetzen)|kennwort ändern|zwei.?faktor|sicherheitseinstellung|wiederherstellung|zugriff widerrufen|abmelden von allen|şifre(yi)? değiştir|parola(y[iİıI])? değiştir|[iİıI]ki ad[iİıI]ml[iİıI]|güvenlik ayarlar|kurtarma');
const PUBLISH_TEXT_I18N = i18n('veröffentlich|posten|öffentlich teilen|yay[iİıI]nla|gönderi paylaş|herkese açık');
const SHARE_PRIVATE_TEXT_I18N = i18n('teilen|einladen|weiterleiten|anhängen|paylaş|davet et|ilet(?![\\p{L}])|ekle(?![\\p{L}])');
const PERMISSION_TEXT_I18N = i18n('erlauben|zulassen|zugriff gewähren|berechtigung|autorisieren|izin ver|eri[sş]im ver|yetkilendir|[iİıI]zin');
const DOWNLOAD_TEXT_I18N = i18n('herunterladen|download|installieren|[iİıI]ndir|yükle(?![\\p{L}])|kur(?![\\p{L}])');

function matchesAny(text: string, ...patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
}

const PURCHASE_URL = /(checkout|\/pay(ment|ments)?\b|billing|\/purchase|\/cart|\/order|donat)/i;
const SECURITY_URL = /(settings\/(security|privacy|password)|account\/security|\/recovery|two.?factor|2fa|\/permissions)/i;
const DELETE_URL = /(delete|remove|deactivate|close.?account|unsubscribe)/i;
const COMPOSE_URL = /(compose|new.?message|\/new\b|mail\.|messages|\/chat\b|whatsapp|telegram)/i;
const PUBLISH_URL = /(compose.?post|\/compose|\/new\/(post|tweet)|\/status\/new|create.?post)/i;
const PAYMENT_HOSTS = /(^|\.)(paypal|stripe|square|braintree|adyen|checkout)\.com$|^(pay|checkout|billing)\./i;

const DANGEROUS_URL_SCHEME = /^(javascript|data|vbscript|blob):/i;
const DANGEROUS_FILE_URL = /\.(exe|msi|dmg|pkg|deb|rpm|apk|bat|cmd|ps1|scr|vbs|jar)(\?|#|$)/i;

const SENSITIVE_ARG_KEYS = /pass(word)?|secret|token|otp|code|cvv|cvc|card|ssn|api.?key|recovery/i;

export function extractDomain(url: string | undefined): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname) return undefined;
    return parsed.hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

export function redactArgs(
  toolName: string,
  args: Record<string, unknown>,
  fieldDescription = ''
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (SENSITIVE_ARG_KEYS.test(key)) {
      out[key] = REDACTED_VALUE;
      continue;
    }
    if (toolName === 'browser_run_js' && key === 'script' && typeof value === 'string') {
      out[key] = `${REDACTED_VALUE} (script omitted, ${value.length} chars)`;
      continue;
    }
    if (toolName === 'browser_type' && key === 'text' && typeof value === 'string') {
      const selector = typeof args.selector === 'string' ? args.selector : '';
      // A password input addressed by a neutral selector ("#f1") only reveals
      // itself through its description (type, autocomplete, label). Testing
      // the selector alone let the typed secret reach the approval screen and
      // the run history even though the action was classified sensitive.
      const sensitive = SENSITIVE_SELECTOR_PATTERNS.test(selector) ||
        SENSITIVE_SELECTOR_PATTERNS.test(fieldDescription);
      out[key] = sensitive ? REDACTED_VALUE : value;
      continue;
    }
    out[key] = value;
  }
  return out;
}

/**
 * Redaction for the persisted/exported activity log. Unlike the approval path,
 * the log has no element description, so it cannot tell a neutral selector
 * ("#f1") or an opaque snapshot ref ("[data-king-ref=\"e12\"]") from a password
 * field. Fail closed: the log keeps the target and the action, never the typed
 * value. The policy decision still uses redactArgs with the live description.
 */
export function redactArgsForLog(
  toolName: string,
  args: Record<string, unknown>
): Record<string, unknown> {
  const redacted = redactArgs(toolName, args);
  if (toolName === 'browser_type' && typeof args.text === 'string' && args.text.length > 0) {
    redacted.text = REDACTED_VALUE;
  }
  return redacted;
}

interface ClassificationContext {
  triggers: ApprovalTrigger[];
  reasons: string[];
}

function addTrigger(context: ClassificationContext, trigger: ApprovalTrigger, reason: string): void {
  if (!context.triggers.includes(trigger)) context.triggers.push(trigger);
  context.reasons.push(reason);
}

function classifyUrlContext(url: string | undefined, toolName: string, context: ClassificationContext): void {
  if (!url) return;
  if (DANGEROUS_URL_SCHEME.test(url)) {
    addTrigger(context, 'dangerous_download', `Target URL uses a dangerous scheme (${url.split(':')[0]}).`);
    return;
  }
  const domain = extractDomain(url);
  const path = (() => {
    try { return new URL(url).pathname + new URL(url).search; } catch { return url; }
  })();

  if (PAYMENT_HOSTS.test(domain ?? '') || PURCHASE_URL.test(path)) {
    if (toolName === 'browser_click' || toolName === 'browser_type' || toolName === 'browser_select_option' || toolName === 'browser_press_key') {
      addTrigger(context, 'purchase', `The current page appears to be a payment/checkout surface (${domain ?? 'unknown host'}).`);
    }
  }
  if (SECURITY_URL.test(path)) {
    if (toolName === 'browser_click' || toolName === 'browser_type' || toolName === 'browser_select_option') {
      addTrigger(context, 'security_settings', 'The current page is a security/recovery settings surface.');
    }
  }
  if (DELETE_URL.test(path) && toolName === 'browser_click') {
    addTrigger(context, 'delete', 'The current page is a delete/deactivation flow.');
  }
  if (PUBLISH_URL.test(path) && (toolName === 'browser_click' || toolName === 'browser_type')) {
    addTrigger(context, 'publish', 'The current page is a content composition flow.');
  } else if (COMPOSE_URL.test(path) && (toolName === 'browser_click' || toolName === 'browser_type')) {
    addTrigger(context, 'send', 'The current page is a messaging/email composition surface.');
  }
}

function classifyActingTool(input: PolicyInput, context: ClassificationContext): void {
  const { toolName, args } = input;
  const selector = typeof args.selector === 'string' ? args.selector : '';
  const text = `${typeof args.text === 'string' ? args.text : ''} ${input.elementText ?? ''} ${selector}`.trim();

  if (toolName === 'browser_type') {
    // elementText describes the field itself (type, name, autocomplete, label),
    // which catches password inputs addressed by a neutral selector.
    if (SENSITIVE_SELECTOR_PATTERNS.test(selector) || SENSITIVE_SELECTOR_PATTERNS.test(input.elementText ?? '')) {
      addTrigger(context, 'sensitive_input', `Typing into a field that looks sensitive (${selector.slice(0, 80)}).`);
    }
    if (PERMISSION_TEXT.test(text) || PERMISSION_TEXT.test(selector)) {
      addTrigger(context, 'grant_permission', 'Typing near what looks like a permission grant.');
    }
    return;
  }

  if (toolName === 'browser_click') {
    if (matchesAny(text, PURCHASE_TEXT, PURCHASE_TEXT_I18N)) addTrigger(context, 'purchase', `Button/link text suggests a purchase ("${text.slice(0, 60)}").`);
    if (matchesAny(text, DELETE_TEXT, DELETE_TEXT_I18N)) addTrigger(context, 'delete', `Button/link text suggests deletion ("${text.slice(0, 60)}").`);
    if (matchesAny(text, SECURITY_TEXT, SECURITY_TEXT_I18N)) addTrigger(context, 'security_settings', `Button/link text suggests a security change ("${text.slice(0, 60)}").`);
    if (matchesAny(text, PUBLISH_TEXT, PUBLISH_TEXT_I18N)) addTrigger(context, 'publish', `Button/link text suggests publishing ("${text.slice(0, 60)}").`);
    else if (matchesAny(text, SEND_TEXT, SEND_TEXT_I18N)) addTrigger(context, 'send', `Button/link text suggests sending ("${text.slice(0, 60)}").`);
    if (matchesAny(text, SHARE_PRIVATE_TEXT, SHARE_PRIVATE_TEXT_I18N)) addTrigger(context, 'share_private', `Button/link text suggests sharing ("${text.slice(0, 60)}").`);
    if (matchesAny(text, PERMISSION_TEXT, PERMISSION_TEXT_I18N)) addTrigger(context, 'grant_permission', `Button/link text suggests granting access ("${text.slice(0, 60)}").`);
    if (matchesAny(text, DOWNLOAD_TEXT, DOWNLOAD_TEXT_I18N)) addTrigger(context, 'dangerous_download', `Button/link text suggests a download ("${text.slice(0, 60)}").`);

    const href = typeof args.url === 'string' ? args.url : '';
    if (href && DANGEROUS_FILE_URL.test(href)) {
      addTrigger(context, 'dangerous_download', `Target file looks executable (${href.split('/').pop()?.slice(0, 60)}).`);
    }
    return;
  }

  if (toolName === 'browser_select_option') {
    if (matchesAny(text, PURCHASE_TEXT, PURCHASE_TEXT_I18N) || matchesAny(selector, PURCHASE_TEXT, PURCHASE_TEXT_I18N)) {
      addTrigger(context, 'purchase', 'Selecting an option inside what looks like a purchase flow.');
    }
    return;
  }

  if (toolName === 'browser_press_key') {
    return; // context-only escalation happens in classifyUrlContext
  }
}

/**
 * Classify one action. Unknown tools are conservatively `sensitive`; the
 * explicit allowlist in the MCP layer rejects unregistered tools outright.
 */
export function classifyAction(input: PolicyInput): PolicyDecision {
  const context: ClassificationContext = { triggers: [], reasons: [] };
  const { toolName, args } = input;

  const domain = extractDomain(typeof args.url === 'string' ? args.url : input.currentUrl);
  const redactedArgs = redactArgs(toolName, args, input.elementText ?? '');

  if (ENGINE_CONTROL_TOOLS.has(toolName)) {
    return { risk: 'safe', triggers: [], reasons: ['Engine control command.'], domain, redactedArgs };
  }

  if (READ_ONLY_TOOLS.has(toolName) || PASSIVE_ACTION_TOOLS.has(toolName)) {
    const navUrl = typeof args.url === 'string' ? args.url : undefined;
    if (navUrl && (DANGEROUS_URL_SCHEME.test(navUrl) || DANGEROUS_FILE_URL.test(navUrl))) {
      addTrigger(context, 'dangerous_download', 'Navigation targets a direct executable download.');
    } else {
      return { risk: 'safe', triggers: [], reasons: ['Read-only or passive action.'], domain, redactedArgs };
    }
  } else if (toolName === 'browser_navigate' || toolName === 'browser_open') {
    const navUrl = typeof args.url === 'string' ? args.url : undefined;
    if (navUrl && (DANGEROUS_URL_SCHEME.test(navUrl) || DANGEROUS_FILE_URL.test(navUrl))) {
      addTrigger(context, 'dangerous_download', 'Navigation targets a direct executable download.');
    } else {
      return { risk: 'safe', triggers: [], reasons: ['Navigation is not an approval trigger by itself.'], domain, redactedArgs };
    }
  } else if (toolName === 'browser_run_js') {
    addTrigger(context, 'arbitrary_code', 'Executing arbitrary JavaScript in the page context.');
  } else if (toolName === 'browser_login') {
    addTrigger(context, 'login', 'Signing in to this site with a saved account.');
  } else if (toolName === 'browser_go_back' || toolName === 'browser_go_forward' || toolName === 'browser_reload') {
    return { risk: 'safe', triggers: [], reasons: ['History control is not an approval trigger.'], domain, redactedArgs };
  } else {
    if (
      toolName === 'browser_click' || toolName === 'browser_type' ||
      toolName === 'browser_select_option' || toolName === 'browser_press_key'
    ) {
      if (input.contextUnavailable) {
        addTrigger(context, 'consequential_form', 'The page or target element could not be inspected, so the action cannot be checked automatically.');
      }
      classifyActingTool(input, context);
      classifyUrlContext(input.currentUrl, toolName, context);
    } else {
      addTrigger(context, 'consequential_form', `Tool "${toolName}" is not in the known-safe set and needs review.`);
    }
  }

  if (context.triggers.length === 0) {
    return { risk: 'safe', triggers: [], reasons: ['No approval trigger matched.'], domain, redactedArgs };
  }
  return { risk: 'sensitive', triggers: context.triggers, reasons: context.reasons, domain, redactedArgs };
}

const TRIGGER_CONSEQUENCES: Record<ApprovalTrigger, string> = {
  send: 'This sends an email, message, comment, or other communication that cannot be unsent.',
  purchase: 'This completes a purchase, payment, or subscription involving money.',
  delete: 'This deletes accounts, content, files, or data and may be irreversible.',
  security_settings: 'This changes security settings, recovery information, or permissions.',
  publish: 'This publishes content where other people or services can see it.',
  share_private: 'This shares information with another person or service.',
  grant_permission: 'This grants new permissions or access to an account or resource.',
  dangerous_download: 'This downloads or executes a potentially dangerous file.',
  sensitive_input: 'This enters sensitive information such as a password, card number, or secret.',
  consequential_form: 'This submits a form or performs an action with lasting consequences.',
  arbitrary_code: 'This executes arbitrary code inside the page with full page privileges.',
  login: 'This signs in to the site with a saved account. The password is filled by the browser and is never shown to the agent.',
  site_rule: 'You marked this site as "always ask", so every agent action on it needs your approval.',
  strict_mode: 'Strict approval mode is on: every agent action needs your approval.',
  prompt_injection: 'A page the agent read contains text that looks like instructions aimed at AI agents. Check that this action is what you asked for, not something the page told the agent to do.'
};

const TRIGGER_LABELS: Record<ApprovalTrigger, string> = {
  send: 'Send a communication',
  purchase: 'Make a purchase or payment',
  delete: 'Delete data',
  security_settings: 'Change security settings',
  publish: 'Publish content',
  share_private: 'Share private information',
  grant_permission: 'Grant new permissions',
  dangerous_download: 'Download or execute a file',
  sensitive_input: 'Enter sensitive information',
  consequential_form: 'Consequential form submission',
  arbitrary_code: 'Execute arbitrary code',
  login: 'Sign in with a saved account',
  site_rule: 'Action on a site you marked "always ask"',
  prompt_injection: 'Action after suspicious page text',
  strict_mode: 'Action in strict approval mode'
};

function describePageUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    return `${parsed.origin}${parsed.pathname}`.slice(0, 160);
  } catch {
    return undefined;
  }
}

function describeTargetText(text: string | undefined): string | undefined {
  if (!text) return undefined;
  const oneLine = text.replace(/\s+/g, ' ').trim();
  return oneLine ? oneLine.slice(0, 120) : undefined;
}

export function buildApprovalSummary(input: PolicyInput, decision: PolicyDecision): ApprovalSummary {
  const domain = decision.domain ?? extractDomain(input.currentUrl) ?? 'unknown site';
  const primary = decision.triggers[0];
  const label = primary ? TRIGGER_LABELS[primary] : 'Agent action';
  const target =
    typeof input.args.selector === 'string' ? input.args.selector :
    typeof input.args.url === 'string' ? input.args.url : undefined;

  return {
    domain,
    intendedAction: `${label}: ${input.toolName}${target ? ` → ${target.slice(0, 120)}` : ''}`,
    affectedResource: target,
    pageUrl: describePageUrl(input.currentUrl),
    targetText: describeTargetText(input.elementText),
    details: decision.redactedArgs,
    consequences: decision.triggers.map(t => TRIGGER_CONSEQUENCES[t]),
    uncertainty: [
      ...decision.reasons,
      'Classification is heuristic: verify the destination and the effect before approving.'
    ]
  };
}
