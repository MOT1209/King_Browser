import assert from 'node:assert/strict';
import {
  classifyAction,
  extractDomain,
  redactArgs,
  buildApprovalSummary,
  type PolicyInput
} from '../electron/main/policyEngine';

console.log('\n--- Approval Policy Engine (§12) Test Suite ---');

const REDACTED = '••••••••';

async function run() {
  // 1. Read-only tools are safe regardless of page.
  {
    const d = classifyAction({ toolName: 'browser_read_page', args: {}, currentUrl: 'https://mail.google.com/' });
    assert.equal(d.risk, 'safe', 'read_page is safe');
    assert.equal(d.triggers.length, 0, 'no triggers for read-only');
    console.log('[PASS] Policy — read-only tools are safe');
  }

  // 2. Plain navigation is not an approval trigger.
  {
    const d = classifyAction({ toolName: 'browser_navigate', args: { url: 'https://docs.github.com/en' } });
    assert.equal(d.risk, 'safe', 'normal navigation is safe');
    console.log('[PASS] Policy — plain navigation is safe');
  }

  // 3. Typing into a password field is sensitive and the value is redacted.
  {
    const d = classifyAction({
      toolName: 'browser_type',
      args: { selector: 'input[type="password"]', text: 'hunter2', pressEnter: false },
      currentUrl: 'https://accounts.example.com/login'
    });
    assert.equal(d.risk, 'sensitive', 'password input is sensitive');
    assert.ok(d.triggers.includes('sensitive_input'), 'sensitive_input trigger present');
    assert.equal(d.redactedArgs.text, REDACTED, 'typed value redacted');
    console.log('[PASS] Policy — password field typing is sensitive + redacted');
  }

  // 4. Card number fields are sensitive too.
  {
    const d = classifyAction({
      toolName: 'browser_type',
      args: { selector: '#card-number', text: '4111111111111111' },
      currentUrl: 'https://shop.example.com/checkout'
    });
    assert.equal(d.risk, 'sensitive', 'card field is sensitive');
    assert.ok(d.triggers.includes('sensitive_input'), 'sensitive_input trigger');
    assert.ok(d.triggers.includes('purchase'), 'checkout URL also escalates to purchase');
    assert.equal(d.redactedArgs.text, REDACTED, 'card digits redacted');
    console.log('[PASS] Policy — card field typing is sensitive + redacted');
  }

  // 5. Ordinary typing (search box) stays safe and is not redacted.
  {
    const d = classifyAction({
      toolName: 'browser_type',
      args: { selector: '#search-input', text: 'weather cairo' },
      currentUrl: 'https://duckduckgo.com/'
    });
    assert.equal(d.risk, 'safe', 'search typing is safe');
    assert.equal(d.redactedArgs.text, 'weather cairo', 'non-sensitive text kept');
    console.log('[PASS] Policy — ordinary typing is safe');
  }

  // 6. Purchase buttons are caught by selector/text keywords.
  {
    const d = classifyAction({ toolName: 'browser_click', args: { selector: 'button.buy-now-btn' } });
    assert.equal(d.risk, 'sensitive', 'buy button is sensitive');
    assert.ok(d.triggers.includes('purchase'), 'purchase trigger');
    console.log('[PASS] Policy — purchase button detected');
  }

  // 7. Delete buttons are caught.
  {
    const d = classifyAction({ toolName: 'browser_click', args: { selector: 'a[data-action="delete-account"]' } });
    assert.ok(d.triggers.includes('delete'), 'delete trigger');
    console.log('[PASS] Policy — delete button detected');
  }

  // 8. Publishing on a compose page is caught (element text + URL context).
  {
    const d = classifyAction({
      toolName: 'browser_click',
      args: { selector: 'button[data-testid="tweetButton"]' },
      currentUrl: 'https://twitter.com/compose/post'
    });
    assert.ok(d.triggers.includes('publish'), 'publish trigger');
    console.log('[PASS] Policy — publish action detected');
  }

  // 9. Generic button on a checkout page escalates via URL context.
  {
    const d = classifyAction({
      toolName: 'browser_click',
      args: { selector: '#continue-btn' },
      currentUrl: 'https://shop.example.com/checkout/payment'
    });
    assert.ok(d.triggers.includes('purchase'), 'checkout URL context triggers purchase');
    console.log('[PASS] Policy — checkout URL context escalates generic click');
  }

  // 10. Security settings page escalates generic clicks.
  {
    const d = classifyAction({
      toolName: 'browser_click',
      args: { selector: '#save' },
      currentUrl: 'https://accounts.example.com/settings/security'
    });
    assert.ok(d.triggers.includes('security_settings'), 'security settings trigger');
    console.log('[PASS] Policy — security settings context detected');
  }

  // 11. Direct executable downloads are sensitive.
  {
    const d = classifyAction({ toolName: 'browser_navigate', args: { url: 'https://files.example.com/setup.exe' } });
    assert.equal(d.risk, 'sensitive', 'exe download is sensitive');
    assert.ok(d.triggers.includes('dangerous_download'), 'dangerous_download trigger');
    console.log('[PASS] Policy — executable download detected');
  }

  // 12. Dangerous URL schemes are rejected to the approval gate.
  {
    const d = classifyAction({ toolName: 'browser_navigate', args: { url: 'javascript:alert(1)' } });
    assert.ok(d.triggers.includes('dangerous_download'), 'javascript: scheme flagged');
    console.log('[PASS] Policy — dangerous URL scheme flagged');
  }

  // 13. Arbitrary JS execution is always sensitive and its script is redacted.
  {
    const script = 'doSomething()';
    const d = classifyAction({ toolName: 'browser_run_js', args: { script } });
    assert.equal(d.risk, 'sensitive', 'run_js is sensitive');
    assert.ok(d.triggers.includes('arbitrary_code'), 'arbitrary_code trigger');
    assert.ok(String(d.redactedArgs.script).includes('script omitted'), 'script body redacted');
    assert.ok(!String(d.redactedArgs.script).includes('doSomething'), 'script content not leaked');
    console.log('[PASS] Policy — arbitrary JS is sensitive + redacted');
  }

  // 14. Unknown tools fail closed.
  {
    const d = classifyAction({ toolName: 'browser_unknown_thing', args: {} });
    assert.equal(d.risk, 'sensitive', 'unknown tool is sensitive');
    assert.ok(d.triggers.includes('consequential_form'), 'unknown tool needs review');
    console.log('[PASS] Policy — unknown tool fails closed');
  }

  // 15. Sensitive argument keys are redacted generically.
  {
    const redacted = redactArgs('browser_click', { selector: '#ok', apiKey: 'sk-123', token: 'abc', code: '9999' });
    assert.equal(redacted.apiKey, REDACTED, 'apiKey redacted');
    assert.equal(redacted.token, REDACTED, 'token redacted');
    assert.equal(redacted.code, REDACTED, 'otp code redacted');
    assert.equal(redacted.selector, '#ok', 'selector kept');
    console.log('[PASS] Policy — sensitive argument keys redacted');
  }

  // 16. Domain extraction is safe on all inputs.
  {
    assert.equal(extractDomain('https://Sub.Example.COM/path?q=1'), 'sub.example.com', 'domain lowercased');
    assert.equal(extractDomain('not a url'), undefined, 'invalid URL yields undefined');
    assert.equal(extractDomain(undefined), undefined, 'missing URL yields undefined');
    console.log('[PASS] Policy — domain extraction');
  }

  // 17. Approval summary includes everything §12 requires.
  {
    const input: PolicyInput = {
      toolName: 'browser_click',
      args: { selector: 'button.buy-now-btn' },
      currentUrl: 'https://shop.example.com/checkout'
    };
    const decision = classifyAction(input);
    const summary = buildApprovalSummary(input, decision);
    assert.equal(summary.domain, 'shop.example.com', 'summary shows website domain');
    assert.ok(summary.intendedAction.includes('purchase') || summary.intendedAction.includes('purchase'), 'intended action described');
    assert.ok(summary.consequences.length >= 1, 'consequences listed');
    assert.ok(summary.uncertainty.length >= 2, 'uncertainty listed (reasons + heuristic note)');
    assert.equal(summary.details.selector, 'button.buy-now-btn', 'details use redacted args');
    console.log('[PASS] Policy — approval summary completeness');
  }

  // 18. Arabic delete button text is detected.
  {
    const d = classifyAction({
      toolName: 'browser_click',
      args: { selector: '#btn-42' },
      elementText: 'احذف حسابي'
    });
    assert.ok(d.triggers.includes('delete'), 'Arabic delete trigger');
    console.log('[PASS] Policy — Arabic delete text detected');
  }

  // 19. Arabic purchase text is detected.
  {
    const d = classifyAction({
      toolName: 'browser_click',
      args: { selector: '#btn-7' },
      elementText: 'اشتري الآن'
    });
    assert.ok(d.triggers.includes('purchase'), 'Arabic purchase trigger');
    console.log('[PASS] Policy — Arabic purchase text detected');
  }

  // 20. Pressing Enter on a checkout page escalates (context-only).
  {
    const d = classifyAction({
      toolName: 'browser_press_key',
      args: { key: 'Enter' },
      currentUrl: 'https://shop.example.com/checkout'
    });
    assert.ok(d.triggers.includes('purchase'), 'Enter on checkout escalates');
    console.log('[PASS] Policy — Enter key on checkout escalates');
  }

  // 21. Passive actions never escalate, even on sensitive pages.
  {
    const d = classifyAction({
      toolName: 'browser_scroll',
      args: { direction: 'down' },
      currentUrl: 'https://shop.example.com/checkout'
    });
    assert.equal(d.risk, 'safe', 'scrolling is always safe');
    console.log('[PASS] Policy — passive scroll stays safe');
  }

  // 22. Engine control tools are safe and bypass policy.
  {
    const d = classifyAction({ toolName: 'browser_stop', args: {} });
    assert.equal(d.risk, 'safe', 'engine control is safe');
    assert.equal(d.triggers.length, 0, 'no triggers for engine control');
    console.log('[PASS] Policy — engine control tools bypass policy');
  }

  // 23. Sharing/inviting is caught as share_private.
  {
    const d = classifyAction({
      toolName: 'browser_click',
      args: { selector: '#btn-share' },
      elementText: 'Share with team'
    });
    assert.ok(d.triggers.includes('share_private'), 'share_private trigger');
    console.log('[PASS] Policy — sharing detected');
  }

  // 24. Permission grants are caught.
  {
    const d = classifyAction({
      toolName: 'browser_click',
      args: { selector: '#authorize' },
      elementText: 'Authorize app'
    });
    assert.ok(d.triggers.includes('grant_permission'), 'grant_permission trigger');
    console.log('[PASS] Policy — permission grant detected');
  }

  // 25. Downloads via button text are caught.
  {
    const d = classifyAction({
      toolName: 'browser_click',
      args: { selector: '#dl' },
      elementText: 'Download installer'
    });
    assert.ok(d.triggers.includes('dangerous_download'), 'download trigger');
    console.log('[PASS] Policy — download action detected');
  }

  // 26. Messaging compose (non-publish) escalates to send.
  {
    const d = classifyAction({
      toolName: 'browser_type',
      args: { selector: '#message-body', text: 'hello there', pressEnter: true },
      currentUrl: 'https://mail.example.com/new/message'
    });
    assert.ok(d.triggers.includes('send'), 'compose page escalates to send');
    console.log('[PASS] Policy — messaging compose escalates to send');
  }

  console.log('[PASS] Policy Engine suite complete');
}

run().then(
  () => {},
  (error) => {
    console.error('[FAIL] Policy Engine suite:', error);
    process.exitCode = 1;
  }
);
