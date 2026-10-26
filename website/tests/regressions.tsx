import assert from 'node:assert/strict'
import { JSDOM } from 'jsdom'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import App, { initialLanguage, platforms, VERSION } from '../src/App'
import { copy, languages } from '../src/content'
import pkg from '../../package.json'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

/** Expand electron-builder's ${version}/${arch}/${ext} for the arch and extension a download link names. */
function expectedNames(template: string, ext: string) {
  const arches = ['x64', 'arm64', 'x86_64', 'amd64']
  return arches.map(arch => template.replace('${version}', pkg.version).replace('${arch}', arch).replace('${ext}', ext))
}

function assertDownloadNamesMatchBuildConfig() {
  const b = pkg.build as any
  const templates: Record<string, string[]> = {
    exe: [b.nsis.artifactName, b.win.artifactName],
    dmg: [b.mac.artifactName],
    AppImage: [b.linux.artifactName],
    deb: [b.linux.artifactName],
  }
  assert.equal(VERSION, pkg.version, 'Website version comes from package.json')
  for (const platform of platforms) {
    for (const choice of platform.choices) {
      const ext = choice.type.replace('.', '')
      const ok = templates[ext].some(t => expectedNames(t, ext).includes(choice.file))
      assert.ok(ok, `Download file ${choice.file} matches no artifactName in package.json`)
    }
  }
}

/** Every language must carry the same keys and the same list lengths as English, so no screen falls back to an empty string. */
/** Each site language has its own rendered film and poster. */
function assertFilmsExist() {
  for (const { code } of languages) {
    for (const file of [`king-tour.${code}.mp4`, `king-tour.${code}.poster.jpg`]) {
      assert.ok(existsSync(join(process.cwd(), 'public/images', file)), `Missing website film asset: ${file}`)
    }
  }
}

