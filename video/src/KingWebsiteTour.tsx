import React, { useEffect, useState } from 'react';
import { AbsoluteFill, Audio, Img, Sequence, continueRender, delayRender, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { DeviceMotion, FrameLines, PlatformMotion, SourceMotion, WordReveal, WorkspaceMotion } from './components/TourMotion';

export type TourLanguage = 'en' | 'ar' | 'de';

const PAPER = '#fafaf7';
const INK = '#202824';
const MUTED = '#69716c';
const BLUE = '#285be8';
const SITE = 'king-browser.vercel.app';
const asset = (name: string) => staticFile(`king-tour/${name}`);
const ease = (x: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
const progress = (frame: number, start = 0, length = 30) => ease((frame - start) / length);

/** On-screen text for each language. The film has music only, so this text carries the whole story. */
const COPY = {
  en: {
    introTitle: 'A browser that feels like yours.', introText: 'A clean start. Your own way to explore.',
    workTitle: 'A clearer view of your day.', workDetail: 'Vertical tabs · Folders · Workspaces',
    workLabel: 'A PLACE FOR EVERY PROJECT', workspaces: ['Personal', 'Work', 'Research'],
    aiTitle: 'A little help, right where you are.', aiDetail: 'Local models · WebGPU',
    deviceTitle: 'On your device.', deviceDetail: ['Local inference', 'Powered by WebGPU'] as [string, string],
    aiNote: 'Model download and compatible hardware required.',
    openEyebrow: 'BUILT IN THE OPEN', openTitle: ['Yours to use.', 'Open to explore.'], openText: 'Free. Open source. Licensed under MIT.',
    languages: 'In Arabic, English and German.',
    outroTitle: 'Make room for King.', outroText: 'Free for macOS, Windows & Linux',
    chapters: ['Introduction', 'Your workspaces', 'Local intelligence', 'Open source', 'Make room'],
  },
  ar: {
    introTitle: 'متصفح تشعر أنه لك.', introText: 'بداية نظيفة. وطريقتك الخاصة في الاستكشاف.',
    workTitle: 'نظرة أوضح على يومك.', workDetail: 'تبويبات عمودية · مجلدات · مساحات عمل',
    workLabel: 'مكان لكل مشروع', workspaces: ['شخصي', 'العمل', 'البحث'],
    aiTitle: 'مساعدة صغيرة، حيث أنت.', aiDetail: 'نماذج محلية · WebGPU',
    deviceTitle: 'على جهازك.', deviceDetail: ['معالجة محلية', 'بقوة WebGPU'] as [string, string],
    aiNote: 'يتطلب تنزيل نموذج وعتاداً متوافقاً.',
    openEyebrow: 'يُبنى في العلن', openTitle: ['لك لتستخدمه.', 'ومفتوح لتستكشفه.'], openText: 'مجاني. مفتوح المصدر. مرخّص بموجب MIT.',
    languages: 'بالعربية والإنجليزية والألمانية.',
    outroTitle: 'أفسح مكاناً لـ King.', outroText: 'مجاني لأنظمة macOS وWindows وLinux',
    chapters: ['البداية', 'مساحات عملك', 'ذكاء محلي', 'مفتوح المصدر', 'أفسح مكاناً'],
  },
  de: {
    introTitle: 'Ein Browser, der sich wie Ihrer anfühlt.', introText: 'Ein klarer Start. Ihre eigene Art zu entdecken.',
    workTitle: 'Ein klarerer Blick auf Ihren Tag.', workDetail: 'Vertikale Tabs · Ordner · Arbeitsbereiche',
    workLabel: 'EIN PLATZ FÜR JEDES PROJEKT', workspaces: ['Privat', 'Arbeit', 'Recherche'],
    aiTitle: 'Ein wenig Hilfe, genau dort, wo Sie sind.', aiDetail: 'Lokale Modelle · WebGPU',
    deviceTitle: 'Auf Ihrem Gerät.', deviceDetail: ['Lokale Inferenz', 'Mit WebGPU'] as [string, string],
    aiNote: 'Modell-Download und kompatible Hardware erforderlich.',
    openEyebrow: 'OFFEN ENTWICKELT', openTitle: ['Für Sie gemacht.', 'Offen zum Entdecken.'], openText: 'Kostenlos. Open Source. Unter der MIT-Lizenz.',
    languages: 'Auf Arabisch, Englisch und Deutsch.',
    outroTitle: 'Schaffen Sie Platz für King.', outroText: 'Kostenlos für macOS, Windows und Linux',
    chapters: ['Einführung', 'Ihre Arbeitsbereiche', 'Lokale Intelligenz', 'Open Source', 'Platz schaffen'],
  },
} satisfies Record<TourLanguage, unknown>;

type Copy = (typeof COPY)['en'];

const Reveal: React.FC<{ children: React.ReactNode; delay?: number; style?: React.CSSProperties }> = ({ children, delay = 0, style }) => {
  const p = progress(useCurrentFrame(), delay, 30);
  return <div style={{ opacity: p, transform: `translateY(${(1 - p) * 20}px)`, ...style }}>{children}</div>;
};

const Shot: React.FC<{ duration: number; children: React.ReactNode; background?: string }> = ({ duration, children, background = PAPER }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 18, duration - 19, duration - 1], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
  return <AbsoluteFill style={{ opacity, backgroundColor: background }}>{children}</AbsoluteFill>;
};

/** The King mark and wordmark. The wordmark is a logo, so it stays left to right in every language. */
const Mark: React.FC<{ size: number }> = ({ size }) => {
  const frame = useCurrentFrame();
  const p = progress(frame, 3, 34);
  return <div style={{ display: 'flex', alignItems: 'center', gap: size * .2, direction: 'ltr' }}>
    <Img src={asset('king-icon.png')} style={{ width: size * .82, height: size * .82, borderRadius: size * .2, opacity: p, transform: `scale(${.86 + p * .14}) rotate(${(1 - p) * -8}deg)`, boxShadow: '0 14px 34px #1d2b4a2a' }} />
    <span style={{ fontFamily: '"King Manrope", sans-serif', fontSize: size, letterSpacing: '-.065em', fontWeight: 650, lineHeight: 1 }}>king<span style={{ color: BLUE }}>.</span></span>
  </div>;
};

const Identity: React.FC<{ copy: Copy; ending?: boolean; tight: string }> = ({ copy, ending = false, tight }) => <AbsoluteFill style={{ backgroundColor: PAPER, alignItems: 'center', justifyContent: 'center', opacity: progress(useCurrentFrame()) }}>
  <FrameLines ending={ending} />
  <Reveal style={{ position: 'relative' }}><Mark size={164} /></Reveal>
  <h1 style={{ position: 'relative', fontSize: 70, letterSpacing: tight, lineHeight: 1.3, fontWeight: 500, margin: '38px 0 0' }}><WordReveal text={ending ? copy.outroTitle : copy.introTitle} delay={14} /></h1>
  <Reveal delay={24}><p style={{ color: ending ? BLUE : MUTED, fontSize: 27, marginTop: 30, direction: ending ? 'ltr' : undefined }}>{ending ? SITE : copy.introText}</p></Reveal>
  {ending && <Reveal delay={35}><p style={{ fontSize: 22, color: MUTED, marginTop: 28 }}>{copy.outroText}</p></Reveal>}
</AbsoluteFill>;

const Product: React.FC<{ copy: Copy; lang: TourLanguage; rtl: boolean; tight: string; assistant?: boolean }> = ({ copy, lang, rtl, tight, assistant = false }) => {
  const frame = useCurrentFrame();
  const settle = progress(frame, 12, 65);
  const zoom = interpolate(frame, [0, 270], [1, 1.018], { extrapolateRight: 'clamp' });
  return <Shot duration={288} background={assistant ? '#edf2fa' : '#f2f5ef'}>
    <div style={{ position: 'absolute', left: 104, top: 116, right: 104, display: 'flex', justifyContent: 'space-between', alignItems: 'end', gap: 40 }}>
      <Reveal><h1 style={{ fontSize: 57, lineHeight: 1.25, letterSpacing: tight, fontWeight: 500, margin: 0 }}>{assistant ? copy.aiTitle : copy.workTitle}</h1></Reveal>
      <Reveal delay={14}><p style={{ fontSize: 21, color: MUTED, margin: '0 0 8px', textAlign: rtl ? 'left' : 'right', lineHeight: 1.5, whiteSpace: 'nowrap' }}>{assistant ? copy.aiDetail : copy.workDetail}</p></Reveal>
    </div>
    {assistant
      ? <DeviceMotion title={copy.deviceTitle} detail={copy.deviceDetail} rtl={rtl} />
      : <WorkspaceMotion title={copy.workLabel} labels={copy.workspaces} rtl={rtl} />}
    <div style={{ position: 'absolute', left: 336, top: 242 + (1 - settle) * 25, width: 1248, height: 780, borderRadius: 18, overflow: 'hidden', border: '1px solid #c7d0dc', boxShadow: '0 18px 48px #25314118', opacity: progress(frame, 8), transform: `scale(${zoom})`, transformOrigin: 'center center' }}>
      <Img src={asset(`${assistant ? 'assistant' : 'workspaces'}-${lang}.jpg`)} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }} />
    </div>
    {assistant && <div style={{ position: 'absolute', [rtl ? 'left' : 'right']: 50, bottom: 18, color: MUTED, fontSize: 14 }}>{copy.aiNote}</div>}
  </Shot>;
};

