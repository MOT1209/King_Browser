export function sanitizeAgentInput(raw: string): string {
  if (!raw || typeof raw !== 'string') return '';

  let text = raw;

  // 1. Strip null bytes and invisible unicode separator / tag characters
  //    commonly used to hide injected instructions from human reviewers.
  // eslint-disable-next-line no-control-regex -- يُزيل أحرف التحكم عمداً
  text = text.replace(/\u0000/g, '');
  // The tag-character block is U+E0000..U+E007F, which needs the `u` flag and
  // brace escapes. Written without it, the old range swallowed every ASCII
  // character and blanked the whole input.
  text = text.replace(/[\u2028\u2029\u200B-\u200D\uFEFF\u{E0000}-\u{E007F}]/gu, '');

  // 2. Neutralize boundary delimiter breakouts
  text = text.replace(/<\/?untrusted_page_content>/gi, '[REDACTED_TAG]');
  text = text.replace(/<\/?user_vault_data>/gi, '[REDACTED_TAG]');
  text = text.replace(/<\/?page_form_inputs>/gi, '[REDACTED_TAG]');

  // 3. Normalize Unicode to catch homoglyph and zero-width evasion attacks
  try {
    text = text.normalize('NFKC');
  } catch {}

  // 4. Remove well-known system-override trigger phrases in English & Turkish.
  const injectionPatterns: RegExp[] = [
    // English triggers
    /ignore\s+(all\s+)?(previous|prior|above)\s+instructions?/gi,
    /disregard\s+(your|all|the)\s+(previous\s+)?instructions?/gi,
    /forget\s+(everything|all)\s+(you\s+(were|are)\s+told|above)/gi,
    /you\s+are\s+now\s+(a\s+)?/gi,
    /act\s+as\s+(a\s+)?(different|new|another|unrestricted)/gi,
    /new\s+system\s+prompt\s*:/gi,
    /\[SYSTEM\]/gi,
    /<\s*system\s*>/gi,
    /your\s+real\s+instructions?\s+(are|is)\s*:/gi,
    /do\s+not\s+follow\s+your\s+(previous\s+)?instructions?/gi,
    /override\s+(previous|all)\s+(instructions?|commands?)/gi,

    // Turkish triggers & homoglyphs
    /(?:önceki|onceki|gecmis|geçmiş|tüm|tum|yukarıdaki|yukaridaki)\s+(?:bütün\s+)?(?:talimatları|talimatlari|yönergeleri|yonergeleri|kuralları|kurallari)\s+(?:unut|yoksay|ihmal\s+et|boşver|bosver|sil)/gi,
    /(?:artık|artik|bundan\s+sonra)\s+(?:sen\s+)?(?:farklı|farkli|yeni|baska|başka|kısıtlamasız|kisitlamasiz)\s+(?:bir\s+)?(?:modele|karaktere|asistana)/gi,
    /(?:yeni|guncel|güncel)\s+sistem\s+(?:promptu|talimatı|talimati|yönergesi|yonergesi)\s*:/gi,
    /(?:gerçek|gercek)\s+(?:görevin|gorevin|talimatın|talimatin)\s*:/gi,
    /(?:sistem\s+talimatını|sistem\s+kurallarını)\s+(?:geçersiz\s+kıl|gecersiz\s+kil|çiğne|cigne|yoksay)/gi,
    /(?:şifreleri|parolaları|vault|kullanıcı\s+bilgilerini)\s+(?:dışarı\s+aktar|gönder|oku|sızdır)/gi
  ];
  for (const pattern of injectionPatterns) {
    text = text.replace(pattern, '[REDACTED]');
  }

  // 5. Collapse extreme token-stuffing: more than 200 consecutive identical characters.
  //    This prevents attempts to push earlier context off the model's attention window.
  text = text.replace(/(.)\1{200,}/g, '$1$1$1');

  return text;
}