function assertCopyParity() {
  assert.deepEqual(languages.map(l => l.code).sort(), ['ar', 'de', 'en'])
  assert.deepEqual(Object.keys(copy).sort(), ['ar', 'de', 'en'], 'Site languages are Arabic, English and German')
  const en = copy.en as Record<string, unknown>
  for (const code of ['ar', 'de'] as const) {
    const other = copy[code] as Record<string, unknown>
    assert.deepEqual(Object.keys(other).sort(), Object.keys(en).sort(), `${code} copy has the same keys as English`)
    for (const [key, value] of Object.entries(en)) {
      const translated = other[key]
      if (Array.isArray(value)) {
        assert.ok(Array.isArray(translated) && translated.length === value.length, `${code}.${key} has ${value.length} entries`)
        assert.ok(JSON.stringify(translated).replace(/[\[\]",]/g, '').trim().length > 0, `${code}.${key} is not empty`)
      } else {
        assert.ok(typeof translated === 'string' && translated.trim().length > 0, `${code}.${key} is not empty`)
      }
    }
  }
}

async function run() {
  assertDownloadNamesMatchBuildConfig()
  assertCopyParity()
  assertFilmsExist()
  const dom = new JSDOM('<div id="root"></div>', { url: 'http://localhost/' })
  const w = dom.window
  Object.assign(globalThis, { window: w, document: w.document, localStorage: w.localStorage, Node: w.Node, IS_REACT_ACT_ENVIRONMENT: true })
  const mediaListeners = new Set<Function>()
  w.matchMedia = ((query: string) => ({ matches: false, media: query, addEventListener: (_: string, fn: Function) => { if (query.includes('min-width')) mediaListeners.add(fn) }, removeEventListener: (_: string, fn: Function) => mediaListeners.delete(fn) })) as any
  w.requestAnimationFrame = (() => 1) as any
  w.cancelAnimationFrame = () => {}
  Object.defineProperty(w.HTMLDialogElement.prototype, 'showModal', { value() { this.open = true } })
  Object.defineProperty(w.HTMLDialogElement.prototype, 'close', { value() { this.open = false; this.dispatchEvent(new w.Event('close')) } })
  let loads = 0
  w.HTMLMediaElement.prototype.pause = () => {}
  w.HTMLMediaElement.prototype.load = () => { loads++ }
  // Node exposes the machine's own language as navigator.language; pin it so
  // the fallback checks do not depend on where the tests run.
  Object.defineProperty(globalThis, 'navigator', { value: { language: 'en-US', languages: ['en-US'] }, configurable: true })
  w.localStorage.setItem('king-language', 'tr')
  assert.equal(initialLanguage(), 'en', 'A saved Turkish choice from the old site falls back to English')
  w.localStorage.setItem('king-language', 'de')
  assert.equal(initialLanguage(), 'de', 'A saved language wins')
  Object.defineProperty(globalThis, 'location', { value: { search: '?lang=ar' }, configurable: true })
  assert.equal(initialLanguage(), 'ar', 'A ?lang= link (the hreflang URLs) wins over a saved choice')
  Object.defineProperty(globalThis, 'location', { value: { search: '?lang=tr' }, configurable: true })
  assert.equal(initialLanguage(), 'de', 'An unsupported ?lang= is ignored')
  delete (globalThis as any).location
  w.localStorage.removeItem('king-language')
  const root = createRoot(document.getElementById('root')!)
  await act(async () => root.render(<App />))
  const click = async (el: Element | null) => { assert.ok(el); await act(async () => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }))) }
  const button = (label: string) => [...document.querySelectorAll('button')].find(el => el.textContent === label)!
  const references = () => {
    for (const el of document.querySelectorAll('[aria-controls]')) assert.ok(document.getElementById(el.getAttribute('aria-controls')!), `Missing panel: ${el.getAttribute('aria-controls')}`)
  }
  references()
  const tour = document.getElementById('tour-tab-0')!
  await act(async () => tour.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'End', bubbles: true })))
  assert.equal(document.activeElement?.id, 'tour-tab-2')
  assert.equal(document.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby'), 'tour-tab-2')
  references()
  assert.equal(document.getElementById('platform-tab-0')?.textContent, 'Windows', 'Windows is listed first')
  assert.equal(document.getElementById('platform-tab-0')?.getAttribute('aria-selected'), 'true', 'Windows is selected by default')
  assert.ok(document.querySelector('.unsigned-note'), 'Unsigned-build install help must be visible')
  const downloadLinks = [...document.querySelectorAll('.download-file')]
  assert.equal(downloadLinks.length, 2, 'Windows platform must offer both Setup and Portable choices')
  await click(document.getElementById('platform-tab-1'))
  assert.equal(document.getElementById('platform-tab-1')?.textContent, 'macOS')
  await click(document.getElementById('platform-tab-2'))
  references()
  const menu = document.querySelector('.menu-button')!
  await click(menu)
  assert.equal(menu.getAttribute('aria-expanded'), 'true')
  const mobileCta = document.querySelector('.mobile-menu-cta')
  assert.ok(mobileCta, 'Mobile navigation menu must include a direct download CTA')
  assert.equal(mobileCta.getAttribute('href'), '#download')
  await act(async () => document.querySelector('main')!.dispatchEvent(new w.MouseEvent('pointerdown', { bubbles: true })))
  assert.equal(menu.getAttribute('aria-expanded'), 'false', 'Outside click must dismiss the mobile menu')
  await click(menu)
  await act(async () => w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })))
  assert.equal(document.activeElement, menu, 'Escape returns focus to the menu button')
  await click(menu)
  await act(async () => mediaListeners.forEach(fn => fn({ matches: true })))
  assert.equal(menu.getAttribute('aria-expanded'), 'false', 'Desktop breakpoint closes stale mobile navigation')
  document.body.style.overflow = 'clip'
  await click(button('Take a closer look'))
  const video = document.querySelector('video')!
  assert.equal(document.body.style.overflow, 'hidden')
  assert.equal(video.getAttribute('src'), '/images/king-tour.en.mp4', 'The film matches the page language')
  assert.equal(video.getAttribute('poster'), '/images/king-tour.en.poster.jpg')
  await act(async () => video.dispatchEvent(new w.Event('error')))
  assert.ok(document.querySelector('[role="alert"]'), 'Failed media needs a visible recovery state')
  await click(button('Retry video'))
  assert.equal(loads, 1)
  await click(document.querySelector('.video-heading button'))
  assert.equal(document.body.style.overflow, 'clip', 'Closing restores previous overflow')
  const picker = document.querySelector('.language-button select') as HTMLSelectElement
  assert.ok(picker, 'Language picker is present')
  await act(async () => { picker.value = 'ar'; picker.dispatchEvent(new w.Event('change', { bubbles: true })) })
  assert.equal(document.documentElement.lang, 'ar')
  assert.equal(document.documentElement.dir, 'rtl', 'Arabic switches the page to right-to-left')
  assert.equal(document.title, copy.ar.pageTitle)
  assert.equal(document.querySelector('video')?.getAttribute('src'), '/images/king-tour.ar.mp4', 'Arabic visitors get the Arabic film')
  assert.equal(w.localStorage.getItem('king-language'), 'ar', 'The choice is remembered')
  assert.ok(document.querySelector('#hero-title')?.textContent?.includes(copy.ar.hero[0]), 'Arabic copy is rendered')
  await act(async () => { picker.value = 'de'; picker.dispatchEvent(new w.Event('change', { bubbles: true })) })
  assert.equal(document.documentElement.dir, 'ltr', 'German is left-to-right')
  assert.equal(document.querySelector('.hero-intro')?.textContent, copy.de.intro)
  await act(async () => { picker.value = 'en'; picker.dispatchEvent(new w.Event('change', { bubbles: true })) })
  await click(button('Take a closer look'))
  await act(async () => root.unmount())
  assert.equal(document.body.style.overflow, 'clip', 'Unmount while open must release scroll lock')
  console.log('[PASS] Website languages (ar/en/de, RTL, per-language film), tab references, keyboard navigation, mobile menu, media recovery and scroll-lock cleanup.')
  dom.window.close()
}
run().then(() => process.exit(0)).catch(error => { console.error(error); process.exit(1) })
