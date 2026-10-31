/**
 * One-click page translation, split out of main.ts: input limits, chunking,
 * result reassembly and the two calls to the translation service. The IPC
 * handlers (and their isTrustedSender check) stay in main.ts.
 *
 * The renderer is untrusted by main, so the payload is clamped before anything
 * leaves the machine: item count, per-item and total characters, and the
 * language codes (which end up in a URL). Network access is injected so every
 * rule can be tested without the service.
 */
import { escapeHtmlForTranslation, unescapeHtmlForTranslation } from './translationText.js';

export const MAX_TRANSLATION_ITEMS = 500;
export const MAX_TRANSLATION_TEXT_CHARS = 4000;
export const MAX_TRANSLATION_TOTAL_CHARS = 100_000;

const MAX_ITEMS_PER_CHUNK = 35;
const MAX_CHUNK_PAYLOAD_CHARS = 1600;
const CHUNK_CONCURRENCY = 3;

export interface TranslationDeps {
  fetch: (url: string, init: { headers: Record<string, string>; signal: AbortSignal }) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
  userAgent: string;
}

/** Clamps the renderer's payload. Non-strings and slots past the budget become '' so indices still line up. */
export function limitTranslationInput(rawTexts: unknown[]): string[] {
  const safeTexts: string[] = [];
  let remainingChars = MAX_TRANSLATION_TOTAL_CHARS;
  for (const rawText of rawTexts.slice(0, MAX_TRANSLATION_ITEMS)) {
    if (typeof rawText !== 'string' || remainingChars <= 0) {
      safeTexts.push('');
      continue;
    }
    const text = rawText.slice(0, Math.min(MAX_TRANSLATION_TEXT_CHARS, remainingChars));
    safeTexts.push(text);
    remainingChars -= text.length;
  }
  return safeTexts;
}

export function validLanguage(value: unknown, fallback: string): string {
  if (typeof value !== 'string' || !/^[a-zA-Z]{2,12}(?:[-_][a-zA-Z0-9]{2,12})?$/.test(value)) {
    return fallback;
  }
  return value;
}

export interface TranslationChunk { indices: number[]; payload: string }

/** Groups items into HTML payloads of about 1600 characters or 35 elements, skipping blank items. */
export function buildTranslationChunks(texts: string[]): TranslationChunk[] {
  const chunks: TranslationChunk[] = [];
  let currentIndices: number[] = [];
  let currentPayload = '';
  for (let i = 0; i < texts.length; i++) {
    const txt = texts[i] || '';
    if (!txt.trim()) continue;
    const itemHtml = `<p id="${i}">${escapeHtmlForTranslation(txt)}</p>`;
    if (currentIndices.length >= MAX_ITEMS_PER_CHUNK || (currentPayload.length + itemHtml.length > MAX_CHUNK_PAYLOAD_CHARS && currentIndices.length > 0)) {
      chunks.push({ indices: currentIndices, payload: currentPayload });
      currentIndices = [i];
      currentPayload = itemHtml;
    } else {
      currentIndices.push(i);
      currentPayload += itemHtml;
    }
  }
  if (currentIndices.length > 0) chunks.push({ indices: currentIndices, payload: currentPayload });
  return chunks;
}

/** Writes each translated <p id="n"> back to results[n]; out-of-range ids and empty content are ignored. */
export function applyTranslatedChunk(results: string[], rawTranslated: string): void {
  const regex = /<p id="?(\d+)"?>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = regex.exec(rawTranslated)) !== null) {
    const idx = parseInt(match[1], 10);
    const content = unescapeHtmlForTranslation(match[2].trim());
    if (idx >= 0 && idx < results.length && content) {
      results[idx] = content;
    }
  }
}

async function translateText(text: string, sourceLang: string, targetLang: string, deps: TranslationDeps): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=${encodeURIComponent(sourceLang)}&tl=${encodeURIComponent(targetLang)}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await deps.fetch(url, {
    headers: { 'User-Agent': deps.userAgent },
    signal: AbortSignal.timeout(8000)
  });
  if (!res.ok) {
    throw new Error(`Translation failed with status ${res.status}`);
  }
  const data = await res.json() as any;
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return data[0].map((item: any) => item[0] || '').join('');
  }
  return text;
}

export interface TranslationBatchResult { translations: string[]; success: boolean; error?: string }

/** Translates the payload { texts, sourceLang, targetLang }. A failed chunk keeps its original text. */
export async function translateBatch(payload: unknown, deps: TranslationDeps): Promise<TranslationBatchResult> {
  const input = payload && typeof payload === 'object' ? payload as Record<string, unknown> : {};
  const texts = limitTranslationInput(Array.isArray(input.texts) ? input.texts : []);
  if (texts.length === 0) return { translations: [], success: true };

  const sLang = validLanguage(input.sourceLang, 'auto');
  const tLang = validLanguage(input.targetLang, 'en');

  try {
    const results: string[] = [...texts];
    const chunks = buildTranslationChunks(texts);
    for (let i = 0; i < chunks.length; i += CHUNK_CONCURRENCY) {
      const batch = chunks.slice(i, i + CHUNK_CONCURRENCY);
      await Promise.all(batch.map(async (chunk) => {
        try {
          applyTranslatedChunk(results, await translateText(chunk.payload, sLang, tLang, deps));
        } catch (err: any) {
          console.warn('[Translate] Chunk translation failed:', err.message);
        }
      }));
      if (i + CHUNK_CONCURRENCY < chunks.length) {
        await new Promise(r => setTimeout(r, 60));
      }
    }
    return { translations: results, success: true };
  } catch (err: any) {
    console.error('[Translate] Batch translation error:', err);
    return { error: err.message || 'Translation failed', translations: texts, success: false };
  }
}

/** The service's detected source language for a short sample, or 'auto'. */
export async function detectLanguage(sampleText: string, deps: TranslationDeps): Promise<string> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=dict-chrome-ex&sl=auto&tl=en&dt=t&q=${encodeURIComponent(sampleText.slice(0, 300))}`;
    const res = await deps.fetch(url, {
      headers: { 'User-Agent': deps.userAgent },
      signal: AbortSignal.timeout(6000)
    });
    if (res.ok) {
      const data = await res.json() as any;
      if (Array.isArray(data) && typeof data[2] === 'string') {
        return data[2]; // e.g. 'en', 'de', 'es', 'fr', 'tr', 'ru', 'ja'
      }
    }
  } catch (err) {
    console.warn('[Translate] Language detection error:', err);
  }
  return 'auto';
}
