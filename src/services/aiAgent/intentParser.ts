import { getLocale, getLanguage } from '../i18n';

// ü, ö and ç are shared with German (für, schön), so on their own they do not
// mean Turkish; German text is ruled out before they are considered.
const GERMAN_TEXT = /[äßÄ]|\b(der|die|das|und|ist|nicht|bitte|mit|für|über|eine?n?|ich|wie|was|zeige?|öffne|suche|schließe?)\b/i;
const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿ]/;

export function isTurkishContext(str: string): boolean {
  if (getLocale() === 'tr-TR') return true;
  if (/[ığşİĞŞ]/.test(str)) return true;
  if (GERMAN_TEXT.test(str)) return false;
  if (/[üöçÜÖÇ]/.test(str)) return true;
  return /\b(merhaba|selam|selamlar|nasılsın|nasilsin|naber|lütfen|lutfen|teşekkür|tesekkur|sekme|sekmeyi|sayfa|sayfayı|sayfayi|özetle|ozetle|özet|ozet|kapat|kaydır|kaydir|gecmis|gecmisi|ara|bul|aç|ac|yenile)\b/i.test(str);
}

export type ReplyLanguage = 'en' | 'tr' | 'ar' | 'de';

/**
 * Language for the agent's own status messages and reports: the language the
 * user wrote in when it is recognisable, otherwise the interface language.
 */
export function replyLanguage(...texts: unknown[]): ReplyLanguage {
  const text = texts.filter((t): t is string => typeof t === 'string').join(' ');
  if (ARABIC_SCRIPT.test(text)) return 'ar';
  if (text && isTurkishContext(text)) return 'tr';
  if (GERMAN_TEXT.test(text)) return 'de';
  const ui = getLanguage();
  // Latin text in an Arabic interface is most likely English.
  if (ui === 'de' || (ui === 'ar' && !text.trim())) return ui;
  return 'en';
}

/** Picks the message for the reply language, falling back to English. */
export function say(language: ReplyLanguage, texts: Record<ReplyLanguage, string>): string {
  return texts[language] ?? texts.en;
}
const isTurkishText = isTurkishContext;

