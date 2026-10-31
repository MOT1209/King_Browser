import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Search, Pencil, Trash2, FlaskConical, Download, Upload, ChevronDown, X, Wrench } from 'lucide-react';
import { useTranslation } from '../../services/i18n';
import { showConfirm } from '../../utils/confirmDialog';
import { useDialogA11y } from '../../hooks/useDialogA11y';
import type {
  McpBuiltInToolView, McpCustomToolInput, McpCustomToolView, McpToolParameter, McpToolRegistry
} from '../../types/mcpTools';

/**
 * Settings -> MCP -> Tool Manager.
 *
 * The renderer only edits and displays. Validation, storage, credentials, the
 * approval gate and execution all live in the main process (electron/main/
 * customTools.ts); a credential typed here is sent once and never read back.
 * Built-in tools can be switched off but not deleted: they are the browser's own
 * implementation, and deleting them would break it.
 */

const NAME_PREFIX = 'custom_';
// Sample identifiers shown as placeholders; they are code, not translatable text.
const SAMPLE_NAME = 'weather';
const SAMPLE_PARAM = 'id';
type Filter = 'all' | 'active' | 'disabled' | 'custom' | 'built-in';
type SortKey = 'name' | 'status' | 'type';

interface Row {
  key: string;
  name: string;
  description: string;
  custom: boolean;
  enabled: boolean;
  level: string;
  custom_view?: McpCustomToolView;
  builtin_view?: McpBuiltInToolView;
}

const api = () => (window as any).electronAPI;

const INPUT_CLASS = 'w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500/40';
const BUTTON_GHOST = 'px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50';

const ToggleSwitch: React.FC<{ checked: boolean; label: string; disabled?: boolean; onChange: () => void }> = ({ checked, label, disabled, onChange }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    disabled={disabled}
    onClick={onChange}
    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors disabled:opacity-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${checked ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-600'}`}
  >
    <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition ${checked ? 'translate-x-4 rtl:-translate-x-4' : 'translate-x-0'}`} />
  </button>
);

// ---------------------------------------------------------------------------
// Form state <-> tool input
// ---------------------------------------------------------------------------

interface FormState {
  suffix: string;
  description: string;
  parameters: McpToolParameter[];
  method: McpCustomToolInput['http']['method'];
  urlTemplate: string;
  query: string;
  headers: string;
  body: string;
  authType: 'none' | 'bearer' | 'header';
  authHeader: string;
  secret: string;
  removeSecret: boolean;
  approval: 'always' | 'read-only';
  timeoutMs: number;
  maxResponseKb: number;
}

const EMPTY_FORM: FormState = {
  suffix: '', description: '', parameters: [], method: 'GET', urlTemplate: 'https://', query: '', headers: '', body: '',
  authType: 'none', authHeader: 'X-API-Key', secret: '', removeSecret: false, approval: 'always', timeoutMs: 10000, maxResponseKb: 256
};

function toForm(tool: McpCustomToolView): FormState {
  return {
    suffix: tool.name.startsWith(NAME_PREFIX) ? tool.name.slice(NAME_PREFIX.length) : tool.name,
    description: tool.description,
    parameters: tool.parameters.map(p => ({ ...p })),
    method: tool.http.method,
    urlTemplate: tool.http.urlTemplate,
    query: Object.entries(tool.http.query).map(([k, v]) => `${k}=${v}`).join('\n'),
    headers: Object.entries(tool.http.headers).map(([k, v]) => `${k}: ${v}`).join('\n'),
    body: tool.http.bodyTemplate ? JSON.stringify(tool.http.bodyTemplate, null, 2) : '',
    authType: tool.http.auth.type,
    authHeader: tool.http.auth.type === 'header' ? tool.http.auth.headerName : 'X-API-Key',
    secret: '',
    removeSecret: false,
    approval: tool.approval,
    timeoutMs: tool.http.timeoutMs,
    maxResponseKb: Math.round(tool.http.maxResponseBytes / 1024)
  };
}

function linesToRecord(text: string, separator: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split('\n')) {
    const index = line.indexOf(separator);
    if (index <= 0) continue;
    out[line.slice(0, index).trim()] = line.slice(index + separator.length).trim();
  }
  return out;
}

function toInput(form: FormState): { input?: McpCustomToolInput; error?: 'body' } {
  let bodyTemplate: Record<string, unknown> | undefined;
  if (form.body.trim()) {
    try {
      const parsed = JSON.parse(form.body);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { error: 'body' };
      bodyTemplate = parsed;
    } catch { return { error: 'body' }; }
  }
  return {
    input: {
      name: NAME_PREFIX + form.suffix.trim(),
      description: form.description.trim(),
      parameters: form.parameters,
      approval: form.method === 'GET' || form.method === 'HEAD' ? form.approval : 'always',
      http: {
        method: form.method,
        urlTemplate: form.urlTemplate.trim(),
        query: linesToRecord(form.query, '='),
        headers: linesToRecord(form.headers, ':'),
        ...(bodyTemplate ? { bodyTemplate } : {}),
        auth: form.authType === 'header' ? { type: 'header', headerName: form.authHeader.trim() } : { type: form.authType },
        timeoutMs: form.timeoutMs,
        maxResponseBytes: Math.round(form.maxResponseKb * 1024)
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Dialog frame
// ---------------------------------------------------------------------------

const DialogFrame: React.FC<{ title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }> = ({ title, onClose, children, wide }) => {
  const { l } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useDialogA11y({ isOpen: true, onClose, containerRef: ref });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-3" onClick={onClose}>
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
        className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl w-full ${wide ? 'max-w-2xl' : 'max-w-md'} max-h-[90vh] flex flex-col outline-none`}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-white/10">
          <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{title}</h2>
          <button type="button" onClick={onClose} aria-label={l({ en: 'Close', ar: 'إغلاق', de: 'Schließen' })} className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4">{children}</div>
      </div>
    </div>
  );
};

