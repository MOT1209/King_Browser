/**
 * Selectors / field descriptions that look like secrets (passwords, card
 * numbers, one-time codes...). Shared by the approval policy (main process) and
 * the agent cursor overlay (renderer), so what is masked on screen is exactly
 * what the policy treats as sensitive input.
 */
export const SENSITIVE_FIELD_PATTERN = /pass(word|wd|phrase)?|passwd|\bpwd\b|\bpin\b|cvv|cvc|card.?number|credit.?card|cc.?number|ssn|social.?security|secret|token|api.?key|recovery|otp|one.?time|verification.?code|mfa|2fa/i;