const Open: React.FC<{ copy: Copy; rtl: boolean; tight: string }> = ({ copy, rtl, tight }) => <Shot duration={213}>
  <AbsoluteFill style={{ justifyContent: 'center', padding: '0 180px' }}>
    <Reveal><p style={{ color: BLUE, fontSize: 24, letterSpacing: rtl ? 0 : '.08em', marginBottom: 32 }}>{copy.openEyebrow}</p></Reveal>
    <Reveal delay={10}><h1 style={{ fontSize: 100, letterSpacing: tight, fontWeight: 500, lineHeight: 1.22, margin: 0 }}>{copy.openTitle[0]}<br /><span style={{ color: MUTED }}>{copy.openTitle[1]}</span></h1></Reveal>
    <Reveal delay={22}><p style={{ fontSize: 30, color: MUTED, marginTop: 38 }}>{copy.openText}<br /><span style={{ color: INK }}>{copy.languages}</span></p></Reveal>
    <PlatformMotion />
  </AbsoluteFill>
  <SourceMotion rtl={rtl} />
</Shot>;

export const KingWebsiteTour: React.FC<{ lang: TourLanguage }> = ({ lang }) => {
  const frame = useCurrentFrame();
  const copy = COPY[lang];
  const rtl = lang === 'ar';
  // Negative tracking suits Manrope but breaks the joins between Arabic letters.
  const tight = rtl ? '0' : '-.04em';
  const chapter = frame < 165 ? 0 : frame < 435 ? 1 : frame < 705 ? 2 : frame < 900 ? 3 : 4;
  const [fontHandle] = useState(() => delayRender('Loading King film fonts'));
  useEffect(() => {
    Promise.all([document.fonts.load('500 96px "King Manrope"'), document.fonts.load('500 96px "King Arabic"', 'كينج')])
      .then(() => continueRender(fontHandle)).catch(() => continueRender(fontHandle));
  }, [fontHandle]);
  return <AbsoluteFill dir={rtl ? 'rtl' : 'ltr'} lang={lang} style={{ backgroundColor: PAPER, color: INK, fontFamily: rtl ? '"King Arabic", "King Manrope", sans-serif' : '"King Manrope", sans-serif', overflow: 'hidden' }}>
    <style>{`@font-face{font-family:"King Manrope";src:url("${staticFile('website-tour/manrope.woff2')}") format("woff2");font-weight:200 800;font-display:block}
@font-face{font-family:"King Arabic";src:url("${asset('noto-sans-arabic.woff2')}") format("woff2");font-weight:100 900;font-display:block}`}</style>
    <Audio src={staticFile('website-tour/score.wav')} volume={f => interpolate(f, [0, 30, 990, 1080], [0, .55, .55, 0], { extrapolateRight: 'clamp' })} />
    <Sequence from={0} durationInFrames={183}><Identity copy={copy} tight={tight} /></Sequence>
    <Sequence from={165} durationInFrames={288}><Product copy={copy} lang={lang} rtl={rtl} tight={tight} /></Sequence>
    <Sequence from={435} durationInFrames={288}><Product copy={copy} lang={lang} rtl={rtl} tight={tight} assistant /></Sequence>
    <Sequence from={705} durationInFrames={213}><Open copy={copy} rtl={rtl} tight={tight} /></Sequence>
    <Sequence from={900} durationInFrames={180}><Identity copy={copy} tight={tight} ending /></Sequence>
    <div style={{ position: 'absolute', [rtl ? 'right' : 'left']: 52, top: 36 }}><Mark size={27} /></div>
    <div style={{ position: 'absolute', top: 43, [rtl ? 'left' : 'right']: 52, fontSize: 14, letterSpacing: rtl ? 0 : '.08em', color: MUTED }}>{`0${chapter + 1} / ${copy.chapters[chapter].toUpperCase()}`}<div style={{ height: 2, marginTop: 14, width: 220, backgroundColor: '#d5ded6', marginInlineStart: 'auto' }}><div style={{ height: '100%', backgroundColor: BLUE, width: `${frame / 1079 * 100}%` }} /></div></div>
  </AbsoluteFill>;
};