const Label: React.FC<{ htmlFor: string; children: React.ReactNode; hint?: string }> = ({ htmlFor, children, hint }) => (
  <div className="mb-1">
    <label htmlFor={htmlFor} className="block text-xs font-medium text-slate-700 dark:text-slate-200">{children}</label>
    {hint && <p className="text-[11px] text-slate-500 mt-0.5">{hint}</p>}
  </div>
);

const ErrorList: React.FC<{ errors: string[] }> = ({ errors }) => (
  errors.length === 0 ? null : (
    <ul role="alert" className="text-xs text-red-600 dark:text-red-400 space-y-0.5 list-disc ps-4">
      {errors.map((error, index) => <li key={index}>{error}</li>)}
    </ul>
  )
);

// ---------------------------------------------------------------------------
// Add / edit
// ---------------------------------------------------------------------------

const ToolFormDialog: React.FC<{ tool?: McpCustomToolView; onClose: () => void; onSaved: () => void }> = ({ tool, onClose, onSaved }) => {
  const { l } = useTranslation();
  const [form, setForm] = useState<FormState>(tool ? toForm(tool) : EMPTY_FORM);
  const [advanced, setAdvanced] = useState(Boolean(tool));
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(prev => ({ ...prev, [key]: value }));
  const readOnlyAllowed = form.method === 'GET' || form.method === 'HEAD';

  const updateParam = (index: number, patch: Partial<McpToolParameter>) =>
    set('parameters', form.parameters.map((p, i) => (i === index ? { ...p, ...patch } : p)));

  const save = async () => {
    const built = toInput(form);
    if (!built.input) { setErrors([l({ en: 'The request body must be a JSON object.', ar: 'يجب أن يكون نص الطلب كائن JSON.', de: 'Der Anfragetext muss ein JSON-Objekt sein.' })]); setAdvanced(true); return; }
    setSaving(true);
    setErrors([]);
    try {
      const secret = form.authType === 'none' ? undefined : (form.secret || undefined);
      let result = tool
        ? await api().updateMcpCustomTool(tool.id, built.input, { secret: form.removeSecret ? null : secret })
        : await api().createMcpCustomTool(built.input, secret);
      if (!result.ok && result.needsConfirmation && tool) {
        const approved = await showConfirm({
          title: l({ en: 'This change alters what the tool can do', ar: 'هذا التغيير يغيّر ما تستطيع الأداة فعله', de: 'Diese Änderung verändert, was das Werkzeug tun kann' }),
          message: (result.changes || []).join('\n'),
          confirmLabel: l({ en: 'Save changes', ar: 'حفظ التغييرات', de: 'Änderungen speichern' }),
          cancelLabel: l({ en: 'Cancel', ar: 'إلغاء', de: 'Abbrechen' })
        });
        if (!approved) { setSaving(false); return; }
        result = await api().updateMcpCustomTool(tool.id, built.input, { secret: form.removeSecret ? null : secret, confirmed: true });
      }
      if (result.ok) { onSaved(); return; }
      setErrors(result.errors || [l({ en: 'The tool could not be saved.', ar: 'تعذّر حفظ الأداة.', de: 'Das Werkzeug konnte nicht gespeichert werden.' })]);
      if ((result.errors || []).length > 0) setAdvanced(true);
    } catch {
      setErrors([l({ en: 'The tool could not be saved.', ar: 'تعذّر حفظ الأداة.', de: 'Das Werkzeug konnte nicht gespeichert werden.' })]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <DialogFrame
      wide
      onClose={onClose}
      title={tool ? l({ en: 'Edit tool', ar: 'تعديل الأداة', de: 'Werkzeug bearbeiten' }) : l({ en: 'Add tool', ar: 'إضافة أداة', de: 'Werkzeug hinzufügen' })}
    >
      <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <div>
          <Label htmlFor="tool-name" hint={l({ en: 'Lowercase letters, digits and underscores. Agents see this exact name.', ar: 'أحرف صغيرة وأرقام وشرطات سفلية. يرى الوكلاء هذا الاسم بالضبط.', de: 'Kleinbuchstaben, Ziffern und Unterstriche. Agenten sehen genau diesen Namen.' })}>
            {l({ en: 'Tool name', ar: 'اسم الأداة', de: 'Werkzeugname' })}
          </Label>
          <div className="flex items-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus-within:ring-2 focus-within:ring-blue-500/40" dir="ltr">
            <span className="ps-3 text-sm text-slate-400 select-none">{NAME_PREFIX}</span>
            <input id="tool-name" value={form.suffix} maxLength={56} required autoFocus spellCheck={false} onChange={(event) => set('suffix', event.target.value.toLowerCase())} placeholder={SAMPLE_NAME} className="flex-1 bg-transparent px-1 py-1.5 text-sm text-slate-800 dark:text-slate-100 focus:outline-none" />
          </div>
        </div>
        <div>
          <Label htmlFor="tool-desc" hint={l({ en: 'Say what the tool does and when an AI agent should use it (30 to 1000 characters).', ar: 'اشرح ما تفعله الأداة ومتى يجب أن يستخدمها وكيل الذكاء الاصطناعي (من 30 إلى 1000 حرف).', de: 'Beschreiben Sie, was das Werkzeug tut und wann ein KI-Agent es nutzen soll (30 bis 1000 Zeichen).' })}>
            {l({ en: 'Tool description', ar: 'وصف الأداة', de: 'Werkzeugbeschreibung' })}
          </Label>
          <textarea id="tool-desc" value={form.description} required rows={3} maxLength={1000} onChange={(event) => set('description', event.target.value)} className={INPUT_CLASS} />
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700/60">
          <button type="button" aria-expanded={advanced} aria-controls="tool-advanced" onClick={() => setAdvanced(!advanced)} className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200">
            {l({ en: 'Advanced configuration', ar: 'الإعدادات المتقدمة', de: 'Erweiterte Konfiguration' })}
            <ChevronDown className={`w-4 h-4 transition-transform ${advanced ? 'rotate-180' : ''}`} />
          </button>
          {advanced && (
            <div id="tool-advanced" className="px-3 pb-3 space-y-4 border-t border-slate-100 dark:border-slate-700/50 pt-3">
              <p className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 rounded-lg px-3 py-2">
                {l({ en: 'A name and a description alone do not make a working tool. The tool needs a request to send: King Browser calls the web address below when an agent uses the tool (after your approval, unless you choose otherwise for read-only tools). Custom code is not supported.', ar: 'الاسم والوصف وحدهما لا يصنعان أداة تعمل. تحتاج الأداة إلى طلب ترسله: يستدعي King Browser عنوان الويب أدناه عندما يستخدم الوكيل الأداة (بعد موافقتك، إلا إذا اخترت غير ذلك للأدوات القرائية). الشيفرة المخصصة غير مدعومة.', de: 'Name und Beschreibung allein ergeben noch kein funktionierendes Werkzeug. Das Werkzeug braucht eine Anfrage: King Browser ruft die Webadresse unten auf, wenn ein Agent das Werkzeug nutzt (nach Ihrer Freigabe, außer Sie wählen bei lesenden Werkzeugen etwas anderes). Eigener Code wird nicht unterstützt.' })}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-[8rem_1fr] gap-3">
                <div>
                  <Label htmlFor="tool-method">{l({ en: 'Method', ar: 'الطريقة', de: 'Methode' })}</Label>
                  <select id="tool-method" value={form.method} onChange={(event) => set('method', event.target.value as FormState['method'])} className={INPUT_CLASS}>
                    {['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <Label htmlFor="tool-url" hint={l({ en: 'https only. Use {name} for a parameter in the path. The host cannot contain parameters.', ar: 'https فقط. استخدم {name} لمعامل في المسار. لا يمكن أن يحتوي المضيف على معاملات.', de: 'Nur https. Verwenden Sie {name} für einen Parameter im Pfad. Der Host darf keine Parameter enthalten.' })}>
                    {l({ en: 'Web address', ar: 'عنوان الويب', de: 'Webadresse' })}
                  </Label>
                  <input id="tool-url" dir="ltr" value={form.urlTemplate} onChange={(event) => set('urlTemplate', event.target.value)} placeholder="https://api.example.com/items/{id}" spellCheck={false} className={INPUT_CLASS} />
                </div>
              </div>

              <fieldset className="space-y-2">
                <legend className="text-xs font-medium text-slate-700 dark:text-slate-200">{l({ en: 'Input parameters', ar: 'معاملات الإدخال', de: 'Eingabeparameter' })}</legend>
                <p className="text-[11px] text-slate-500">{l({ en: 'What the agent must provide when it calls the tool. They become the tool’s input schema.', ar: 'ما يجب أن يقدمه الوكيل عند استدعاء الأداة. تصبح مخطط إدخال الأداة.', de: 'Was der Agent beim Aufruf angeben muss. Sie bilden das Eingabeschema des Werkzeugs.' })}</p>
                {form.parameters.map((param, index) => (
                  <div key={index} className="grid grid-cols-2 sm:grid-cols-[1fr_7rem_2fr_auto_auto] gap-2 items-center" dir="ltr">
                    <input aria-label={l({ en: 'Parameter name', ar: 'اسم المعامل', de: 'Parametername' })} value={param.name} onChange={(event) => updateParam(index, { name: event.target.value })} placeholder={SAMPLE_PARAM} spellCheck={false} className={INPUT_CLASS} />
                    <select aria-label={l({ en: 'Parameter type', ar: 'نوع المعامل', de: 'Parametertyp' })} value={param.type} onChange={(event) => updateParam(index, { type: event.target.value as McpToolParameter['type'] })} className={INPUT_CLASS}>
                      {['string', 'number', 'integer', 'boolean'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input aria-label={l({ en: 'Parameter description', ar: 'وصف المعامل', de: 'Parameterbeschreibung' })} value={param.description} onChange={(event) => updateParam(index, { description: event.target.value })} placeholder={l({ en: 'What it is', ar: 'ما هو', de: 'Was es ist' })} className={`${INPUT_CLASS} col-span-2 sm:col-span-1`} />
                    <label className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      <input type="checkbox" checked={param.required} onChange={(event) => updateParam(index, { required: event.target.checked })} />
                      {l({ en: 'Required', ar: 'مطلوب', de: 'Pflicht' })}
                    </label>
                    <button type="button" onClick={() => set('parameters', form.parameters.filter((_, i) => i !== index))} aria-label={l({ en: 'Remove parameter {name}', ar: 'إزالة المعامل {name}', de: 'Parameter {name} entfernen' }, { name: param.name || String(index + 1) })} className="p-1 text-slate-400 hover:text-red-600"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                ))}
                <button type="button" disabled={form.parameters.length >= 20} onClick={() => set('parameters', [...form.parameters, { name: '', type: 'string', description: '', required: true }])} className={BUTTON_GHOST}>
                  {l({ en: 'Add parameter', ar: 'إضافة معامل', de: 'Parameter hinzufügen' })}
                </button>
              </fieldset>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="tool-query" hint={l({ en: 'One per line: name=value. Values may use {parameter}.', ar: 'واحد في كل سطر: الاسم=القيمة. يمكن للقيم استخدام {parameter}.', de: 'Eine pro Zeile: Name=Wert. Werte dürfen {parameter} enthalten.' })}>
                    {l({ en: 'Query parameters', ar: 'معاملات الاستعلام', de: 'Abfrageparameter' })}
                  </Label>
                  <textarea id="tool-query" dir="ltr" rows={3} value={form.query} onChange={(event) => set('query', event.target.value)} spellCheck={false} className={`${INPUT_CLASS} font-mono text-xs`} />
                </div>
                <div>
                  <Label htmlFor="tool-headers" hint={l({ en: 'One per line: Name: value. No secrets here; use Authentication.', ar: 'واحد في كل سطر: الاسم: القيمة. لا أسرار هنا؛ استخدم المصادقة.', de: 'Eine pro Zeile: Name: Wert. Keine Geheimnisse hier; nutzen Sie Authentifizierung.' })}>
                    {l({ en: 'Static headers', ar: 'ترويسات ثابتة', de: 'Statische Header' })}
                  </Label>
                  <textarea id="tool-headers" dir="ltr" rows={3} value={form.headers} onChange={(event) => set('headers', event.target.value)} spellCheck={false} className={`${INPUT_CLASS} font-mono text-xs`} />
                </div>
              </div>

              {form.method !== 'GET' && form.method !== 'HEAD' && (
                <div>
                  <Label htmlFor="tool-body" hint={l({ en: 'A JSON object. A value like "{id}" is replaced by the parameter.', ar: 'كائن JSON. قيمة مثل "{id}" تُستبدل بالمعامل.', de: 'Ein JSON-Objekt. Ein Wert wie "{id}" wird durch den Parameter ersetzt.' })}>
                    {l({ en: 'Request body', ar: 'نص الطلب', de: 'Anfragetext' })}
                  </Label>
                  <textarea id="tool-body" dir="ltr" rows={4} value={form.body} onChange={(event) => set('body', event.target.value)} spellCheck={false} className={`${INPUT_CLASS} font-mono text-xs`} />
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="tool-auth">{l({ en: 'Authentication', ar: 'المصادقة', de: 'Authentifizierung' })}</Label>
                  <select id="tool-auth" value={form.authType} onChange={(event) => set('authType', event.target.value as FormState['authType'])} className={INPUT_CLASS}>
                    <option value="none">{l({ en: 'None', ar: 'بدون', de: 'Keine' })}</option>
                    <option value="bearer">{l({ en: 'Bearer token', ar: 'رمز Bearer', de: 'Bearer-Token' })}</option>
                    <option value="header">{l({ en: 'Custom header', ar: 'ترويسة مخصصة', de: 'Eigener Header' })}</option>
                  </select>
                </div>
                {form.authType === 'header' && (
                  <div>
                    <Label htmlFor="tool-auth-header">{l({ en: 'Header name', ar: 'اسم الترويسة', de: 'Header-Name' })}</Label>
                    <input id="tool-auth-header" dir="ltr" value={form.authHeader} onChange={(event) => set('authHeader', event.target.value)} className={INPUT_CLASS} />
                  </div>
                )}
              </div>
              {form.authType !== 'none' && (
                <div>
                  <Label htmlFor="tool-secret" hint={l({ en: 'Stored encrypted in the main process. It is never shown again or sent to the page.', ar: 'يُخزَّن مشفّراً في العملية الرئيسية. لا يُعرض مرة أخرى ولا يُرسل إلى الصفحة.', de: 'Verschlüsselt im Hauptprozess gespeichert. Wird nie wieder angezeigt oder an die Seite gesendet.' })}>
                    {l({ en: 'Credential', ar: 'بيانات الاعتماد', de: 'Zugangsdaten' })}
                  </Label>
                  <input id="tool-secret" type="password" autoComplete="off" dir="ltr" value={form.secret} onChange={(event) => set('secret', event.target.value)} placeholder={tool?.hasSecret ? l({ en: 'Saved. Leave empty to keep it.', ar: 'محفوظة. اتركها فارغة للإبقاء عليها.', de: 'Gespeichert. Leer lassen, um sie zu behalten.' }) : ''} className={INPUT_CLASS} />
                  {tool?.hasSecret && (
                    <label className="flex items-center gap-1.5 mt-1 text-xs text-slate-600 dark:text-slate-300">
                      <input type="checkbox" checked={form.removeSecret} onChange={(event) => set('removeSecret', event.target.checked)} />
                      {l({ en: 'Remove the saved credential', ar: 'إزالة بيانات الاعتماد المحفوظة', de: 'Gespeicherte Zugangsdaten entfernen' })}
                    </label>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-1">
                  <Label htmlFor="tool-approval">{l({ en: 'Approval', ar: 'الموافقة', de: 'Freigabe' })}</Label>
                  <select id="tool-approval" value={readOnlyAllowed && form.authType === 'none' ? form.approval : 'always'} disabled={!readOnlyAllowed || form.authType !== 'none'} onChange={(event) => set('approval', event.target.value as FormState['approval'])} className={INPUT_CLASS}>
                    <option value="always">{l({ en: 'Ask every time', ar: 'اسأل في كل مرة', de: 'Jedes Mal fragen' })}</option>
                    <option value="read-only">{l({ en: 'Automatic (read-only)', ar: 'تلقائي (قراءة فقط)', de: 'Automatisch (nur lesen)' })}</option>
                  </select>
                  <p className="text-[11px] text-slate-500 mt-0.5">{l({ en: 'Automatic is only for GET or HEAD without credentials. Strict mode still asks.', ar: 'التلقائي فقط لـ GET أو HEAD بدون بيانات اعتماد. الوضع الصارم يسأل دائماً.', de: 'Automatisch nur für GET oder HEAD ohne Zugangsdaten. Der strenge Modus fragt trotzdem.' })}</p>
                </div>
                <div>
                  <Label htmlFor="tool-timeout">{l({ en: 'Timeout (s)', ar: 'المهلة (ث)', de: 'Zeitlimit (s)' })}</Label>
                  <input id="tool-timeout" type="number" min={1} max={30} value={Math.round(form.timeoutMs / 1000)} onChange={(event) => set('timeoutMs', Math.max(1, Math.min(30, Number(event.target.value) || 10)) * 1000)} className={INPUT_CLASS} />
                </div>
                <div>
                  <Label htmlFor="tool-size">{l({ en: 'Max response (KB)', ar: 'أقصى استجابة (كيلوبايت)', de: 'Max. Antwort (KB)' })}</Label>
                  <input id="tool-size" type="number" min={1} max={1024} value={form.maxResponseKb} onChange={(event) => set('maxResponseKb', Math.max(1, Math.min(1024, Number(event.target.value) || 256)))} className={INPUT_CLASS} />
                </div>
              </div>
            </div>
          )}
        </div>

        <ErrorList errors={errors} />
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className={BUTTON_GHOST}>{l({ en: 'Cancel', ar: 'إلغاء', de: 'Abbrechen' })}</button>
          <button type="submit" disabled={saving} className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600 disabled:opacity-50">
            {saving ? l({ en: 'Saving…', ar: 'جارٍ الحفظ…', de: 'Speichern…' }) : l({ en: 'Save', ar: 'حفظ', de: 'Speichern' })}
          </button>
        </div>
      </form>
    </DialogFrame>
  );
};

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

const ToolTestDialog: React.FC<{ tool: McpCustomToolView; onClose: () => void; onDone: () => void }> = ({ tool, onClose, onDone }) => {
  const { l } = useTranslation();
  const [values, setValues] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'running' | 'ok' | 'failed'>('idle');
  const [text, setText] = useState('');

  const run = async () => {
    const args: Record<string, unknown> = {};
    for (const param of tool.parameters) {
      const raw = values[param.name];
      if (raw === undefined || raw === '') continue;
      args[param.name] = param.type === 'boolean' ? raw === 'true' : param.type === 'string' ? raw : Number(raw);
    }
    setState('running');
    setText('');
    try {
      const result = await api().testMcpCustomTool(tool.id, args);
      setState(result.ok ? 'ok' : 'failed');
      setText(result.ok ? (result.output || '') : (result.error || ''));
    } catch {
      setState('failed');
      setText(l({ en: 'The test could not be run.', ar: 'تعذّر تشغيل الاختبار.', de: 'Der Test konnte nicht ausgeführt werden.' }));
    }
    onDone();
  };

  return (
    <DialogFrame wide onClose={onClose} title={l({ en: 'Test {name}', ar: 'اختبار {name}', de: '{name} testen' }, { name: tool.name })}>
      <p className="text-xs text-slate-500">{l({ en: 'This sends a real request. You will be asked to approve it first, exactly as when an agent uses the tool.', ar: 'يرسل هذا طلباً حقيقياً. ستُسأل عن الموافقة أولاً تماماً كما عندما يستخدم وكيل الأداة.', de: 'Dies sendet eine echte Anfrage. Sie werden zuerst um Freigabe gebeten, genau wie wenn ein Agent das Werkzeug nutzt.' })}</p>
      {tool.parameters.map(param => (
        <div key={param.name}>
          <Label htmlFor={`test-${param.name}`} hint={param.description}>{param.name}{param.required ? ' *' : ''}</Label>
          {param.type === 'boolean' ? (
            <select id={`test-${param.name}`} value={values[param.name] ?? ''} onChange={(event) => setValues({ ...values, [param.name]: event.target.value })} className={INPUT_CLASS}>
              <option value="">-</option><option value="true">{'true'}</option><option value="false">{'false'}</option>
            </select>
          ) : (
            <input id={`test-${param.name}`} dir="ltr" type={param.type === 'string' ? 'text' : 'number'} value={values[param.name] ?? ''} onChange={(event) => setValues({ ...values, [param.name]: event.target.value })} className={INPUT_CLASS} />
          )}
        </div>
      ))}
      <div className="flex items-center gap-2">
        <button type="button" disabled={state === 'running'} onClick={() => void run()} className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600 disabled:opacity-50">
          {state === 'running' ? l({ en: 'Running…', ar: 'جارٍ التنفيذ…', de: 'Läuft…' }) : l({ en: 'Run test', ar: 'تشغيل الاختبار', de: 'Test ausführen' })}
        </button>
        <span role="status" aria-live="polite" className={`text-xs font-medium ${state === 'ok' ? 'text-green-600' : state === 'failed' ? 'text-red-600' : 'text-slate-500'}`}>
          {state === 'ok' && l({ en: 'Completed', ar: 'اكتمل', de: 'Abgeschlossen' })}
          {state === 'failed' && l({ en: 'Failed', ar: 'فشل', de: 'Fehlgeschlagen' })}
        </span>
      </div>
      {text && <pre dir="ltr" className="max-h-60 overflow-auto rounded-lg bg-slate-100 dark:bg-slate-800 p-3 text-xs text-slate-800 dark:text-slate-100 whitespace-pre-wrap break-all">{text}</pre>}
    </DialogFrame>
  );
};

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

const ImportDialog: React.FC<{ onClose: () => void; onImported: () => void }> = ({ onClose, onImported }) => {
  const { l } = useTranslation();
  const [text, setText] = useState('');
  const [preview, setPreview] = useState<{ entries: Array<{ name: string; status: 'new' | 'duplicate' | 'invalid' | 'limit'; errors: string[] }>; error?: string } | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const statusLabel: Record<string, string> = {
    new: l({ en: 'New', ar: 'جديدة', de: 'Neu' }),
    duplicate: l({ en: 'Name already used', ar: 'الاسم مستخدم', de: 'Name bereits vergeben' }),
    invalid: l({ en: 'Invalid', ar: 'غير صالحة', de: 'Ungültig' }),
    limit: l({ en: 'Limit reached', ar: 'تم بلوغ الحد', de: 'Limit erreicht' })
  };

  const loadFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > 512 * 1024) { setErrors([l({ en: 'The file is larger than 512 KB.', ar: 'الملف أكبر من 512 كيلوبايت.', de: 'Die Datei ist größer als 512 KB.' })]); return; }
    const content = await file.text();
    setText(content);
    setErrors([]);
    setPreview(await api().previewMcpCustomToolImport(content));
  };

  const commit = async (rename: boolean) => {
    setBusy(true);
    const result = await api().importMcpCustomTools(text, rename);
    setBusy(false);
    if (result.ok) { onImported(); return; }
    setErrors(result.errors);
  };

  const hasDuplicates = preview?.entries.some(e => e.status === 'duplicate');
  const allNew = preview && !preview.error && preview.entries.length > 0 && preview.entries.every(e => e.status === 'new');
  return (
    <DialogFrame wide onClose={onClose} title={l({ en: 'Import tools', ar: 'استيراد أدوات', de: 'Werkzeuge importieren' })}>
      <p className="text-xs text-slate-500">{l({ en: 'Choose a file exported from King Browser. Nothing is imported until you confirm. Credentials are never part of an export, so tools that need one stay disabled until you add it.', ar: 'اختر ملفاً مُصدَّراً من King Browser. لا يُستورد شيء قبل أن تؤكد. بيانات الاعتماد ليست جزءاً من التصدير، لذا تبقى الأدوات التي تحتاجها معطّلة حتى تضيفها.', de: 'Wählen Sie eine aus King Browser exportierte Datei. Es wird nichts importiert, bevor Sie bestätigen. Zugangsdaten sind nie Teil eines Exports; Werkzeuge, die sie brauchen, bleiben deaktiviert, bis Sie sie hinzufügen.' })}</p>
      <input type="file" accept="application/json,.json" aria-label={l({ en: 'Tools file', ar: 'ملف الأدوات', de: 'Werkzeugdatei' })} onChange={(event) => void loadFile(event.target.files?.[0])} className="text-xs" />
      {preview?.error && <ErrorList errors={[preview.error]} />}
      {preview && !preview.error && (
        <ul className="space-y-1.5">
          {preview.entries.map((entry, index) => (
            <li key={index} className="rounded-lg border border-slate-200 dark:border-slate-700/50 px-3 py-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <code className="text-slate-700 dark:text-slate-200 break-all">{entry.name}</code>
                <span className={`shrink-0 font-medium ${entry.status === 'new' ? 'text-green-600' : 'text-amber-600'}`}>{statusLabel[entry.status]}</span>
              </div>
              {entry.errors.length > 0 && <p className="text-red-600 mt-0.5">{entry.errors.join(' ')}</p>}
            </li>
          ))}
        </ul>
      )}
      <ErrorList errors={errors} />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onClose} className={BUTTON_GHOST}>{l({ en: 'Cancel', ar: 'إلغاء', de: 'Abbrechen' })}</button>
        {hasDuplicates && preview?.entries.every(e => e.status === 'new' || e.status === 'duplicate') && (
          <button type="button" disabled={busy} onClick={() => void commit(true)} className={BUTTON_GHOST}>{l({ en: 'Import and rename duplicates', ar: 'استيراد مع إعادة تسمية المكررات', de: 'Importieren und Duplikate umbenennen' })}</button>
        )}
        <button type="button" disabled={busy || !allNew} onClick={() => void commit(false)} className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600 disabled:opacity-50">{l({ en: 'Import', ar: 'استيراد', de: 'Importieren' })}</button>
      </div>
    </DialogFrame>
  );
};

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export const McpToolManager: React.FC = () => {
  const { l } = useTranslation();
  const [registry, setRegistry] = useState<McpToolRegistry | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortKey>('name');
  const [dialog, setDialog] = useState<null | { kind: 'form'; tool?: McpCustomToolView } | { kind: 'test'; tool: McpCustomToolView } | { kind: 'import' }>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const next = await api()?.getMcpToolRegistry?.();
      if (next) { setRegistry(next); setLoadFailed(false); } else setLoadFailed(true);
    } catch { setLoadFailed(true); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const rows: Row[] = useMemo(() => {
    if (!registry) return [];
    const custom: Row[] = registry.custom.map(tool => ({ key: tool.id, name: tool.name, description: tool.description, custom: true, enabled: tool.enabled, level: 'http', custom_view: tool }));
    const builtIn: Row[] = registry.builtIn.map(tool => ({ key: tool.name, name: tool.name, description: tool.description, custom: false, enabled: tool.enabled, level: tool.level, builtin_view: tool }));
    return [...custom, ...builtIn];
  }, [registry]);

  const counts = useMemo(() => ({
    total: rows.length,
    active: rows.filter(r => r.enabled).length,
    disabled: rows.filter(r => !r.enabled).length,
    custom: rows.filter(r => r.custom).length,
    builtIn: rows.filter(r => !r.custom).length
  }), [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter(r => (filter === 'all' || (filter === 'active' && r.enabled) || (filter === 'disabled' && !r.enabled) || (filter === 'custom' && r.custom) || (filter === 'built-in' && !r.custom)))
      .filter(r => !q || r.name.toLowerCase().includes(q) || r.description.toLowerCase().includes(q))
      .sort((a, b) => {
        if (sort === 'status') return Number(b.enabled) - Number(a.enabled) || a.name.localeCompare(b.name);
        if (sort === 'type') return Number(b.custom) - Number(a.custom) || a.name.localeCompare(b.name);
        return a.name.localeCompare(b.name);
      });
  }, [rows, query, filter, sort]);

  const flash = (ok: boolean, text: string) => setNotice({ ok, text });

  const toggle = async (row: Row) => {
    setBusyId(row.key);
    try {
      if (row.custom_view) {
        const result = await api().setMcpCustomToolEnabled(row.custom_view.id, !row.enabled);
        if (!result.ok) flash(false, result.errors.join(' '));
      } else {
        await api().setMcpToolEnabled(row.name, !row.enabled);
      }
    } catch {
      flash(false, l({ en: 'The change could not be saved.', ar: 'تعذّر حفظ التغيير.', de: 'Die Änderung konnte nicht gespeichert werden.' }));
    }
    setBusyId(null);
    await refresh();
  };

  const remove = async (tool: McpCustomToolView) => {
    const confirmed = await showConfirm({
      title: l({ en: 'Delete tool', ar: 'حذف الأداة', de: 'Werkzeug löschen' }),
      message: l({ en: 'Delete “{name}”?', ar: 'حذف «{name}»؟', de: '„{name}“ löschen?' }, { name: tool.name }),
      detail: l({ en: 'Its saved credential is removed and any running call is cancelled. Agents can no longer use it. This cannot be undone. A record of the deletion is kept in the audit file.', ar: 'تُزال بيانات الاعتماد المحفوظة ويُلغى أي استدعاء جارٍ. لن يتمكن الوكلاء من استخدامها بعد الآن. لا يمكن التراجع. يُحتفظ بسجل للحذف في ملف التدقيق.', de: 'Die gespeicherten Zugangsdaten werden entfernt und laufende Aufrufe abgebrochen. Agenten können es nicht mehr nutzen. Dies kann nicht rückgängig gemacht werden. Ein Eintrag über die Löschung bleibt in der Audit-Datei.' }),
      confirmLabel: l({ en: 'Delete', ar: 'حذف', de: 'Löschen' }),
      cancelLabel: l({ en: 'Cancel', ar: 'إلغاء', de: 'Abbrechen' })
    });
    if (!confirmed) return;
    setBusyId(tool.id);
    const result = await api().deleteMcpCustomTool(tool.id);
    setBusyId(null);
    flash(Boolean(result.ok), result.ok
      ? l({ en: 'Deleted {name}.', ar: 'تم حذف {name}.', de: '{name} gelöscht.' }, { name: tool.name })
      : l({ en: 'The tool could not be deleted.', ar: 'تعذّر حذف الأداة.', de: 'Das Werkzeug konnte nicht gelöscht werden.' }));
    await refresh();
  };

  const exportTools = async () => {
    const json = await api().exportMcpCustomTools();
    if (!json) { flash(false, l({ en: 'Nothing to export.', ar: 'لا شيء للتصدير.', de: 'Nichts zu exportieren.' })); return; }
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'king-browser-custom-tools.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    flash(true, l({ en: 'Exported without credentials.', ar: 'تم التصدير بدون بيانات الاعتماد.', de: 'Ohne Zugangsdaten exportiert.' }));
  };

  const statCard = (value: number, label: string) => (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700/50 px-3 py-2 text-center">
      <div className="text-lg font-semibold text-slate-800 dark:text-slate-100">{value}</div>
      <div className="text-[11px] text-slate-500">{label}</div>
    </div>
  );

  const levelLabel = (level: string) => level === 'http'
    ? 'HTTP'
    : level === 'safe' ? l({ en: 'Safe', ar: 'آمن', de: 'Sicher' }) : level === 'medium' ? l({ en: 'Medium', ar: 'متوسط', de: 'Mittel' }) : l({ en: 'Sensitive', ar: 'حساس', de: 'Sensibel' });

  return (
    <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-4 sm:p-6 space-y-4" data-testid="mcp-tool-manager">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wrench className="w-4 h-4 text-blue-500" />
          <h3 className="font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Tool Manager', ar: 'مدير الأدوات', de: 'Werkzeugverwaltung' })}</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void exportTools()} className={`${BUTTON_GHOST} inline-flex items-center gap-1`}><Download className="w-3.5 h-3.5" />{l({ en: 'Export', ar: 'تصدير', de: 'Exportieren' })}</button>
          <button type="button" onClick={() => setDialog({ kind: 'import' })} className={`${BUTTON_GHOST} inline-flex items-center gap-1`}><Upload className="w-3.5 h-3.5" />{l({ en: 'Import', ar: 'استيراد', de: 'Importieren' })}</button>
          <button type="button" onClick={() => setDialog({ kind: 'form' })} className="px-3 py-1 rounded-lg bg-blue-500 text-white text-xs hover:bg-blue-600 inline-flex items-center gap-1"><Plus className="w-3.5 h-3.5" />{l({ en: 'Add tool', ar: 'إضافة أداة', de: 'Werkzeug hinzufügen' })}</button>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        {l({ en: 'Built-in tools can be turned off but not deleted, because they are the browser’s own functions. Your own tools are web requests that run in King Browser’s main process, always through the approval rules. A disabled tool cannot be called by an agent.', ar: 'يمكن إيقاف الأدوات المضمّنة لكن لا يمكن حذفها لأنها وظائف المتصفح نفسه. أدواتك الخاصة هي طلبات ويب تعمل في العملية الرئيسية لـ King Browser ودائماً عبر قواعد الموافقة. لا يمكن للوكيل استدعاء أداة معطّلة.', de: 'Eingebaute Werkzeuge können deaktiviert, aber nicht gelöscht werden, da sie Funktionen des Browsers selbst sind. Ihre eigenen Werkzeuge sind Webanfragen, die im Hauptprozess von King Browser laufen, immer unter den Freigaberegeln. Ein deaktiviertes Werkzeug kann von einem Agenten nicht aufgerufen werden.' })}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {statCard(counts.total, l({ en: 'Total', ar: 'الإجمالي', de: 'Gesamt' }))}
        {statCard(counts.active, l({ en: 'Active', ar: 'نشطة', de: 'Aktiv' }))}
        {statCard(counts.disabled, l({ en: 'Disabled', ar: 'معطّلة', de: 'Deaktiviert' }))}
        {statCard(counts.custom, l({ en: 'Custom', ar: 'مخصصة', de: 'Eigene' }))}
        {statCard(counts.builtIn, l({ en: 'Built-in', ar: 'مضمّنة', de: 'Eingebaut' }))}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="w-3.5 h-3.5 absolute start-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} aria-label={l({ en: 'Search tools', ar: 'بحث في الأدوات', de: 'Werkzeuge suchen' })} placeholder={l({ en: 'Search tools', ar: 'بحث في الأدوات', de: 'Werkzeuge suchen' })} className={`${INPUT_CLASS} ps-8`} />
        </div>
        <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} aria-label={l({ en: 'Filter', ar: 'تصفية', de: 'Filter' })} className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100">
          <option value="all">{l({ en: 'All', ar: 'الكل', de: 'Alle' })}</option>
          <option value="active">{l({ en: 'Active', ar: 'نشطة', de: 'Aktiv' })}</option>
          <option value="disabled">{l({ en: 'Disabled', ar: 'معطّلة', de: 'Deaktiviert' })}</option>
          <option value="custom">{l({ en: 'Custom', ar: 'مخصصة', de: 'Eigene' })}</option>
          <option value="built-in">{l({ en: 'Built-in', ar: 'مضمّنة', de: 'Eingebaut' })}</option>
        </select>
        <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)} aria-label={l({ en: 'Sort by', ar: 'ترتيب حسب', de: 'Sortieren nach' })} className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100">
          <option value="name">{l({ en: 'Name', ar: 'الاسم', de: 'Name' })}</option>
          <option value="status">{l({ en: 'Status', ar: 'الحالة', de: 'Status' })}</option>
          <option value="type">{l({ en: 'Type', ar: 'النوع', de: 'Typ' })}</option>
        </select>
      </div>

      <div role="status" aria-live="polite" className="min-h-[1rem]">
        {notice && <p className={`text-xs ${notice.ok ? 'text-green-600' : 'text-red-600'}`}>{notice.text}</p>}
      </div>

      {!registry && !loadFailed && <p className="text-xs text-slate-400">{l({ en: 'Loading tools…', ar: 'جارٍ تحميل الأدوات…', de: 'Werkzeuge werden geladen…' })}</p>}
      {loadFailed && <p className="text-xs text-red-600">{l({ en: 'The tool list could not be loaded. The Tool Manager needs the desktop app.', ar: 'تعذّر تحميل قائمة الأدوات. يحتاج مدير الأدوات إلى تطبيق سطح المكتب.', de: 'Die Werkzeugliste konnte nicht geladen werden. Die Werkzeugverwaltung benötigt die Desktop-App.' })}</p>}
      {registry && visible.length === 0 && (
        <p className="text-xs text-slate-400">
          {rows.length > 0 && counts.custom === 0 && filter === 'custom'
            ? l({ en: 'You have no custom tools yet. Use “Add tool” to create one.', ar: 'ليس لديك أدوات مخصصة بعد. استخدم «إضافة أداة» لإنشاء واحدة.', de: 'Sie haben noch keine eigenen Werkzeuge. Mit „Werkzeug hinzufügen“ erstellen Sie eines.' })
            : l({ en: 'No tools match.', ar: 'لا توجد أدوات مطابقة.', de: 'Keine passenden Werkzeuge.' })}
        </p>
      )}

      <ul className="space-y-1.5 max-h-[520px] overflow-y-auto pe-1">
        {visible.map(row => {
          const tool = row.custom_view;
          const busy = busyId === row.key;
          return (
            <li key={row.key} className="rounded-lg border border-slate-200 dark:border-slate-700/50 px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <code className="text-xs font-mono text-blue-600 dark:text-blue-400 break-all">{row.name}</code>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">{row.custom ? l({ en: 'Custom', ar: 'مخصصة', de: 'Eigene' }) : l({ en: 'Built-in', ar: 'مضمّنة', de: 'Eingebaut' })}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${row.level === 'safe' ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400' : row.level === 'medium' || row.level === 'http' ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400' : 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400'}`}>{levelLabel(row.level)}</span>
                    <span className={`text-[10px] ${row.enabled ? 'text-green-600' : 'text-slate-400'}`}>{row.enabled ? l({ en: 'Active', ar: 'نشطة', de: 'Aktiv' }) : l({ en: 'Disabled', ar: 'معطّلة', de: 'Deaktiviert' })}</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{row.description}</p>
                  {tool && (
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      {!tool.valid
                        ? <span className="text-red-600">{l({ en: 'Invalid configuration: edit to fix.', ar: 'إعداد غير صالح: عدّله للإصلاح.', de: 'Ungültige Konfiguration: zum Beheben bearbeiten.' })}</span>
                        : tool.lastTest
                          ? <span className={tool.lastTest.ok ? 'text-green-600' : 'text-red-600'}>{tool.lastTest.ok ? l({ en: 'Last test passed', ar: 'نجح آخر اختبار', de: 'Letzter Test bestanden' }) : l({ en: 'Last test failed', ar: 'فشل آخر اختبار', de: 'Letzter Test fehlgeschlagen' })} · {new Date(tool.lastTest.at).toLocaleString()}</span>
                          : l({ en: 'Configuration valid · not tested yet', ar: 'الإعداد صالح · لم يُختبر بعد', de: 'Konfiguration gültig · noch nicht getestet' })}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {tool && (
                    <>
                      <button type="button" disabled={busy || !tool.valid} onClick={() => setDialog({ kind: 'test', tool })} aria-label={l({ en: 'Test {name}', ar: 'اختبار {name}', de: '{name} testen' }, { name: row.name })} title={l({ en: 'Test', ar: 'اختبار', de: 'Testen' })} className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40"><FlaskConical className="w-3.5 h-3.5" /></button>
                      <button type="button" disabled={busy} onClick={() => setDialog({ kind: 'form', tool })} aria-label={l({ en: 'Edit {name}', ar: 'تعديل {name}', de: '{name} bearbeiten' }, { name: row.name })} title={l({ en: 'Edit', ar: 'تعديل', de: 'Bearbeiten' })} className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 dark:hover:bg-slate-700"><Pencil className="w-3.5 h-3.5" /></button>
                      <button type="button" disabled={busy} onClick={() => void remove(tool)} aria-label={l({ en: 'Delete {name}', ar: 'حذف {name}', de: '{name} löschen' }, { name: row.name })} title={l({ en: 'Delete', ar: 'حذف', de: 'Löschen' })} className="p-1.5 rounded-lg text-slate-500 hover:text-red-600 hover:bg-slate-100 dark:hover:bg-slate-700"><Trash2 className="w-3.5 h-3.5" /></button>
                    </>
                  )}
                  <ToggleSwitch checked={row.enabled} disabled={busy || (Boolean(tool) && !tool?.valid && !row.enabled)} label={l({ en: 'Enable {name}', ar: 'تفعيل {name}', de: '{name} aktivieren' }, { name: row.name })} onChange={() => void toggle(row)} />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {dialog?.kind === 'form' && (
        <ToolFormDialog tool={dialog.tool} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); flash(true, l({ en: 'Tool saved.', ar: 'تم حفظ الأداة.', de: 'Werkzeug gespeichert.' })); void refresh(); }} />
      )}
      {dialog?.kind === 'test' && <ToolTestDialog tool={dialog.tool} onClose={() => setDialog(null)} onDone={() => void refresh()} />}
      {dialog?.kind === 'import' && (
        <ImportDialog onClose={() => setDialog(null)} onImported={() => { setDialog(null); flash(true, l({ en: 'Tools imported.', ar: 'تم استيراد الأدوات.', de: 'Werkzeuge importiert.' })); void refresh(); }} />
      )}
    </div>
  );
};