// Natural Language Intent Extractor: Instantly executes common browser commands and conversational greetings with 100% reliability
export function detectDirectIntent(userText: string): { name: string; arguments: any; directReply?: string; isSummary?: boolean } | null {
  if (!userText || typeof userText !== 'string') return null;
  const text = userText.trim();
  const lower = text.toLowerCase();
  const isTr = isTurkishContext(text);

  // Normalize Turkish characters, common typos and spaces
  const normalized = lower
    .replace(/[\u2018\u2019´`]/g, "'") // standard single quote
    .replace(/\bknalını\b|\bknalini\b|\bknalı\b|\bknali\b/g, 'kanalını')
    .replace(/\byotube\b|\byoutbe\b|\byutube\b/g, 'youtube')
    .replace(/\bgogle\b|\bgoole\b/g, 'google')
    .replace(/\bhackernews\b|\bhacker\s+news\b|\bhn\b/g, 'hackernews');

  // 0. Conversational greetings and friendly chat (Zero-latency instant reply, zero tool hallucination)
  if (/^(selam|selamlar|slm|merhaba|merhabalar|mrb|hey|hi|hello|günaydın|gunaydin|iyi günler|iyi gunler|iyi akşamlar|iyi aksamlar|nasılsın|nasilsin|naber|ne haber|nbr|sa|as)$/i.test(normalized)) {
    return {
      name: 'direct_chat',
      arguments: {},
      directReply: isTr
        ? "Merhaba! Ben King Browser yapay zeka asistanıyım. Web'de gezinebilir, Google/YouTube'da arama yapabilir, sayfaları özetleyebilir veya sekmeleri yönetebilirim. Sana nasıl yardımcı olabilirim?"
        : "Hello! I am King Browser's AI assistant. I can browse the web, search Google/YouTube, summarize pages, or manage tabs. How can I help you today?"
    };
  }

  // 0b. Identity and capabilities queries
  if (/^(sen kimsin|kimsin|sen nesin|ne yapabilirsin|neler yapabilirsin|yardım|yardim|help|about|who are you|what can you do)$/i.test(normalized)) {
    return {
      name: 'direct_chat',
      arguments: {},
      directReply: isTr
        ? "King Browser AI asistanı olarak sekmeleri ve pencereleri yönetebilir, Google/YouTube/GitHub aramaları yapabilir, sayfaları okuyup özetleyebilir ve formları doldurabilirim."
        : "As King Browser's AI assistant, I can manage tabs and workspaces, search Google/YouTube/GitHub, read and summarize pages, and assist with browser actions."
    };
  }

  // 0c. Gratitude & pleasantries
  if (/^(teşekkürler|tesekkurler|teşekkür ederim|tesekkur ederim|sağol|sagol|eyvallah|tşk|tsk|thanks|thank you)$/i.test(normalized)) {
    return {
      name: 'direct_chat',
      arguments: {},
      directReply: isTr
        ? "Rica ederim! Başka yardımcı olabileceğim bir işlem var mı?"
        : "You're welcome! Let me know if there's anything else you'd like me to do."
    };
  }

  // 1. Page navigation & history controls (Reload, Back, Forward)
  if (/^(sayfayı yenile|sayfayi yenile|sayfa yenile|yenile|sayfayı tekrar yükle|sayfayi tekrar yukle|reload page|refresh page|reload|refresh)$/i.test(normalized)) {
    return { name: 'reload_page', arguments: {}, directReply: isTr ? "Sayfa yenilendi." : "Page reloaded." };
  }
  if (/^(geri git|geri gel|geriye git|geriye gel|önceki sayfa|onceki sayfa|bir önceki sayfaya dön|bir onceki sayfaya don|go back|back)$/i.test(normalized)) {
    return { name: 'go_back', arguments: {}, directReply: isTr ? "Önceki sayfaya gidildi." : "Navigated back." };
  }
  if (/^(ileri git|ileri gel|ileriye git|ileriye gel|sonraki sayfa|bir sonraki sayfaya git|go forward|forward)$/i.test(normalized)) {
    return { name: 'go_forward', arguments: {}, directReply: isTr ? "İleri sayfaya gidildi." : "Navigated forward." };
  }

  // 2. Direct URL or bare domain
  if (/^https?:\/\/[^\s]+$/i.test(text) || /^[a-z0-9-]+\.(com|org|net|io|dev|app|edu|gov|tr|xyz|info)(\/[^\s]*)?$/i.test(text)) {
    const u = text.startsWith('http') ? text : 'https://' + text;
    return { name: 'navigate_to_url', arguments: { url: u }, directReply: isTr ? `${u} açıldı.` : `Opened ${u}.` };
  }

  // 3. Tab management
  if (/^(yeni sekme|yeni sekme aç|yeni sekme ac|yeni sekme oluştur|yeni sekme olustur|sekme aç|sekme ac|open new tab|new tab|create tab)$/i.test(normalized)) {
    return { name: 'manage_tabs', arguments: { action: 'create' }, directReply: isTr ? "Yeni sekme açıldı." : "New tab created." };
  }
  if (/^(sekmeyi kapat|bu sekmeyi kapat|sekme kapat|geçerli sekmeyi kapat|close tab|close current tab)$/i.test(normalized)) {
    return { name: 'manage_tabs', arguments: { action: 'close' }, directReply: isTr ? "Sekme kapatıldı." : "Tab closed." };
  }
  if (/^(sekmeleri listele|açık sekmeler|acik sekmeler|açık sekmeleri göster|acik sekmeleri goster|sekmeleri göster|list tabs|show tabs)$/i.test(normalized)) {
    return { name: 'manage_tabs', arguments: { action: 'list' } };
  }

  // 4. Page reading and summarization
  if (/^(sayfayı oku|sayfayi oku|bu sayfayı oku|bu sayfayi oku|sayfada ne var|sayfayı özetle|sayfayi ozetle|özetle|ozetle|özet çıkar|ozet cikar|sayfa özeti|sayfa ozeti|bu sayfayı özetle|bu sayfayi ozetle|özet|ozet|read page|read this page|summarize page|summarize this page|summarize)$/i.test(normalized)) {
    const isSummary = /özet|ozet|summar/i.test(normalized);
    return { name: 'read_page_content', arguments: {}, isSummary };
  }

  // 5. Scrolling
  if (/^(en alta kaydır|en alta kaydir|en alta in|sayfanın sonuna in|sayfanin sonuna in|scroll to bottom)$/i.test(normalized)) {
    return { name: 'scroll_page', arguments: { direction: 'bottom' }, directReply: isTr ? "Sayfanın en altına kaydırıldı." : "Scrolled to page bottom." };
  }
  if (/^(en üste kaydır|en uste kaydir|en üste çık|en uste cik|sayfanın başına dön|sayfanin basina don|scroll to top)$/i.test(normalized)) {
    return { name: 'scroll_page', arguments: { direction: 'top' }, directReply: isTr ? "Sayfanın en başına kaydırıldı." : "Scrolled to page top." };
  }
  if (/^(aşağı kaydır|asagi kaydir|aşağı in|asagi in|sayfayı aşağı kaydır|sayfayi asagi kaydir|scroll down)$/i.test(normalized)) {
    return { name: 'scroll_page', arguments: { direction: 'down' }, directReply: isTr ? "Sayfa aşağı kaydırıldı." : "Page scrolled down." };
  }
  if (/^(yukarı kaydır|yukari kaydir|yukarı çık|yukari cik|sayfayı yukarı kaydır|sayfayi yukari kaydir|scroll up)$/i.test(normalized)) {
    return { name: 'scroll_page', arguments: { direction: 'up' }, directReply: isTr ? "Sayfa yukarı kaydırıldı." : "Page scrolled up." };
  }

  // 6. Screenshot
  if (/^(ekran görüntüsü al|ekran goruntusu al|ekran görüntüsünü al|screenshot al|take screenshot|screenshot)$/i.test(normalized)) {
    return { name: 'take_screenshot', arguments: {}, directReply: isTr ? "Ekran görüntüsü alındı." : "Screenshot captured." };
  }

  // 7. History & Bookmarks Search
  const historySearchMatch = normalized.match(/^(?:geçmişte|geçmişimde|gecmiste|gecmisimde|yer\s*imlerimde|history|bookmarks)\s+(?:ara|bul|search\s*for|search)?\s*[:\s]?\s*(.+)$/i);
  if (historySearchMatch && historySearchMatch[1]) {
    const q = historySearchMatch[1]
      .replace(/^(?:ara|bul|search\s*for|search)\s+/gi, '')
      .replace(/\s+(?:ara|bul|search|araştır|arastir)$/gi, '')
      .trim();
    if (q) {
      return {
        name: 'search_history',
        arguments: { query: q },
        directReply: isTr ? `Geçmişte ve yer imlerinde "${q}" arandı.` : `Searched history for "${q}".`
      };
    }
  }

  // 8. Direct site opening (Evaluated BEFORE compound searches so "youtube'u aç" opens YouTube directly!)
  const sites: Record<string, { url: string; name: string }> = {
    'hackernews': { url: 'https://news.ycombinator.com', name: 'Hacker News' },
    'youtube': { url: 'https://youtube.com', name: 'YouTube' },
    'google': { url: 'https://google.com', name: 'Google' },
    'github': { url: 'https://github.com', name: 'GitHub' },
    'twitter': { url: 'https://x.com', name: 'Twitter / X' },
    'x': { url: 'https://x.com', name: 'X' },
    'reddit': { url: 'https://reddit.com', name: 'Reddit' },
    'wikipedia': { url: 'https://wikipedia.org', name: 'Wikipedia' },
    'duckduckgo': { url: 'https://duckduckgo.com', name: 'DuckDuckGo' },
    'stackoverflow': { url: 'https://stackoverflow.com', name: 'Stack Overflow' },
    'arxiv': { url: 'https://arxiv.org', name: 'arXiv' },
    'medium': { url: 'https://medium.com', name: 'Medium' },
    'linkedin': { url: 'https://linkedin.com', name: 'LinkedIn' },
    'instagram': { url: 'https://instagram.com', name: 'Instagram' },
    'facebook': { url: 'https://facebook.com', name: 'Facebook' },
    'amazon': { url: 'https://amazon.com', name: 'Amazon' },
    'netflix': { url: 'https://netflix.com', name: 'Netflix' },
    'spotify': { url: 'https://spotify.com', name: 'Spotify' },
    'trendyol': { url: 'https://trendyol.com', name: 'Trendyol' },
    'hepsiburada': { url: 'https://hepsiburada.com', name: 'Hepsiburada' },
    'ekşi sözlük': { url: 'https://eksisozluk.com', name: 'Ekşi Sözlük' },
    'eksi sozluk': { url: 'https://eksisozluk.com', name: 'Ekşi Sözlük' },
    'ekşi': { url: 'https://eksisozluk.com', name: 'Ekşi Sözlük' },
    'eksisozluk': { url: 'https://eksisozluk.com', name: 'Ekşi Sözlük' },
    'haberler': { url: 'https://news.google.com', name: 'Google News' },
    'chatgpt': { url: 'https://chatgpt.com', name: 'ChatGPT' }
  };

  for (const [siteKey, siteInfo] of Object.entries(sites)) {
    const escapedKey = siteKey.replace(/\s+/g, '\\s+');
    const directSiteRegex = new RegExp(
      `^(?:` +
        `(?:open|go\\s+to|visit|launch|aç|ac|gir)\\s+${escapedKey}(?:\\.(?:com|org|net))?|` +
        `${escapedKey}(?:\\.(?:com|org|net))?|` +
        `${escapedKey}(?:['']?(?:u|ü|ı|i|a|e|ye|ya|yu|yü|yi|yı))?(?:\\s+(?:sayfasını|sayfasini|sitesini|sitesi))?\\s*(?:aç|ac|git|gir|e\\s+git|a\\s+git|a\\s+gir|e\\s+gir)?` +
      `)$`,
      'i'
    );
    if (directSiteRegex.test(normalized)) {
      return {
        name: 'navigate_to_url',
        arguments: { url: siteInfo.url },
        directReply: isTr ? `${siteInfo.name} açıldı.` : `Opened ${siteInfo.name}.`
      };
    }
  }

  // 9. GitHub direct repo opening (e.g. "github MOT1209/King_Browser aç")
  const githubRepoMatch = normalized.match(/^github(?:['']?(?:da|de)|\s+da|\s+de)?\s+(?:aç|ac|a git|git)?\s*([a-z0-9_.-]+\/[a-z0-9_.-]+)(?:\s*(?:reposunu|reposu|projesini)?\s*(?:aç|ac|git)?)?$/i);
  if (githubRepoMatch && githubRepoMatch[1]) {
    const repo = githubRepoMatch[1];
    return {
      name: 'navigate_to_url',
      arguments: { url: `https://github.com/${repo}` },
      directReply: isTr ? `GitHub'da ${repo} deposu açıldı.` : `Opened GitHub repository ${repo}.`
    };
  }

  // 9b. Autonomous Multi-Step Goal & Task Intent
  // e.g. "siteye gidip şunu yap sonra işte youtube da şu videoyu bul",
  //      "youtube'a git ve lofi müzik aç", "google'da btc fiyatı ara sonra ekran görüntüsü al",
  //      "hedef: ...", "görev: ..."
  const hasSequentialMarker = /(?:\s+(?:sonra|ardından|ve ardından|daha sonra|sonrasında|then|and then|after that)\s+)/i.test(normalized);
  const hasExplicitGoalPrefix = /^(?:hedef|görev|gorev|task|goal|plan)\s*[:\s]\s*(.+)$/i.test(normalized);
  const isCompoundYoutubePlay = /^(?:youtube(?:['']?(?:a|e|ye|ya|da|de|ta|te)|\s+[a-z]+)?)\s+(?:git|gir|aç)?\s*(?:ve|,)?\s*(?:bana\s+)?(.+?)\s+(?:aç|ac|oynat|çal|cal|izle|bul|başlat|baslat)$/i.test(normalized);
  const isSiteAndAction = /^(?:siteye|web sitesine|sayfaya)\s+(?:git|gir)?\s*(?:ve|,|sonra)\s*(.+)$/i.test(normalized);

  if (hasExplicitGoalPrefix || (hasSequentialMarker && /(?:git|gir|aç|ara|bul|çal|izle|oynat|tıkla|yaz|oku|özetle|screenshot|ekran|navigate|search|click|play|find)/i.test(normalized)) || (isCompoundYoutubePlay && !normalized.match(/^youtube(?:'da|da)\s+(.+)\s+ara$/i)) || isSiteAndAction) {
    return {
      name: 'execute_goal',
      arguments: { goal: text.trim() }
    };
  }

  // 10. YouTube Search / Playback Compound (e.g. "youtube aç ve enes batur videosunu aç", "youtube'da tarkan ara", "youtube da lofi dinle")
  const ytCompoundMatch =
    normalized.match(/^(?:youtube|yt)(?:['']?(?:da|de|ta|te)|\s+da|\s+de)?\s+(?:aç|ac|a git|git)?\s*(?:ve|,)?\s*(?:bana\s+)?(.+?)\s*(?:kanalını\s*aç|kanalini\s*ac|kanalını|kanalini|videosunu\s*aç|videosunu\s*ac|videosu|videosunu|şarkısını\s*aç|şarkısını|şarkısı|izle|dinle|ara|aç|ac)?$/i) ||
    normalized.match(/^(?:youtube|yt)\s+(.+)$/i);

  if (ytCompoundMatch && ytCompoundMatch[1]) {
    let query = ytCompoundMatch[1]
      .replace(/^(aç|ac|ve|git|izle|dinle|ara)\s+/gi, '')
      .replace(/\s+(kanalını|kanalini|knalını|knalini|videosunu|şarkısını|şarkısı|izle|dinle|aç|ac|ara)$/gi, '')
      .replace(/\s+(ve|ile)\s+/gi, ' ')
      .trim();

    query = query.replace(/^['']?(?:u|ü|ı|i|a|e)\s*/i, '').trim();

    if (query && query !== 'aç' && query !== 'ac' && query !== 'git' && query !== 'youtube') {
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
      return {
        name: 'navigate_to_url',
        arguments: { url: searchUrl },
        directReply: isTr ? `YouTube'da "${query}" arandı.` : `Searched for "${query}" on YouTube.`
      };
    }
  }

  // 11. GitHub Search (e.g. "github'da react ara")
  const githubSearchMatch = normalized.match(/^github(?:['']?(?:da|de)|\s+da|\s+de)?\s+(?:aç|ac|a git|git)?\s*(?:ve|,)?\s*(?:bana\s+)?(.+?)\s*(?:ara|bul|aç|ac)?$/i);
  if (githubSearchMatch && githubSearchMatch[1]) {
    const query = githubSearchMatch[1].replace(/^(aç|ac|ve|git)\s+/gi, '').replace(/\s+(ara|bul|aç|ac)$/gi, '').trim();
    if (query && query !== 'github' && query !== 'aç' && query !== 'ac') {
      return {
        name: 'navigate_to_url',
        arguments: { url: `https://github.com/search?q=${encodeURIComponent(query)}` },
        directReply: isTr ? `GitHub'da "${query}" arandı.` : `Searched for "${query}" on GitHub.`
      };
    }
  }

  // 12. DuckDuckGo Search (e.g. "duckduckgo'da webgpu ara", "duckduckgo webgpu benchmarks")
  const ddgMatch = normalized.match(/^(?:duckduckgo|ddg)(?:['']?(?:da|de)|\s+da|\s+de)?\s+(?:aç|ac|a git|git)?\s*(?:ve|,)?\s*(?:bana\s+)?(.+?)\s*(?:ara|bul|aç|ac)?$/i);
  if (ddgMatch && ddgMatch[1]) {
    const query = ddgMatch[1].replace(/^(aç|ac|ve|git)\s+/gi, '').replace(/\s+(ara|bul|aç|ac)$/gi, '').trim();
    if (query && query !== 'duckduckgo' && query !== 'ddg' && query !== 'aç') {
      return {
        name: 'navigate_to_url',
        arguments: { url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}` },
        directReply: isTr ? `DuckDuckGo'da "${query}" arandı.` : `Searched for "${query}" on DuckDuckGo.`
      };
    }
  }

  // 13. Wikipedia Search (e.g. "wikipedia'da web browser ara", "wikipedia electron framework")
  const wikiMatch = normalized.match(/^wikipedia(?:['']?(?:da|de)|\s+da|\s+de)?\s+(?:aç|ac|a git|git)?\s*(?:ve|,)?\s*(?:bana\s+)?(.+?)\s*(?:ara|bul|maddesini\s*aç|aç|ac)?$/i);
  if (wikiMatch && wikiMatch[1]) {
    const query = wikiMatch[1].replace(/^(aç|ac|ve|git)\s+/gi, '').replace(/\s+(ara|bul|aç|ac|maddesini)$/gi, '').trim();
    if (query && query !== 'wikipedia' && query !== 'aç') {
      return {
        name: 'navigate_to_url',
        arguments: { url: `https://en.wikipedia.org/wiki/Special:Search?search=${encodeURIComponent(query)}` },
        directReply: isTr ? `Wikipedia'da "${query}" arandı.` : `Searched for "${query}" on Wikipedia.`
      };
    }
  }

  // 14. Autonomous Multi-Step Web Research Intent
  // e.g. "Web üzerinde en son haberleri ara", "Search latest news on web", "react 19 yeniliklerini araştır", "webde yapay zeka haberleri ara"
  const isExplicitEngineSearch = /^(?:google(?:['']?(?:da|de)|\s+da|\s+de)|youtube(?:['']?(?:da|de)|\s+da|\s+de)|github(?:['']?(?:da|de)|\s+da|\s+de)|wikipedia(?:['']?(?:da|de)|\s+da|\s+de)|duckduckgo(?:['']?(?:da|de)|\s+da|\s+de))/i.test(normalized);

  if (!isExplicitEngineSearch) {
    const webResearchMatch =
      normalized.match(/^(?:web(?:['']?de|\s+üzerinde|\s+uzerinde|\s+de)?|internette?|online)\s+(?:en\s+son\s+haberleri\s+ara|haberleri\s+ara|araştır|arastir|ara|tara|bilgi\s+topla)\s*(.*)$/i) ||
      normalized.match(/^(?:search\s+(?:the\s+)?(?:latest\s+)?news\s+on\s+web|search\s+the\s+web\s+for|search\s+web\s+for|research\s+on\s+web)\s*(.*)$/i) ||
      normalized.match(/^(?:en\s+son\s+haberleri\s+ara|en\s+son\s+haberler|search\s+latest\s+news)$/i) ||
      normalized.match(/^(.+?)\s+(?:hakkında\s+araştırma\s+yap|hakkinda\s+arastirma\s+yap|konusunu\s+araştır|konusunu\s+arastir|araştırıp\s+öğren|arastirip\s+ogren|araştır|arastir|hakkında\s+bilgi\s+topla|hakkinda\s+bilgi\s+topla)$/i) ||
      normalized.match(/^(?:araştır|arastir|araştırma\s+yap|arastirma\s+yap|research|investigate|browse\s+and\s+read)\s*[:\s]\s*(.+)$/i) ||
      normalized.match(/^(?:web\s+araştırması|web\s+arastirmasi|web\s+research)\s*[:\s]?\s*(.+)$/i) ||
      normalized.match(/^(?:webde|web'de|internette)\s+(.+?)\s*(?:ara|araştır|arastir|bul)$/i);

    if (webResearchMatch) {
      let rawQuery = (webResearchMatch[1] || '').trim();
      if (!rawQuery || rawQuery === 'en son haberleri ara' || rawQuery.includes('en son haberler')) {
        rawQuery = isTr ? 'en son haberler ve gelişmeler' : 'latest news and headlines';
      }
      let cleanedQuery = rawQuery
        .replace(/^(aç|ac|ve|git|bana|lütfen|lutfen)\s+/gi, '')
        .replace(/\s+(ara|bul|araştır|arastir|bak|öğren|ogren)$/gi, '')
        .replace(/^['']?(?:da|de|ta|te|ı|i|u|ü)\s*/i, '')
        .trim();

      if (!cleanedQuery) {
        cleanedQuery = isTr ? 'en son haberler' : 'latest news';
      }

      if (cleanedQuery !== 'google' && cleanedQuery !== 'aç' && !cleanedQuery.startsWith('yeni sekme') && !cleanedQuery.startsWith('sayfa')) {
        return {
          name: 'web_research',
          arguments: { query: cleanedQuery }
        };
      }
    }
  }

  // 15. Google Search Compound & General Search (e.g. "google'da hava durumu ara", "google aç ve hava durumu ara", "istanbul hava durumu nedir")
  const googleCompoundMatch =
    normalized.match(/^google(?:['']?(?:da|de)|\s+da|\s+de)?\s+(?:aç|ac|a git|git)?\s*(?:ve|,)?\s*(?:bana\s+)?(.+?)\s*(?:ara|bul|bak|aç|ac)?$/i) ||
    normalized.match(/^(?:google'da\s+ara|google\s+ara|ara|search for|search|bana ara)\s*[:\s]\s*(.+)$/i) ||
    normalized.match(/^(.+?)\s+(?:nedir|nerede|kaç|hakkında bilgi ver|fiyatları|nasıl yapılır)$/i) ||
    normalized.match(/^(.+?)\s+(?:ara|bul|bak)$/i);

  if (googleCompoundMatch && googleCompoundMatch[1]) {
    let query = googleCompoundMatch[1]
      .replace(/^(aç|ac|ve|git)\s+/gi, '')
      .replace(/\s+(ara|bul|bak|aç|ac)$/gi, '')
      .trim();
    query = query.replace(/^['']?(?:da|de|ta|te|ı|i|u|ü)\s*/i, '').trim();
    if (query && query !== 'aç' && query !== 'ac' && query !== 'git' && query !== 'google' && !query.startsWith('yeni sekme') && !query.startsWith('sayfa')) {
      return {
        name: 'navigate_to_url',
        arguments: { url: `https://www.google.com/search?q=${encodeURIComponent(query)}` },
        directReply: isTr ? `Google'da "${query}" arandı.` : `Searched for "${query}" on Google.`
      };
    }
  }

  return null;
}

// Tool names the local agent can run. Anything else is left to the MCP
// layer's allowlist.
const REACT_KNOWN_TOOLS = [
  "navigate_to_url", "web_research", "execute_goal", "read_page_content", "get_page_url", "click_element",
  "fill_input", "manage_tabs", "scroll_page", "press_key", "take_screenshot",
  "wait", "get_page_links", "search_history", "save_to_memory", "auto_fill_form",
  "reload_page", "go_back", "go_forward"
];

/**
 * Return the JSON object that starts at `start` (which must be "{") together
 * with its matching closing brace.
 *
 * A lazy `\{[\s\S]*?\}` match stops at the first closing brace, so every
 * pretty-printed tool call whose arguments are themselves an object was cut in
 * half and failed to parse; the valid action was then dropped silently. Braces
 * inside strings must not count either, or a URL or message containing "}"
 * would end the object early.
 */
function readJsonObject(text: string, start: number): string | null {
  if (text[start] !== '{') return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth += 1;
    else if (char === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function toToolCall(parsed: unknown): { name: string; arguments: any } | null {
  if (!parsed || typeof parsed !== 'object') return null;
  const record = parsed as Record<string, any>;
  const name = typeof record.name === 'string' ? record.name
    : typeof record.tool === 'string' ? record.tool
    : typeof record.action === 'string' ? record.action
    : '';
  if (!name) return null;
  const args = record.arguments ?? record.parameters ?? record.args ?? {};
  return { name, arguments: args && typeof args === 'object' ? args : {} };
}

/** Parse the balanced JSON object that starts at `start`, if it is a tool call. */
function parseToolCallAt(text: string, start: number): { name: string; arguments: any } | null {
  const json = readJsonObject(text, start);
  if (!json) return null;
  try {
    return toToolCall(JSON.parse(json));
  } catch {
    return null;
  }
}

// Helper to parse tool calls from ReAct output across all mini and standard models
export function parseReActAction(text: string): { name: string; arguments: any } | null {
  if (!text || typeof text !== 'string') return null;

  // 1. Look for Action: {"name": "...", "arguments": {...}}, including the
  // pretty-printed form where the arguments object spans several lines.
  const actionIndex = text.search(/Action:\s*\{/i);
  if (actionIndex !== -1) {
    const call = parseToolCallAt(text, text.indexOf('{', actionIndex));
    if (call) return call;
  }

  // 2. Look for function call syntax: Action: navigate_to_url("https://...") or click_element("1")
  const funcSyntax = text.match(/Action:\s*([a-zA-Z0-9_]+)\(([\s\S]*?)\)/i) ||
                     text.match(/([a-zA-Z0-9_]+)\(([\s\S]*?)\)/i);
  if (funcSyntax) {
    const fn = funcSyntax[1];
    const rawParam = funcSyntax[2].trim();
    if (REACT_KNOWN_TOOLS.includes(fn)) {
      if (fn === 'navigate_to_url') {
        const cleaned = rawParam.replace(/^['"]|['"]$/g, '').trim();
        return { name: fn, arguments: { url: cleaned || 'https://google.com' } };
      }
      if (fn === 'web_research') {
        const cleaned = rawParam.replace(/^['"]|['"]$/g, '').trim();
        return { name: fn, arguments: { query: cleaned } };
      }
      if (fn === 'click_element') {
        const cleaned = rawParam.replace(/^['"]|['"]$/g, '').trim();
        return { name: fn, arguments: { ai_id: cleaned } };
      }
      if (fn === 'read_page_content' || fn === 'take_screenshot' || fn === 'get_page_url' || fn === 'reload_page' || fn === 'go_back' || fn === 'go_forward') {
        return { name: fn, arguments: {} };
      }
      try {
        // The arguments may already be a JSON object:
        // fill_input({"selector": "#q", "text": "hello"}). Wrapping that in
        // another brace pair produced "{{...}}" and never parsed.
        const parsed = JSON.parse(rawParam.startsWith('{') ? rawParam : `{${rawParam}}`);
        return { name: fn, arguments: parsed };
      } catch {}
    }
  }

  // 3. Look for Markdown code block ```json { "name": "...", "arguments": ... } ```
  const codeIndex = text.search(/```(?:json)?\s*\{/i);
  if (codeIndex !== -1) {
    const call = parseToolCallAt(text, text.indexOf('{', codeIndex));
    if (call) return call;
  }

  // 4. Look for <tool_call>{"name": "...", "arguments": ...}</tool_call>
  const xmlIndex = text.search(/<tool_call>\s*\{/i);
  if (xmlIndex !== -1) {
    const call = parseToolCallAt(text, text.indexOf('{', xmlIndex));
    if (call) return call;
  }

  // 5. Look for any JSON object naming a known tool. Scanning every balanced
  // object matters because the first "{" in the text may belong to unrelated
  // prose, and the tool call's own arguments are usually nested.
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] !== '{') continue;
    const json = readJsonObject(text, i);
    if (!json) continue;
    try {
      const call = toToolCall(JSON.parse(json));
      if (call && REACT_KNOWN_TOOLS.includes(call.name)) return call;
    } catch {}
    i += json.length - 1;
  }

  return null;
}
