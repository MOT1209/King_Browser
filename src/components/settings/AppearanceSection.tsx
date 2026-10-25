import React from 'react';
import { RotateCcw, Shuffle, Check, Images } from 'lucide-react';
import { UserSettings } from '../../types/browser';
import { useLiveUnsplashPhoto } from '../../utils/unsplash';
import { TabAnimationPreviewBox } from './TabAnimationPreviewBox';
import { ToggleSwitch } from './ToggleSwitch';
import { BackgroundPreviewCard, BACKGROUND_OPTIONS } from './BackgroundPreviewCard';
import { useTranslation } from '../../services/i18n';

export interface AppearanceSectionProps {
  settings: UserSettings;
  onUpdateSettings: (newSettings: Partial<UserSettings>) => void;
}

const DailyWallpaperSection = () => {
  const { l } = useTranslation();
  const { 
    photo: currentPhoto, 
    photos, 
    isUserOverride, 
    shuffleNext, 
    selectPhoto, 
    resetToDaily 
  } = useLiveUnsplashPhoto();

  return (
    <div className="mt-6 p-5 bg-white dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700/60 shadow-sm space-y-5 animate-in fade-in slide-in-from-top-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {l({ en: 'Daily 4K Wallpaper (Ultra HD)', ar: 'خلفية يومية بدقة 4K (Ultra HD)', de: 'Tägliches 4K-Hintergrundbild (Ultra HD)' })}
            </h3>
            <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-500/10 text-blue-500 rounded-full border border-blue-500/20">
              3840 × 2160 UHD
            </span>
            {isUserOverride && (
              <span className="px-2 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-500 rounded-full border border-amber-500/20">
                {l({ en: 'Custom Choice', ar: 'اختيار مخصّص', de: 'Eigene Auswahl' })}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {l({ en: 'Automatically updates daily with curated 4K photography. Synchronized across all tabs.', ar: 'تتجدد يومياً تلقائياً بصور مختارة بدقة 4K، ومتزامنة في كل التبويبات.', de: 'Wird täglich automatisch mit ausgewählten 4K-Fotos aktualisiert. In allen Tabs synchron.' })}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isUserOverride && (
            <button
              type="button"
              onClick={resetToDaily}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors shadow-sm"
              title={l({ en: 'Reset to today\'s official wallpaper', ar: 'العودة إلى خلفية اليوم الرسمية', de: 'Auf das offizielle Hintergrundbild von heute zurücksetzen' })}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>{l({ en: 'Reset to Today', ar: 'العودة إلى خلفية اليوم', de: 'Auf heute zurücksetzen' })}</span>
            </button>
          )}
          <button
            type="button"
            onClick={shuffleNext}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 transition-colors shadow-sm border border-blue-200/50 dark:border-blue-700/50"
          >
            <Shuffle className="w-3.5 h-3.5" />
            <span>{l({ en: 'Shuffle Next', ar: 'التالية عشوائياً', de: 'Nächstes zufällig' })}</span>
          </button>
        </div>
      </div>

      {currentPhoto && (
        <div className="animate-in fade-in slide-in-from-bottom-2">
          <div className="w-full aspect-video max-h-[340px] rounded-xl overflow-hidden bg-slate-900 border border-slate-700 relative group shadow-lg">
            <img 
              src={currentPhoto.imageUrl} 
              alt={currentPhoto.title}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/30 to-transparent flex items-end p-4">
              <div className="text-white flex items-center justify-between w-full">
                <div className="max-w-[70%]">
                  <p className="text-sm font-bold truncate">{currentPhoto.title}</p>
                  <p className="text-xs text-white/70 truncate">{currentPhoto.author} • {currentPhoto.source} {currentPhoto.resolution ? `(${currentPhoto.resolution})` : ''}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs px-3 py-1 rounded-full bg-emerald-500/25 border border-emerald-400/40 text-emerald-300 font-medium flex items-center gap-1.5 backdrop-blur-md shadow-sm">
                    <Check className="w-3.5 h-3.5" /> Active on New Tab
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4K Curated Gallery Grid */}
      {photos && photos.length > 0 && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-700/40 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Images className="w-3.5 h-3.5 text-blue-500" />
              4K Wallpaper Gallery ({photos.length} photos)
            </span>
            <span className="text-[11px] text-slate-400">
              {l({ en: 'Click any photo to set it immediately across all tabs', ar: 'انقر أي صورة لتعيينها فوراً في كل التبويبات', de: 'Klicken Sie auf ein Foto, um es sofort in allen Tabs zu verwenden' })}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
            {photos.map((p) => {
              const isActive = p.id === currentPhoto?.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectPhoto(p.id)}
                  className={`group relative aspect-video rounded-lg overflow-hidden border text-left transition-all ${
                    isActive 
                      ? 'ring-2 ring-blue-500 border-blue-500 shadow-md scale-[0.98]' 
                      : 'border-slate-200 dark:border-slate-700 hover:border-blue-400 hover:scale-[1.02] opacity-80 hover:opacity-100'
                  }`}
                  title={`${p.title} - ${p.author}`}
                >
                  <img
                    src={p.thumbnailUrl}
                    alt={p.title}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 transition-opacity flex flex-col justify-end p-1.5">
                    <p className="text-[10px] text-white font-medium truncate">{p.title}</p>
                    <p className="text-[9px] text-white/70 truncate">{p.author}</p>
                  </div>
                  {isActive && (
                    <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded bg-blue-600 text-white text-[9px] font-bold flex items-center gap-0.5 shadow">
                      <Check className="w-2.5 h-2.5" />
                      <span>{l({ en: 'Active', ar: 'مفعّلة', de: 'Aktiv' })}</span>
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export const AppearanceSection: React.FC<AppearanceSectionProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const { l } = useTranslation();
  return (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <section>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{l({ en: 'Theme Mode', ar: 'وضع السمة', de: 'Farbmodus' })}</h2>
                <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-2 flex gap-2">
                  {[
                    { id: 'light', label: l({ en: 'Light', ar: 'فاتح', de: 'Hell' }) },
                    { id: 'dark', label: l({ en: 'Dark', ar: 'داكن', de: 'Dunkel' }) },
                    { id: 'system', label: l({ en: 'System Default', ar: 'حسب النظام', de: 'Systemstandard' }) }
                  ].map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => onUpdateSettings({ theme: opt.id as any })}
                      className={`flex-1 py-3 px-4 rounded-xl text-sm font-medium transition-all ${
                        settings.theme === opt.id || (!settings.theme && opt.id === 'system')
                          ? 'bg-slate-900 text-white shadow-md dark:bg-blue-600 dark:text-white'
                          : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{l({ en: 'Tab Style', ar: 'نمط التبويبات', de: 'Tab-Stil' })}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {[
                    { id: 'floating', name: l({ en: 'Floating', ar: 'عائم', de: 'Schwebend' }), desc: l({ en: 'Modern & Detached', ar: 'عصري ومنفصل', de: 'Modern und losgelöst' }) },
                    { id: 'rounded', name: l({ en: 'Rounded', ar: 'مستدير', de: 'Abgerundet' }), desc: l({ en: 'Classic Chrome Style', ar: 'نمط Chrome الكلاسيكي', de: 'Klassischer Chrome-Stil' }) },
                    { id: 'square', name: l({ en: 'Square', ar: 'مربّع', de: 'Eckig' }), desc: l({ en: 'Compact & Sharp', ar: 'مدمج وحاد', de: 'Kompakt und scharf' }) }
                  ].map(ts => (
                    <button
                      key={ts.id}
                      onClick={() => onUpdateSettings({ tabStyle: ts.id as any })}
                      className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-center justify-center gap-2 ${
                        settings.tabStyle === ts.id || (!settings.tabStyle && ts.id === 'floating')
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-900 dark:text-blue-100'
                          : 'border-slate-200 dark:border-slate-700/50 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/50'
                      }`}
                    >
                      <div className="w-full h-8 bg-slate-100 dark:bg-slate-800 rounded-md relative flex items-end justify-center overflow-hidden border border-slate-200 dark:border-slate-700">
                        {ts.id === 'floating' && <div className="w-16 h-5 bg-white dark:bg-slate-700 rounded-md mb-1 shadow-sm" />}
                        {ts.id === 'rounded' && <div className="w-16 h-6 bg-white dark:bg-slate-700 rounded-t-lg" />}
                        {ts.id === 'square' && <div className="w-16 h-6 bg-white dark:bg-slate-700" />}
                      </div>
                      <div className="text-center">
                        <p className="font-semibold text-sm">{ts.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{ts.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Tab Animation', ar: 'حركة التبويبات', de: 'Tab-Animation' })}</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l({ en: 'Select a tab opening physics preset and preview its motion', ar: 'اختر نمط حركة فتح التبويب وعاين حركته', de: 'Wählen Sie eine Animation für das Öffnen von Tabs und sehen Sie sich die Vorschau an' })}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { id: 'chrome', name: l({ en: 'Chrome (Native)', ar: 'Chrome (أصلي)', de: 'Chrome (nativ)' }), desc: l({ en: 'Smooth horizontal width expansion & collapse', ar: 'توسّع وانكماش أفقي سلس', de: 'Sanftes horizontales Aus- und Einklappen' }), badge: l({ en: 'Default', ar: 'افتراضي', de: 'Standard' }) },
                    { id: 'smooth', name: l({ en: 'Fluid Spring', ar: 'نابض انسيابي', de: 'Fließende Feder' }), desc: l({ en: 'Soft floating lift with cushioned spring physics', ar: 'ارتفاع ناعم بحركة نابضية مخففة', de: 'Weiches Anheben mit gedämpfter Federphysik' }) },
                    { id: 'snappy', name: l({ en: 'Snappy', ar: 'سريع', de: 'Zackig' }), desc: l({ en: 'Crisp, high-velocity responsive motion', ar: 'حركة سريعة وحادة الاستجابة', de: 'Knackige, schnelle Bewegung' }) },
                    { id: 'none', name: l({ en: 'Instant (No Motion)', ar: 'فوري (بدون حركة)', de: 'Sofort (ohne Animation)' }), desc: l({ en: 'Immediate tab opening for maximum speed', ar: 'فتح فوري للتبويب لأقصى سرعة', de: 'Sofortiges Öffnen für maximale Geschwindigkeit' }) }
                  ].map(ta => {
                    const isSelected = (settings.tabAnimation ?? 'chrome') === ta.id;
                    return (
                      <button
                        key={ta.id}
                        onClick={() => onUpdateSettings({ tabAnimation: ta.id as any })}
                        className={`p-4 rounded-2xl border-2 transition-all flex flex-col items-start justify-between gap-3 text-left ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10 text-blue-900 dark:text-blue-100 shadow-sm'
                            : 'border-slate-200 dark:border-slate-700/50 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/50'
                        }`}
                      >
                        {/* Live Animation Preview Box */}
                        <TabAnimationPreviewBox preset={ta.id as any} isActive={isSelected} />

                        <div className="flex items-center justify-between w-full">
                          <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">{ta.name}</span>
                          {ta.badge && (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full border border-blue-500/20">
                              {ta.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{ta.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section>
                <div className="flex items-center justify-between mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Browser Color (Full UI Theme)', ar: 'لون المتصفح (سمة الواجهة كاملة)', de: 'Browserfarbe (gesamte Oberfläche)' })}</h2>
                      <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-full">
                        {l({ en: 'Beta', ar: 'تجريبي', de: 'Beta' })}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l({ en: 'Customize the entire browser chrome, frame, navigation bar, and tab surfaces', ar: 'خصّص إطار المتصفح وشريط التنقل وأسطح التبويبات بالكامل', de: 'Passen Sie Rahmen, Navigationsleiste und Tab-Flächen des gesamten Browsers an' })}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {[
                    { id: 'default', name: l({ en: 'Classic Slate', ar: 'أردوازي كلاسيكي', de: 'Klassisch Schiefer' }), desc: l({ en: 'Default King aesthetic', ar: 'مظهر King الافتراضي', de: 'Standard-Look von King' }), darkPreview: '#151122', lightPreview: '#f1f5f9', badge: l({ en: 'Default', ar: 'افتراضي', de: 'Standard' }) },
                    { id: 'midnight', name: l({ en: 'Midnight Navy', ar: 'أزرق منتصف الليل', de: 'Mitternachtsblau' }), desc: l({ en: 'Deep galactic space blue', ar: 'أزرق فضائي عميق', de: 'Tiefes Weltraumblau' }), darkPreview: '#0a0f1d', lightPreview: '#eef3f9' },
                    { id: 'cyberpunk', name: l({ en: 'Cyberpunk Violet', ar: 'بنفسجي سايبربانك', de: 'Cyberpunk-Violett' }), desc: l({ en: 'Futuristic neon purple tone', ar: 'درجة أرجوانية نيونية مستقبلية', de: 'Futuristisches Neonviolett' }), darkPreview: '#0d071a', lightPreview: '#f7f2fe' },
                    { id: 'forest', name: l({ en: 'Emerald Forest', ar: 'غابة زمردية', de: 'Smaragdwald' }), desc: l({ en: 'Rich organic botanical green', ar: 'أخضر نباتي غني', de: 'Sattes, natürliches Grün' }), darkPreview: '#04140e', lightPreview: '#f0f7f4' },
                    { id: 'crimson', name: l({ en: 'Crimson Ruby', ar: 'ياقوتي قرمزي', de: 'Karminrubin' }), desc: l({ en: 'Velvet burgundy wine red', ar: 'أحمر نبيذي مخملي', de: 'Samtiges Weinrot' }), darkPreview: '#160509', lightPreview: '#fcf1f3' },
                    { id: 'warm', name: l({ en: 'Warm Mocha', ar: 'موكا دافئ', de: 'Warmes Mokka' }), desc: l({ en: 'Cozy espresso coffee tone', ar: 'درجة قهوة إسبريسو دافئة', de: 'Gemütlicher Espresso-Ton' }), darkPreview: '#140e0b', lightPreview: '#f8f4f0' },
                    { id: 'ocean', name: l({ en: 'Deep Ocean', ar: 'محيط عميق', de: 'Tiefsee' }), desc: l({ en: 'Calm abyssal teal & cyan', ar: 'أزرق مخضرّ هادئ', de: 'Ruhiges Petrol und Cyan' }), darkPreview: '#041217', lightPreview: '#eef7f9' },
                    { id: 'sunset', name: l({ en: 'Sunset Amber', ar: 'كهرماني الغروب', de: 'Sonnenuntergang' }), desc: l({ en: 'Warm dusk twilight glow', ar: 'وهج غروب دافئ', de: 'Warmes Abendrot' }), darkPreview: '#170b03', lightPreview: '#faf3ec' },
                    { id: 'custom', name: l({ en: 'Custom Color', ar: 'لون مخصّص', de: 'Eigene Farbe' }), desc: l({ en: 'Choose your own hex color', ar: 'اختر لونك الخاص (hex)', de: 'Eigene Hex-Farbe wählen' }), darkPreview: settings.customBrowserColor || '#6366f1', lightPreview: settings.customBrowserColor || '#6366f1' }
                  ].map(bc => {
                    const isSelected = (settings.browserColor ?? 'default') === bc.id;
                    return (
                      <button
                        key={bc.id}
                        onClick={() => onUpdateSettings({ browserColor: bc.id as any })}
                        className={`p-3.5 rounded-2xl border-2 transition-all flex flex-col gap-3 text-left relative overflow-hidden ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50/70 dark:bg-blue-500/10 shadow-sm'
                            : 'border-slate-200 dark:border-slate-700/50 hover:border-slate-300 dark:hover:border-slate-600 bg-white dark:bg-slate-800/40'
                        }`}
                      >
                        {/* Mini browser mockup preview */}
                        <div 
                          className="w-full h-16 rounded-xl border border-black/10 dark:border-white/10 p-1.5 flex flex-col gap-1 overflow-hidden shadow-xs relative"
                          style={{ backgroundColor: settings.theme === 'light' ? bc.lightPreview : bc.darkPreview }}
                        >
                          {/* Topbar mini header */}
                          <div className="flex items-center gap-1 w-full h-4">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-400/80" />
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400/80" />
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400/80" />
                            <div className="ml-1.5 w-14 h-2.5 rounded-t bg-white/20 dark:bg-white/15" />
                          </div>
                          {/* Mini omnibox & content */}
                          <div className="flex items-center gap-1 w-full h-3 px-1 rounded bg-black/10 dark:bg-white/10">
                            <div className="w-2 h-1.5 rounded-xs bg-current opacity-30" />
                            <div className="w-12 h-1 rounded-full bg-current opacity-20" />
                          </div>
                          <div className="flex-1 rounded bg-white/40 dark:bg-black/20" />
                        </div>

                        <div className="flex items-center justify-between w-full">
                          <div>
                            <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">{bc.name}</span>
                            <p className="text-xs text-slate-500 dark:text-slate-400 leading-snug mt-0.5">{bc.desc}</p>
                          </div>
                          {bc.badge && (
                            <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 rounded-full border border-blue-500/20 shrink-0">
                              {bc.badge}
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {settings.browserColor === 'custom' && (
                  <div className="mt-4 p-4 rounded-2xl bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 flex flex-wrap items-center gap-4 animate-in fade-in slide-in-from-top-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{l({ en: 'Custom Browser Color Picker:', ar: 'منتقي لون المتصفح:', de: 'Browserfarbe wählen:' })}</label>
                    <div className="flex items-center gap-3">
                      <input 
                        type="color" 
                        value={settings.customBrowserColor || '#6366f1'}
                        onChange={(e) => onUpdateSettings({ customBrowserColor: e.target.value })}
                        className="w-10 h-10 rounded-xl cursor-pointer border-none p-0 bg-transparent"
                      />
                      <input
                        type="text"
                        value={settings.customBrowserColor || '#6366f1'}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (/^#[0-9a-fA-F]{0,8}$/.test(val)) {
                            onUpdateSettings({ customBrowserColor: val });
                          }
                        }}
                        className="w-28 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-mono text-slate-800 dark:text-slate-200 focus:outline-none focus:border-blue-500"
                        placeholder="#6366f1"
                      />
                    </div>
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                      {l({ en: 'The browser automatically calculates frame, toolbar, and tab surfaces with optimal contrast.', ar: 'يحسب المتصفح تلقائياً ألوان الإطار وشريط الأدوات والتبويبات بأفضل تباين.', de: 'Der Browser berechnet Rahmen, Symbolleiste und Tab-Flächen automatisch mit optimalem Kontrast.' })}
                    </span>
                  </div>
                )}
              </section>

              <section>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{l({ en: 'Accent Color', ar: 'لون التمييز', de: 'Akzentfarbe' })}</h2>
                <div className="flex gap-4 p-4 bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50">
                  {[
                    { id: 'blue', color: 'bg-[#3b82f6]' },
                    { id: 'emerald', color: 'bg-[#10b981]' },
                    { id: 'purple', color: 'bg-[#a855f7]' },
                    { id: 'rose', color: 'bg-[#f43f5e]' },
                    { id: 'amber', color: 'bg-[#f59e0b]' },
                    { id: 'custom', color: 'bg-slate-200 dark:bg-slate-700' }
                  ].map(c => (
                    <button
                      key={c.id}
                      onClick={() => onUpdateSettings({ accentColor: c.id as any })}
                      className={`w-12 h-12 rounded-full ${c.color} shadow-lg transition-transform hover:scale-110 flex items-center justify-center relative`}
                    >
                      {c.id === 'custom' && (
                        <div 
                          className="absolute inset-0 rounded-full flex items-center justify-center" 
                          style={{ backgroundColor: settings.customAccentColor || '#3b82f6' }} 
                        />
                      )}
                      {settings.accentColor === c.id && <div className="w-4 h-4 bg-white rounded-full opacity-90 z-10" />}
                    </button>
                  ))}
                </div>
                {settings.accentColor === 'custom' && (
                  <div className="mt-4 flex items-center gap-4 animate-in fade-in slide-in-from-top-2">
                    <label className="text-sm font-medium text-slate-700 dark:text-slate-300">{l({ en: 'Custom Color Picker:', ar: 'منتقي اللون:', de: 'Farbe wählen:' })}</label>
                    <input 
                      type="color" 
                      value={settings.customAccentColor || '#3b82f6'}
                      onChange={(e) => onUpdateSettings({ customAccentColor: e.target.value })}
                      className="w-12 h-12 rounded cursor-pointer border-none p-0 bg-transparent"
                    />
                  </div>
                )}
              </section>

              <section>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{l({ en: 'New Tab Background', ar: 'خلفية التبويب الجديد', de: 'Hintergrund für neue Tabs' })}</h2>

                <div className="grid grid-cols-2 gap-4">
                  {BACKGROUND_OPTIONS.map(bg => (
                    <BackgroundPreviewCard
                      key={bg.id}
                      bg={bg}
                      isSelected={settings.newTabBackground === bg.id || (!settings.newTabBackground && bg.id === 'default')}
                      onSelect={() => onUpdateSettings({ newTabBackground: bg.id as any })}
                    />
                  ))}
                </div>

                {settings.newTabBackground === 'unsplash' && (
                  <DailyWallpaperSection />
                )}
                {settings.newTabBackground === 'custom_url' && (
                  <div className="mt-4 animate-in fade-in slide-in-from-top-2">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{l({ en: 'Video / Image URL:', ar: 'رابط الفيديو أو الصورة:', de: 'Video- oder Bild-URL:' })}</label>
                    <input 
                      type="text" 
                      value={settings.backgroundCustomUrl || ''}
                      onChange={(e) => onUpdateSettings({ backgroundCustomUrl: e.target.value })}
                      className="w-full px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm outline-none focus:border-blue-500"
                      placeholder={l({ en: 'e.g. https://example.com/video.mp4', ar: 'مثلاً https://example.com/video.mp4', de: 'z. B. https://example.com/video.mp4' })}
                    />
                  </div>
                )}
              </section>

              <section>
                <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">{l({ en: 'Layout & Navigation', ar: 'التخطيط والتنقل', de: 'Layout & Navigation' })}</h2>
                <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 divide-y divide-slate-100 dark:divide-slate-700/50">
                  <div className="p-5 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Bookmarks Bar', ar: 'شريط الإشارات المرجعية', de: 'Lesezeichenleiste' })}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l({ en: 'Show favorite sites below address bar', ar: 'عرض المواقع المفضلة أسفل شريط العنوان', de: 'Lieblingsseiten unter der Adressleiste anzeigen' })}</div>
                    </div>
                    <ToggleSwitch
                      ariaLabel={l({ en: 'Toggle bookmarks bar', ar: 'تشغيل أو إيقاف شريط الإشارات المرجعية', de: 'Lesezeichenleiste umschalten' })}
                      checked={settings.showBookmarksBar}
                      onToggle={() => onUpdateSettings({ showBookmarksBar: !settings.showBookmarksBar })}
                    />
                  </div>
                  
                  <div className="p-5 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Vertical Tabs', ar: 'تبويبات عمودية', de: 'Vertikale Tabs' })}</span>
                        <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-full">
                          {l({ en: 'Beta', ar: 'تجريبي', de: 'Beta' })}
                        </span>
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l({ en: 'Display tabs on the left sidebar instead of the top', ar: 'عرض التبويبات في شريط جانبي بدلاً من الأعلى', de: 'Tabs in der Seitenleiste statt oben anzeigen' })}</div>
                    </div>
                    <ToggleSwitch
                      ariaLabel={l({ en: 'Toggle vertical tabs', ar: 'تشغيل أو إيقاف التبويبات العمودية', de: 'Vertikale Tabs umschalten' })}
                      checked={settings.useVerticalTabs}
                      onToggle={() => onUpdateSettings({ useVerticalTabs: !settings.useVerticalTabs })}
                    />
                  </div>
                  
                  <div className="p-5 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Tasks Widget', ar: 'أداة المهام', de: 'Aufgaben-Widget' })}</div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{l({ en: 'Show tasks and to-do list on the New Tab Page', ar: 'عرض المهام وقائمة الأعمال في صفحة التبويب الجديد', de: 'Aufgaben und To-do-Liste auf der Seite „Neuer Tab“ anzeigen' })}</div>
                    </div>
                    <ToggleSwitch
                      ariaLabel={l({ en: 'Toggle tasks widget', ar: 'تشغيل أو إيقاف أداة المهام', de: 'Aufgaben-Widget umschalten' })}
                      checked={settings.showTasksWidget !== false}
                      onToggle={() => onUpdateSettings({ showTasksWidget: settings.showTasksWidget === false ? true : false })}
                    />
                  </div>
                </div>
              </section>
            </div>
  );
};
