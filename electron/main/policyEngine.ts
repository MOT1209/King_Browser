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
 *   consequential_form for concrete form submissions.
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
  | 'arbitrary_code';

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
  details: Record<string, unknown>;
  consequences: string[];
  uncertainty: string[];
}

const READ_ONLY_TOOLS = new Set([
  'browser_status',
  'king_browser_info',
  'browser_read_page',
  'browser_screenshot',
  'browser_full_page_screenshot',
  'browser_get_url',
  'browser_get_element_text',
  'browser_list_tabs',
  'browser_find_element'
]);

const PASSIVE_ACTION_TOOLS = new Set([
  'browser_scroll',
  'browser_scroll_to_element',
  'browser_wait',
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

const SENSITIVE_SELECTOR_PATTERNS = /pass(word|wd|phrase)?|passwd|\bpwd\b|\bpin\b|cvv|cvc|card.?number|credit.?card|cc.?number|ssn|social.?security|secret|token|api.?key|recovery|otp|one.?time|verification.?code|mfa|2fa/i;

const REDACTED_VALUE = '••••••••';

const PURCHASE_TEXT = /(buy|purchase|pay\b|payment|checkout|place order|complete order|subscribe|donate|upgrade to|add to cart|شراء|اشتر|ادفع|الدفع|دفع|تبرع|اكمل الطلب|إتمام الطلب|اشترك)/i;
const SEND_TEXT = /(\bsend\b|send now|submit (application|comment|reply|message)|post comment|post reply|dm |direct message|أرسل|إرسال|ارسال|انشر التعليق|رد)/i;
const DELETE_TEXT = /(delete|remove|trash|unsubscribe|deactivate|close account|cancel subscription|حذف|احذف|إزالة|الغاء الاشتراك|الغاء حسابي|إلغاء الحساب|إلغاء الاشتراك)/i;
const SECURITY_TEXT = /(change password|two.?factor|2fa|recovery (email|phone|key)|security (settings|key)|revoke access|sign out of all|enable 2|disable 2|تعيين كلمة المرور|تغيير كلمة المرور|التحقق بخطوتين|إعدادات الأمان)/i;
const PUBLISH_TEXT = /(publish|post\b|tweet|share publicly|make public|new post|نشر|انشر|تغريدة|منشور جديد)/i;
const SHARE_PRIVATE_TEXT = /(share\b|share with|invite|send file|attach|forward|مشاركة|شارك|دعوة)/i;
const PERMISSION_TEXT = /(allow|grant|authorize|authorise|permit|accept permissions|give access|السماح|اسمح|منح|تصريح|تفويض)/i;
const DOWNLOAD_TEXT = /(download|install|save file|run installer|تحميل|نزّل|تثبيت)/i;

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

export function redactArgs(toolName: string, args: Record<string, unknown>): Record<string, unknown> {
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
      out[key] = SENSITIVE_SELECTOR_PATTERNS.test(selector) ? REDACTED_VALUE : value;
      continue;
    }
    out[key] = value;
  }
  return out;
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
    if (PURCHASE_TEXT.test(text)) addTrigger(context, 'purchase', `Button/link text suggests a purchase ("${text.slice(0, 60)}").`);
    if (DELETE_TEXT.test(text)) addTrigger(context, 'delete', `Button/link text suggests deletion ("${text.slice(0, 60)}").`);
    if (SECURITY_TEXT.test(text)) addTrigger(context, 'security_settings', `Button/link text suggests a security change ("${text.slice(0, 60)}").`);
    if (PUBLISH_TEXT.test(text)) addTrigger(context, 'publish', `Button/link text suggests publishing ("${text.slice(0, 60)}").`);
    else if (SEND_TEXT.test(text)) addTrigger(context, 'send', `Button/link text suggests sending ("${text.slice(0, 60)}").`);
    if (SHARE_PRIVATE_TEXT.test(text)) addTrigger(context, 'share_private', `Button/link text suggests sharing ("${text.slice(0, 60)}").`);
    if (PERMISSION_TEXT.test(text)) addTrigger(context, 'grant_permission', `Button/link text suggests granting access ("${text.slice(0, 60)}").`);
    if (DOWNLOAD_TEXT.test(text)) addTrigger(context, 'dangerous_download', `Button/link text suggests a download ("${text.slice(0, 60)}").`);

    const href = typeof args.url === 'string' ? args.url : '';
    if (href && DANGEROUS_FILE_URL.test(href)) {
      addTrigger(context, 'dangerous_download', `Target file looks executable (${href.split('/').pop()?.slice(0, 60)}).`);
    }
    return;
  }

  if (toolName === 'browser_select_option') {
    if (PURCHASE_TEXT.test(text) || PURCHASE_TEXT.test(selector)) {
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
  const redactedArgs = redactArgs(toolName, args);

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
  arbitrary_code: 'This executes arbitrary code inside the page with full page privileges.'
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
  arbitrary_code: 'Execute arbitrary code'
};

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
    details: decision.redactedArgs,
    consequences: decision.triggers.map(t => TRIGGER_CONSEQUENCES[t]),
    uncertainty: [
      ...decision.reasons,
      'Classification is heuristic: verify the destination and the effect before approving.'
    ]
  };
}
