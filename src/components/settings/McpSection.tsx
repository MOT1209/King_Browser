import React, { useState, useEffect, useCallback } from 'react';
import { Cpu, Play, Square, Copy, Check, Users, Key, RefreshCw, Lock, Unlock, ShieldAlert } from 'lucide-react';
import { UserSettings } from '../../types/browser';
import { copyTextToClipboard } from '../../utils/clipboard';
import { showConfirm } from '../../utils/confirmDialog';
import { useSafeTimeout } from '../../hooks/useSafeTimeout';
import { useTranslation } from '../../services/i18n';

// mcpToken from getMcpTokenStatus is only a display prefix (e.g. "king_mcp_••••").
// Never treat a masked value as the real secret.
const isMaskedToken = (v: string) => !v || v.includes('•') || v.includes('****');

export interface McpSectionProps {
  settings: Pick<UserSettings, 'mcpServerEnabled' | 'agentIsolatedProfile' | 'agentPersistentProfile'>;
  onUpdateSettings: (newSettings: Partial<UserSettings>) => void;
}

// Display copy for the Settings list. The levels here must mirror
// electron/mcpServer.ts TOOL_PERMISSIONS exactly: this list drives the visible
// badge AND the enable/disable toggle, so a level that disagrees with the
// server tells the user a tool is harmless while the server classifies it as
// page-reading or sensitive. tools_mcp_catalog.test.ts fails on any drift.
export const MCP_TOOLS = [
  { name: 'king_browser_info', desc: 'Browser version and capabilities', level: 'safe' },
  { name: 'browser_navigate', desc: 'Navigate to a URL', level: 'medium' },
  { name: 'browser_read_page', desc: 'Extract full page text + links', level: 'medium' },
  { name: 'browser_snapshot', desc: 'List interactive elements with refs (e12) for click/type', level: 'medium' },
  { name: 'browser_screenshot', desc: 'Take a screenshot', level: 'medium' },
  { name: 'browser_list_tabs', desc: 'List all open tabs', level: 'safe' },
  { name: 'browser_get_url', desc: 'Get the current tab URL', level: 'safe' },
  { name: 'browser_scroll', desc: 'Scroll the page up/down/top/bottom', level: 'safe' },
  { name: 'browser_go_back', desc: 'Navigate back in history', level: 'safe' },
  { name: 'browser_go_forward', desc: 'Navigate forward in history', level: 'safe' },
  { name: 'browser_reload', desc: 'Reload the current page', level: 'safe' },
  { name: 'browser_wait', desc: 'Wait for N milliseconds', level: 'safe' },
  { name: 'browser_get_element_text', desc: 'Get an element\'s text or form value', level: 'medium' },
  { name: 'browser_scroll_to_element', desc: 'Scroll until element is visible', level: 'safe' },

  { name: 'browser_click', desc: 'Click an element by CSS selector', level: 'medium' },
  { name: 'browser_hover', desc: 'Hover over an element', level: 'medium' },
  { name: 'browser_focus', desc: 'Focus an element', level: 'medium' },
  { name: 'browser_switch_tab', desc: 'Switch to a tab by ID', level: 'medium' },
  { name: 'browser_close_tab', desc: 'Close a tab by ID', level: 'medium' },
  { name: 'browser_new_tab', desc: 'Open a new tab', level: 'medium' },
  { name: 'browser_mute_tab', desc: 'Mute or unmute the active tab', level: 'medium' },
  { name: 'browser_pin_tab', desc: 'Pin or unpin the active tab', level: 'medium' },
  { name: 'browser_duplicate_tab', desc: 'Duplicate the active tab', level: 'medium' },
  { name: 'browser_zoom', desc: 'Set page zoom level', level: 'medium' },

  { name: 'browser_type', desc: 'Type text into an input', level: 'sensitive' },
  { name: 'browser_press_key', desc: 'Simulate a keyboard key press', level: 'sensitive' },
  { name: 'browser_select_option', desc: 'Select a dropdown option', level: 'sensitive' },
  { name: 'browser_login', desc: 'Sign in with a saved account (always asks you first)', level: 'sensitive' },

  // §9 agent interface (levels mirror electron/mcpServer.ts TOOL_PERMISSIONS).
  // Engine controls stay 'safe' so STOP NOW / Pause can never be locked out.
  { name: 'browser_status', desc: 'Get live execution-engine status', level: 'safe' },
  { name: 'browser_back', desc: 'Go back in history (alias)', level: 'safe' },
  { name: 'browser_forward', desc: 'Go forward in history (alias)', level: 'safe' },
  { name: 'browser_request_approval', desc: 'Ask the user to approve a planned action', level: 'safe' },
  { name: 'browser_next_step', desc: 'Run exactly one action, then pause', level: 'safe' },
  { name: 'browser_next_phase', desc: 'Report the active phase and actions used', level: 'safe' },
  { name: 'browser_pause', desc: 'Pause scheduling at a safe boundary', level: 'safe' },
  { name: 'browser_resume', desc: 'Resume after pause or stop', level: 'safe' },
  { name: 'browser_stop', desc: 'Emergency stop: cancel queue, block new actions', level: 'safe' },

  { name: 'browser_open', desc: 'Open a URL (alias of navigate)', level: 'medium' },
  { name: 'browser_get_page_summary', desc: 'Compact page text + links (alias of read_page)', level: 'medium' },
  { name: 'browser_find_element', desc: 'Find elements by CSS selector or visible text', level: 'medium' },

  { name: 'browser_select', desc: 'Select a dropdown option (alias)', level: 'sensitive' },

  { name: 'browser_wait_for', desc: 'Wait for the page to load or an element/text to appear', level: 'safe' },
  { name: 'browser_console_messages', desc: 'Read the page console (logs, warnings, errors)', level: 'medium' },
  { name: 'browser_element_screenshot', desc: 'Screenshot a single element', level: 'medium' },
  { name: 'browser_fill_form', desc: 'Fill several fields at once (each checked like browser_type)', level: 'sensitive' },
];

export const McpSection: React.FC<McpSectionProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const { l } = useTranslation();
  // MCP Server state
  const [mcpStatus, setMcpStatus] = useState<{ running: boolean; port: number; clientCount: number; clients: any[] } | null>(null);
  const [mcpToken, setMcpToken] = useState<string>('');
  const [mcpTokenVisible, setMcpTokenVisible] = useState(false);
  const [disabledTools, setDisabledTools] = useState<string[]>([]);
  type RecordingState = { recording: boolean; steps: number; replaying: boolean; recordings: Array<{ id: string; name: string; createdAt: string; steps: number }> };
  const [recState, setRecState] = useState<RecordingState>({ recording: false, steps: 0, replaying: false, recordings: [] });
  const [recName, setRecName] = useState('');
  const [recMessage, setRecMessage] = useState('');
  const [approvalMode, setApprovalMode] = useState<'balanced' | 'strict'>('balanced');
  type ActivityEntry = { id: string; tool: string; domain: string; status: string; reason: string; requestedAt: string; risk: string };
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [activityFilter, setActivityFilter] = useState<'all' | 'completed' | 'rejected' | 'failed' | 'cancelled'>('all');
  const [siteRules, setSiteRules] = useState<Array<{ domain: string; mode: 'ask' | 'block' }>>([]);
  const [ruleDomain, setRuleDomain] = useState('');
  const [ruleMode, setRuleMode] = useState<'ask' | 'block'>('ask');
  const [mcpCopied, setMcpCopied] = useState(false);
  const [tokenCopied, setTokenCopied] = useState(false);
  const [logExporting, setLogExporting] = useState(false);
  const { setSafeTimeout } = useSafeTimeout();

  const fetchMcpStatus = useCallback(async () => {
    if ((window as any).electronAPI?.getMcpStatus) {
      const status = await (window as any).electronAPI.getMcpStatus();
      setMcpStatus(status);
    }
    if ((window as any).electronAPI?.getMcpTokenStatus) {
      const tokenStatus = await (window as any).electronAPI.getMcpTokenStatus();
      if (tokenStatus?.configured) {
        setMcpToken(tokenStatus.prefix || 'king_mcp_••••••••');
      } else {
        setMcpToken('');
      }
    }
    if ((window as any).electronAPI?.getMcpToolSettings) {
      setDisabledTools(await (window as any).electronAPI.getMcpToolSettings());
    }
    if ((window as any).electronAPI?.getMcpSiteRules) {
      setSiteRules(await (window as any).electronAPI.getMcpSiteRules());
    }
    if ((window as any).electronAPI?.getMcpApprovalMode) {
      setApprovalMode(await (window as any).electronAPI.getMcpApprovalMode());
    }
  }, []);

  const loadActivity = useCallback(async () => {
    try {
      const raw = await (window as any).electronAPI?.exportEngineLog?.('json');
      const parsed = raw ? JSON.parse(raw) : null;
      setActivity(Array.isArray(parsed?.entries) ? parsed.entries.slice().reverse().slice(0, 100) : []);
    } catch (_) {
      setActivity([]);
    }
  }, []);

  useEffect(() => { void loadActivity(); }, [loadActivity]);

  const loadRecordings = useCallback(async () => {
    try {
      const state = await (window as any).electronAPI?.getRecordingState?.();
      if (state) setRecState(state);
    } catch (_) {}
  }, []);
  useEffect(() => { void loadRecordings(); }, [loadRecordings]);

  const startRecording = useCallback(async () => {
    setRecMessage('');
    const ok = await (window as any).electronAPI?.startRecording?.();
    if (!ok) setRecMessage('Could not start: start the MCP server first, and finish any recording or replay in progress.');
    await loadRecordings();
  }, [loadRecordings]);

  const stopRecording = useCallback(async () => {
    const result = await (window as any).electronAPI?.stopRecording?.(recName);
    setRecName('');
    const skipped = result?.skipped?.length ? ' ' + l({ en: '{n} step(s) could not be recorded.', ar: 'تعذّر تسجيل {n} من الخطوات.', de: '{n} Schritt(e) konnten nicht aufgezeichnet werden.' }, { n: result.skipped.length }) : '';
    setRecMessage(result?.saved ? l({ en: 'Saved "{name}" with {n} step(s).', ar: 'حُفظ "{name}" بعدد {n} من الخطوات.', de: '„{name}“ mit {n} Schritt(en) gespeichert.' }, { name: result.saved.name, n: result.saved.steps }) + skipped : l({ en: 'Nothing to save: no repeatable steps were recorded.', ar: 'لا شيء للحفظ: لم تُسجَّل خطوات قابلة للإعادة.', de: 'Nichts zu speichern: Es wurden keine wiederholbaren Schritte aufgezeichnet.' }) + skipped);
    await loadRecordings();
  }, [recName, loadRecordings]);

  const replayRecording = useCallback(async (id: string) => {
    setRecMessage(l({ en: 'Replaying... approvals appear as usual.', ar: 'جارٍ الإعادة... تظهر طلبات الموافقة كالمعتاد.', de: 'Wird wiedergegeben... Freigaben erscheinen wie gewohnt.' }));
    setRecState(prev => ({ ...prev, replaying: true }));
    const report = await (window as any).electronAPI?.replayRecording?.(id);
    setRecMessage(report?.message ?? l({ en: 'Replay finished.', ar: 'انتهت الإعادة.', de: 'Wiedergabe beendet.' }));
    await loadRecordings();
  }, [loadRecordings]);

  const deleteRecording = useCallback(async (id: string) => {
    await (window as any).electronAPI?.deleteRecording?.(id);
    await loadRecordings();
  }, [loadRecordings]);

  const changeApprovalMode = useCallback(async (mode: 'balanced' | 'strict') => {
    const api = (window as any).electronAPI;
    if (!api?.setMcpApprovalMode) return;
    setApprovalMode(await api.setMcpApprovalMode(mode));
  }, []);

  const saveSiteRules = useCallback(async (next: Array<{ domain: string; mode: 'ask' | 'block' }>) => {
    const api = (window as any).electronAPI;
    if (!api?.setMcpSiteRules) return;
    // The main process validates and de-duplicates; show what it actually stored.
    setSiteRules(await api.setMcpSiteRules(next));
  }, []);

  useEffect(() => {
    fetchMcpStatus();

    let cleanup: (() => void) | void;
    let cleanupStatus: (() => void) | void;
    if ((window as any).electronAPI?.onMcpClientChanged) {
      cleanup = (window as any).electronAPI.onMcpClientChanged((_: any, data: any) => {
        setMcpStatus(prev => prev ? { ...prev, clientCount: data.count, clients: data.clients } : null);
      });
    }
    if ((window as any).electronAPI?.onMcpStatusChanged) {
      cleanupStatus = (window as any).electronAPI.onMcpStatusChanged((_: any, status: any) => {
        const isRunning = typeof status === 'object' && status !== null ? Boolean(status.running) : Boolean(status);
        const port = typeof status === 'object' && status?.port ? Number(status.port) : 3020;
        setMcpStatus(prev => prev ? { ...prev, running: isRunning, port: port || prev.port } : { running: isRunning, port, clientCount: 0, clients: [] });
      });
    }
    return () => {
      if (typeof cleanup === 'function') cleanup();
      if (typeof cleanupStatus === 'function') cleanupStatus();
    };
  }, [fetchMcpStatus]);

  const handleToggleMcp = async () => {
    const isRunning = mcpStatus?.running || false;
    if (isRunning) {
      await (window as any).electronAPI?.stopMcpServer?.();
      onUpdateSettings({ mcpServerEnabled: false });
    } else {
      await (window as any).electronAPI?.startMcpServer?.();
      onUpdateSettings({ mcpServerEnabled: true });
    }
    setSafeTimeout(fetchMcpStatus, 300);
  };

  const handleRotateToken = async () => {
    if ((window as any).electronAPI?.rotateMcpToken) {
      await (window as any).electronAPI.rotateMcpToken();
      await fetchMcpStatus();
    }
  };

  const handleCopyToken = async () => {
    // Real token lives in main process — copy via IPC, never the masked prefix.
    try {
      if ((window as any).electronAPI?.copyMcpToken) {
        const ok = await (window as any).electronAPI.copyMcpToken();
        if (ok) {
          setTokenCopied(true);
          setSafeTimeout(() => setTokenCopied(false), 2000);
          return;
        }
      }
    } catch (_) {}
    // Fallback only when we hold an unmasked value; placeholder prefix must not be copied.
    if (mcpToken && !isMaskedToken(mcpToken)) {
      const ok = await copyTextToClipboard(mcpToken);
      if (ok) {
        setTokenCopied(true);
        setSafeTimeout(() => setTokenCopied(false), 2000);
      }
    }
  };

  const handleToggleTool = async (toolName: string, currentlyDisabled: boolean) => {
    if ((window as any).electronAPI?.setMcpToolEnabled) {
      await (window as any).electronAPI.setMcpToolEnabled(toolName, currentlyDisabled); // true means enable it, false means disable it
      fetchMcpStatus();
    }
  };

  const mcpConfigSnippet = `{
  "mcpServers": {
    "king-browser": {
      "command": "node",
      "args": ["<King Browser install>/resources/mcp-bridge.cjs"],
      "env": {
        "MCP_TOKEN": "${mcpToken}",
        "MCP_PORT": "${mcpStatus?.port || 3020}"
      }
    }
  }
}`;

  const handleExportLog = async (format: 'json' | 'csv') => {
    if (logExporting) return;
    setLogExporting(true);
    try {
      const api = (window as any).electronAPI;
      if (api?.exportEngineLog) {
        const content = await api.exportEngineLog(format);
        if (typeof content === 'string' && content) {
          const blob = new Blob([content], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          const ts = new Date().toISOString().replace(/[:.]/g, '-');
          a.href = url;
          a.download = `king-activity-${ts}.${format}`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      }
    } catch (e) {
      console.error('Failed to export activity log', e);
    } finally {
      setLogExporting(false);
    }
  };

  const handleCopyOpenCodeConfig = async () => {
    try {
      const result = await (window as any).electronAPI?.copyMcpConfig?.('opencode');
      if (result) {
        setMcpCopied(true);
        setSafeTimeout(() => setMcpCopied(false), 2000);
      }
    } catch (_) {}
  };

  const handleCopyConfig = async () => {
    // Main builds the config with the real token — prefer IPC over the
    // status prefix shown in the UI.
    try {
      if ((window as any).electronAPI?.copyMcpConfig) {
        const ok = await (window as any).electronAPI.copyMcpConfig();
        if (ok) {
          setMcpCopied(true);
          setSafeTimeout(() => setMcpCopied(false), 2000);
          return;
        }
      }
    } catch (_) {}
    const ok = await copyTextToClipboard(mcpConfigSnippet);
    if (ok) {
      setMcpCopied(true);
      setSafeTimeout(() => setMcpCopied(false), 2000);
    }
  };

  return (
    <div className="p-8 space-y-8 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-3">
            <Cpu className="w-6 h-6 text-blue-500" />
            {l({ en: 'MCP Server', ar: 'خادم MCP', de: 'MCP-Server' })}
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">{l({ en: 'Model Context Protocol — Let AI tools control King Browser', ar: 'بروتوكول سياق النموذج (MCP): اسمح لأدوات الذكاء الاصطناعي بالتحكم في King Browser', de: 'Model Context Protocol – KI-Werkzeuge steuern King Browser' })}</p>
        </div>
        <button
          onClick={handleToggleMcp}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium text-sm transition-all ${
            mcpStatus?.running
              ? 'bg-red-100 text-red-600 hover:bg-red-200 dark:bg-red-500/20 dark:text-red-400'
              : 'bg-blue-100 text-blue-600 hover:bg-blue-200 dark:bg-blue-500/20 dark:text-blue-400'
          }`}
        >
          {mcpStatus?.running ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {mcpStatus?.running ? l({ en: 'Stop Server', ar: 'إيقاف الخادم', de: 'Server stoppen' }) : l({ en: 'Start Server', ar: 'تشغيل الخادم', de: 'Server starten' })}
        </button>
      </div>

      {/* Status Card */}
      <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${mcpStatus?.running ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              {mcpStatus?.running ? l({ en: 'Running', ar: 'يعمل', de: 'Läuft' }) : l({ en: 'Stopped', ar: 'متوقف', de: 'Gestoppt' })}
            </span>
            {mcpStatus?.running && (
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">
                http://localhost:{mcpStatus.port}/sse
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Users className="w-4 h-4" />
            <span>{l({ en: '{n} connected', ar: '{n} متصل', de: '{n} verbunden' }, { n: mcpStatus?.clientCount || 0 })}</span>
          </div>
        </div>

        {/* Connected clients list */}
        {(mcpStatus?.clients?.length || 0) > 0 && (
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-2">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">{l({ en: 'Connected Clients', ar: 'العملاء المتصلون', de: 'Verbundene Clients' })}</p>
            {mcpStatus?.clients?.map((c: any) => (
              <div key={c.id} className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-slate-700 dark:text-slate-300 truncate">{c.userAgent}</span>
                <span className="text-slate-400 text-xs ms-auto">
                  {Math.round((Date.now() - c.connectedAt) / 1000)}s ago
                </span>
              </div>
            )) ?? null}
          </div>
        )}
      </div>

      {/* API Token Card */}
      <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Key className="w-4 h-4 text-purple-500" />
          <p className="font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'API Token Authentication', ar: 'المصادقة برمز API', de: 'API-Token-Authentifizierung' })}</p>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <input
            type={mcpTokenVisible ? "text" : "password"}
            value={mcpToken}
            readOnly
            className="flex-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-600 dark:text-slate-300 focus:outline-none focus:border-purple-500 font-mono"
          />
          <button
            onClick={() => setMcpTokenVisible(!mcpTokenVisible)}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            title={mcpTokenVisible ? l({ en: 'Hide Token', ar: 'إخفاء الرمز', de: 'Token verbergen' }) : l({ en: 'Show Token', ar: 'إظهار الرمز', de: 'Token anzeigen' })}
          >
            {mcpTokenVisible ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
          </button>
          <button
            onClick={handleCopyToken}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            {tokenCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <button
            onClick={handleRotateToken}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400 text-sm hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors"
            title={l({ en: 'Revoke old token and generate a new one', ar: 'إلغاء الرمز القديم وإنشاء رمز جديد', de: 'Altes Token widerrufen und ein neues erzeugen' })}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {l({ en: 'Rotate', ar: 'تجديد', de: 'Erneuern' })}
          </button>
        </div>
        <p className="text-xs text-slate-500">{l({ en: 'This token is required for all MCP clients to connect securely.', ar: 'هذا الرمز مطلوب لاتصال كل عملاء MCP بأمان.', de: 'Dieses Token benötigen alle MCP-Clients für eine sichere Verbindung.' })}</p>
      </div>

      {/* Activity Log */}
      <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Agent Activity Log', ar: 'سجل نشاط الوكيل', de: 'Agent-Aktivitätsprotokoll' })}</p>
            <p className="text-xs text-slate-500 mt-0.5">{l({ en: 'Export every executed/declined action with reason (JSON or CSV). Stored in memory.', ar: 'صدّر كل إجراء نُفّذ أو رُفض مع السبب (JSON أو CSV). يُحفظ في الذاكرة.', de: 'Jede ausgeführte oder abgelehnte Aktion mit Grund exportieren (JSON oder CSV). Im Arbeitsspeicher gespeichert.' })}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExportLog('json')}
              disabled={logExporting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
            >
              <Copy className="w-3.5 h-3.5" />
              {logExporting ? l({ en: 'Exporting…', ar: 'جارٍ التصدير…', de: 'Wird exportiert…' }) : l({ en: 'Export JSON', ar: 'تصدير JSON', de: 'JSON exportieren' })}
            </button>
            <button
              onClick={() => handleExportLog('csv')}
              disabled={logExporting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
            >
              <Copy className="w-3.5 h-3.5" />
              {logExporting ? l({ en: 'Exporting…', ar: 'جارٍ التصدير…', de: 'Wird exportiert…' }) : l({ en: 'Export CSV', ar: 'تصدير CSV', de: 'CSV exportieren' })}
            </button>
          </div>
        </div>
      </div>

      {/* Config snippet */}
      <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Setup Guide', ar: 'دليل الإعداد', de: 'Einrichtungsanleitung' })}</p>
            <p className="text-xs text-slate-500 mt-0.5">{l({ en: 'Add this to your AI tool\'s MCP config (e.g., claude_desktop_config.json). Copied configs run the bundled stdio bridge, so Node.js must be on PATH.', ar: 'أضف هذا إلى إعدادات MCP في أداة الذكاء الاصطناعي (مثل claude_desktop_config.json). تشغّل الإعدادات المنسوخة جسر stdio المرفق، لذا يجب أن يكون Node.js ضمن PATH.', de: 'Fügen Sie dies der MCP-Konfiguration Ihres KI-Werkzeugs hinzu (z. B. claude_desktop_config.json). Kopierte Konfigurationen starten die mitgelieferte stdio-Bridge; Node.js muss im PATH sein.' })}</p>
          </div>
          <button
            onClick={handleCopyOpenCodeConfig}
            title={l({ en: 'Copies a ready opencode.json entry (type: local) that runs the bundled stdio bridge with the live port and token. Paste it into opencode.json in your project or ~/.config/opencode/opencode.json. Requires Node.js on PATH.', ar: 'ينسخ إدخالاً جاهزاً لملف opencode.json (type: local) يشغّل جسر stdio المرفق بالمنفذ والرمز الحاليين. الصقه في opencode.json في مشروعك أو في ~/.config/opencode/opencode.json. يتطلب وجود Node.js ضمن PATH.', de: 'Kopiert einen fertigen opencode.json-Eintrag (type: local), der die mitgelieferte stdio-Bridge mit aktuellem Port und Token startet. Fügen Sie ihn in opencode.json Ihres Projekts oder in ~/.config/opencode/opencode.json ein. Node.js muss im PATH sein.' })}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
            OpenCode
          </button>
          <button
            onClick={handleCopyConfig}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
          >
            {mcpCopied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
            {mcpCopied ? l({ en: 'Copied!', ar: 'تم النسخ!', de: 'Kopiert!' }) : l({ en: 'Copy', ar: 'نسخ', de: 'Kopieren' })}
          </button>
        </div>
        <pre className="bg-slate-950 text-green-400 text-sm rounded-xl p-4 font-mono overflow-x-auto leading-relaxed whitespace-pre-wrap break-all">
          {mcpConfigSnippet}
        </pre>
      </div>

      {/* Tools list & Permissions */}
      <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-orange-500" />
          <p className="font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Tool Permissions ({n})', ar: 'أذونات الأدوات ({n})', de: 'Werkzeugberechtigungen ({n})' }, { n: MCP_TOOLS.length })}</p>
        </div>
        <p className="text-xs text-slate-500 mb-2">{l({ en: 'Enable or disable specific browser capabilities. Sensitive actions are disabled by default.', ar: 'فعّل أو عطّل قدرات معيّنة في المتصفح. الإجراءات الحساسة معطّلة افتراضياً.', de: 'Bestimmte Browserfunktionen aktivieren oder deaktivieren. Sensible Aktionen sind standardmäßig deaktiviert.' })}</p>
        <div className="grid grid-cols-1 gap-1.5 max-h-[400px] overflow-y-auto pe-1">
          {MCP_TOOLS.map(tool => {
            const isDisabled = disabledTools.includes(tool.name);
            let badgeClass = "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400";
            let badgeText = l({ en: 'Safe', ar: 'آمن', de: 'Sicher' });
            if (tool.level === 'medium') {
              badgeClass = "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400";
              badgeText = l({ en: 'Medium', ar: 'متوسط', de: 'Mittel' });
            } else if (tool.level === 'sensitive') {
              badgeClass = "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400";
              badgeText = l({ en: 'Sensitive', ar: 'حساس', de: 'Sensibel' });
            }

            return (
              <div key={tool.name} className={`flex items-center justify-between py-2 px-3 rounded-lg border transition-colors ${isDisabled ? 'bg-slate-50 border-slate-200 dark:bg-slate-800/30 dark:border-slate-700/50 opacity-60' : 'bg-white border-slate-200 dark:bg-slate-800/50 dark:border-slate-700/50'}`}>
                <div className="flex flex-col gap-1 pe-4 min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="text-xs text-blue-600 dark:text-blue-400 font-mono font-medium truncate">{tool.name}</code>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${badgeClass}`}>{badgeText}</span>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 truncate">{tool.desc}</span>
                </div>
                <button
                  onClick={() => handleToggleTool(tool.name, isDisabled)}
                  className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${!isDisabled ? (tool.level === 'sensitive' ? 'bg-orange-500' : 'bg-blue-500') : 'bg-slate-200 dark:bg-slate-600'}`}
                  role="switch"
                  aria-checked={!isDisabled}
                >
                  <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${!isDisabled ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {/* Persistent agent profile */}
      {settings.agentIsolatedProfile && (
        <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Keep the agent\'s logins', ar: 'الاحتفاظ بتسجيلات دخول الوكيل', de: 'Anmeldungen des Agenten behalten' })}</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {l({ en: 'Saves the agent session (cookies and logins) on this computer so you only sign in once: open a tab with the agent, sign in yourself, then let the agent work. The agent never sees your password. Anyone with access to this computer, and any instruction the agent follows, can use those logins until you clear them. Applies to tabs the agent opens from now on.', ar: 'يحفظ جلسة الوكيل (ملفات تعريف الارتباط وتسجيلات الدخول) على هذا الحاسوب لتسجّل الدخول مرة واحدة فقط: افتح تبويباً للوكيل، وسجّل الدخول بنفسك، ثم دع الوكيل يعمل. لا يرى الوكيل كلمة مرورك أبداً. يستطيع أي شخص يصل إلى هذا الحاسوب، وأي تعليمات ينفذها الوكيل، استخدام تسجيلات الدخول هذه حتى تمسحها. ينطبق على التبويبات التي يفتحها الوكيل من الآن فصاعداً.', de: 'Speichert die Agent-Sitzung (Cookies und Anmeldungen) auf diesem Computer, damit Sie sich nur einmal anmelden: Öffnen Sie einen Tab mit dem Agenten, melden Sie sich selbst an und lassen Sie dann den Agenten arbeiten. Der Agent sieht Ihr Passwort nie. Jeder mit Zugriff auf diesen Computer und jede Anweisung, der der Agent folgt, kann diese Anmeldungen nutzen, bis Sie sie löschen. Gilt für Tabs, die der Agent ab jetzt öffnet.' })}
              </p>
            </div>
            <button
              onClick={() => onUpdateSettings({ agentPersistentProfile: !settings.agentPersistentProfile })}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.agentPersistentProfile ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-600'}`}
              role="switch"
              aria-checked={Boolean(settings.agentPersistentProfile)}
              aria-label={l({ en: 'Keep the agent\'s logins', ar: 'الاحتفاظ بتسجيلات دخول الوكيل', de: 'Anmeldungen des Agenten behalten' })}
            >
              <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.agentPersistentProfile ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
          </div>
          <button
            onClick={async () => {
              if (!await showConfirm({ message: l({ en: 'Clear everything the agent has stored (cookies, logins, caches)?', ar: 'هل تريد مسح كل ما خزّنه الوكيل (ملفات تعريف الارتباط، تسجيلات الدخول، الذاكرة المؤقتة)؟', de: 'Alles löschen, was der Agent gespeichert hat (Cookies, Anmeldungen, Caches)?' }), confirmLabel: l({ en: 'Clear', ar: 'مسح', de: 'Löschen' }) })) return;
              await (window as any).electronAPI?.clearAgentProfile?.();
            }}
            className="px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 text-sm hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            {l({ en: 'Clear the agent\'s session', ar: 'مسح جلسة الوكيل', de: 'Agent-Sitzung löschen' })}
          </button>
        </div>
      )}

      {/* Record and replay */}
      <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 space-y-3">
        <p className="font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Record and replay', ar: 'التسجيل والإعادة', de: 'Aufzeichnen und wiedergeben' })}</p>
        <p className="text-xs text-slate-500">
          {l({ en: 'Record what an agent does, then replay it later without any AI model. Every replayed step goes through the same approval as a live action. Text typed into password-like fields is never stored; a replay stops there and waits for you. Steps that used a page element are found again by their role and name, and the replay stops if the page no longer has them.', ar: 'سجّل ما يفعله الوكيل ثم أعده لاحقاً دون أي نموذج ذكاء اصطناعي. تمرّ كل خطوة مُعادة بالموافقة نفسها التي يمرّ بها الإجراء المباشر. لا يُحفظ أي نص يُكتب في حقول كلمات المرور؛ تتوقف الإعادة هناك وتنتظرك. يُعاد العثور على عناصر الصفحة بدورها واسمها، وتتوقف الإعادة إن لم تعد الصفحة تحتويها.', de: 'Zeichnen Sie auf, was ein Agent tut, und spielen Sie es später ohne KI-Modell ab. Jeder wiedergegebene Schritt durchläuft dieselbe Freigabe wie eine Live-Aktion. In passwortähnliche Felder eingegebener Text wird nie gespeichert; die Wiedergabe hält dort an und wartet auf Sie. Seitenelemente werden über Rolle und Namen wiedergefunden; fehlen sie, stoppt die Wiedergabe.' })}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {!recState.recording ? (
            <button onClick={() => void startRecording()} disabled={recState.replaying} className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600 disabled:opacity-40">{l({ en: 'Start recording', ar: 'بدء التسجيل', de: 'Aufnahme starten' })}</button>
          ) : (
            <>
              <input
                value={recName}
                onChange={(event) => setRecName(event.target.value)}
                placeholder={l({ en: 'Name this recording', ar: 'سمِّ هذا التسجيل', de: 'Aufzeichnung benennen' })}
                aria-label={l({ en: 'Recording name', ar: 'اسم التسجيل', de: 'Name der Aufzeichnung' })}
                maxLength={80}
                className="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100"
              />
              <button onClick={() => void stopRecording()} className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm hover:bg-red-600">{l({ en: 'Stop and save', ar: 'إيقاف وحفظ', de: 'Stoppen und speichern' })}</button>
              <button onClick={() => void loadRecordings()} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs">{l({ en: '{n} step(s) so far', ar: '{n} خطوة حتى الآن', de: '{n} Schritt(e) bisher' }, { n: recState.steps })}</button>
            </>
          )}
        </div>
        {recMessage && <p className="text-xs text-slate-600 dark:text-slate-300" role="status">{recMessage}</p>}
        {recState.recordings.length === 0 ? (
          <p className="text-xs text-slate-400">{l({ en: 'No recordings yet.', ar: 'لا توجد تسجيلات بعد.', de: 'Noch keine Aufzeichnungen.' })}</p>
        ) : (
          <ul className="space-y-1.5">
            {recState.recordings.map(rec => (
              <li key={rec.id} className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700/50">
                <span className="min-w-0 truncate text-sm text-slate-700 dark:text-slate-200">{rec.name} <span className="text-xs text-slate-400">({l({ en: '{n} steps', ar: '{n} خطوات', de: '{n} Schritte' }, { n: rec.steps })})</span></span>
                <span className="flex items-center gap-2 shrink-0">
                  <button onClick={() => void replayRecording(rec.id)} disabled={recState.replaying || recState.recording} className="text-xs text-blue-600 hover:underline disabled:opacity-40">{l({ en: 'Replay', ar: 'إعادة', de: 'Wiedergeben' })}</button>
                  <button onClick={() => void deleteRecording(rec.id)} aria-label={l({ en: 'Delete {name}', ar: 'حذف {name}', de: '{name} löschen' }, { name: rec.name })} className="text-xs text-slate-500 hover:text-red-600">{l({ en: 'Delete', ar: 'حذف', de: 'Löschen' })}</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Approval mode */}
      <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Approval mode', ar: 'وضع الموافقة', de: 'Freigabemodus' })}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {l({ en: 'Balanced asks for sensitive actions only (purchases, sending, deleting, sign-in and similar). Strict asks for every agent action, including reading a page. Sensitive actions always ask in both modes.', ar: '«متوازن» يطلب الموافقة على الإجراءات الحساسة فقط (الشراء، الإرسال، الحذف، تسجيل الدخول وما شابه). «صارم» يطلبها لكل إجراء يقوم به الوكيل، حتى قراءة الصفحة. الإجراءات الحساسة تطلب الموافقة دائماً في الوضعين.', de: '„Ausgewogen“ fragt nur bei sensiblen Aktionen (Käufe, Senden, Löschen, Anmelden und Ähnliches). „Streng“ fragt bei jeder Agent-Aktion, auch beim Lesen einer Seite. Sensible Aktionen fragen in beiden Modi immer nach.' })}
            </p>
          </div>
          <select
            value={approvalMode}
            onChange={(event) => void changeApprovalMode(event.target.value === 'strict' ? 'strict' : 'balanced')}
            aria-label={l({ en: 'Approval mode', ar: 'وضع الموافقة', de: 'Freigabemodus' })}
            className="shrink-0 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100"
          >
            <option value="balanced">{l({ en: 'Balanced', ar: 'متوازن', de: 'Ausgewogen' })}</option>
            <option value="strict">{l({ en: 'Strict', ar: 'صارم', de: 'Streng' })}</option>
          </select>
        </div>
      </div>

      {/* Activity log */}
      <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Agent activity ({n})', ar: 'نشاط الوكيل ({n})', de: 'Agent-Aktivität ({n})' }, { n: activity.length })}</p>
          <div className="flex items-center gap-2">
            <select
              value={activityFilter}
              onChange={(event) => setActivityFilter(event.target.value as typeof activityFilter)}
              aria-label={l({ en: 'Filter activity', ar: 'تصفية النشاط', de: 'Aktivität filtern' })}
              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100"
            >
              <option value="all">{l({ en: 'All', ar: 'الكل', de: 'Alle' })}</option>
              <option value="completed">{l({ en: 'Completed', ar: 'مكتمل', de: 'Abgeschlossen' })}</option>
              <option value="rejected">{l({ en: 'Rejected', ar: 'مرفوض', de: 'Abgelehnt' })}</option>
              <option value="failed">{l({ en: 'Failed', ar: 'فشل', de: 'Fehlgeschlagen' })}</option>
              <option value="cancelled">{l({ en: 'Cancelled', ar: 'ملغى', de: 'Abgebrochen' })}</option>
            </select>
            <button onClick={() => void loadActivity()} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs hover:bg-slate-200 dark:hover:bg-slate-600">{l({ en: 'Refresh', ar: 'تحديث', de: 'Aktualisieren' })}</button>
          </div>
        </div>
        {(() => {
          const rows = activity.filter(entry => activityFilter === 'all' || entry.status === activityFilter);
          if (rows.length === 0) return <p className="text-xs text-slate-400">{l({ en: 'No activity to show.', ar: 'لا يوجد نشاط لعرضه.', de: 'Keine Aktivität vorhanden.' })}</p>;
          return (
            <div className="max-h-[300px] overflow-y-auto pe-1">
              <table className="w-full text-xs text-start">
                <thead className="text-slate-500">
                  <tr><th className="py-1 pe-2 font-medium">{l({ en: 'Time', ar: 'الوقت', de: 'Zeit' })}</th><th className="py-1 pe-2 font-medium">{l({ en: 'Tool', ar: 'الأداة', de: 'Werkzeug' })}</th><th className="py-1 pe-2 font-medium">{l({ en: 'Site', ar: 'الموقع', de: 'Website' })}</th><th className="py-1 pe-2 font-medium">{l({ en: 'Result', ar: 'النتيجة', de: 'Ergebnis' })}</th></tr>
                </thead>
                <tbody>
                  {rows.map(entry => (
                    <tr key={entry.id} className="border-t border-slate-100 dark:border-slate-700/50 align-top" title={entry.reason || undefined}>
                      <td className="py-1 pe-2 whitespace-nowrap text-slate-500">{entry.requestedAt ? new Date(entry.requestedAt).toLocaleString() : ''}</td>
                      <td className="py-1 pe-2"><code className="text-blue-600 dark:text-blue-400">{entry.tool}</code></td>
                      <td className="py-1 pe-2 text-slate-600 dark:text-slate-300 break-all">{entry.domain}</td>
                      <td className={`py-1 pe-2 font-medium ${entry.status === 'completed' ? 'text-green-600' : entry.status === 'rejected' ? 'text-amber-600' : 'text-red-600'}`}>{({ completed: l({ en: 'completed', ar: 'مكتمل', de: 'abgeschlossen' }), rejected: l({ en: 'rejected', ar: 'مرفوض', de: 'abgelehnt' }), failed: l({ en: 'failed', ar: 'فشل', de: 'fehlgeschlagen' }), cancelled: l({ en: 'cancelled', ar: 'ملغى', de: 'abgebrochen' }) } as Record<string, string>)[entry.status] ?? entry.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
        <p className="text-[11px] text-slate-400">{l({ en: 'Showing the latest 100 saved actions. Hover a row for the reason. Export the full log from the Agent Control panel.', ar: 'يُعرض آخر 100 إجراء محفوظ. مرّر المؤشر فوق صف لمعرفة السبب. صدّر السجل الكامل من لوحة التحكم بالوكيل.', de: 'Die letzten 100 gespeicherten Aktionen. Fahren Sie über eine Zeile, um den Grund zu sehen. Das vollständige Protokoll exportieren Sie im Agent-Steuerungsfeld.' })}</p>
      </div>

      {/* Isolated agent profile */}
      <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Isolated agent profile', ar: 'ملف تعريف معزول للوكيل', de: 'Isoliertes Agent-Profil' })}</p>
            <p className="text-xs text-slate-500 mt-0.5">
              {l({ en: 'The agent works in its own session (separate cookies and storage) and can only see and use tabs it opened itself, never the tabs you are signed in to. It starts signed out. By default this session is cleared when you close the window.', ar: 'يعمل الوكيل في جلسته الخاصة (ملفات تعريف ارتباط وتخزين منفصلين) ولا يرى ولا يستخدم إلا التبويبات التي فتحها بنفسه، وليس أبداً التبويبات التي سجّلت فيها دخولك. يبدأ دون تسجيل دخول، وتُمسح هذه الجلسة افتراضياً عند إغلاق النافذة.', de: 'Der Agent arbeitet in einer eigenen Sitzung (getrennte Cookies und Speicher) und sieht und nutzt nur Tabs, die er selbst geöffnet hat, nie Tabs, in denen Sie angemeldet sind. Er startet abgemeldet. Standardmäßig wird diese Sitzung beim Schließen des Fensters gelöscht.' })}
            </p>
          </div>
          <button
            onClick={() => onUpdateSettings({ agentIsolatedProfile: !settings.agentIsolatedProfile })}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.agentIsolatedProfile ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-600'}`}
            role="switch"
            aria-checked={Boolean(settings.agentIsolatedProfile)}
            aria-label={l({ en: 'Isolated agent profile', ar: 'ملف تعريف معزول للوكيل', de: 'Isoliertes Agent-Profil' })}
          >
            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.agentIsolatedProfile ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      {/* Per-site rules */}
      <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-500" />
          <p className="font-semibold text-slate-800 dark:text-slate-100">{l({ en: 'Site Rules ({n})', ar: 'قواعد المواقع ({n})', de: 'Website-Regeln ({n})' }, { n: siteRules.length })}</p>
        </div>
        <p className="text-xs text-slate-500">
          {l({ en: 'Always ask requires your approval for every agent action on a site (for example your bank). Block stops the agent from reading, using or opening it. Rules also apply to subdomains and can only make the agent more restricted.', ar: '«اسأل دائماً» يتطلب موافقتك على كل إجراء للوكيل في الموقع (مثل موقع البنك). «حظر» يمنع الوكيل من قراءة الموقع أو استخدامه أو فتحه. تنطبق القواعد على النطاقات الفرعية أيضاً، ولا يمكنها إلا زيادة تقييد الوكيل.', de: '„Immer fragen“ verlangt Ihre Freigabe für jede Agent-Aktion auf einer Website (z. B. Ihrer Bank). „Blockieren“ hindert den Agenten daran, sie zu lesen, zu nutzen oder zu öffnen. Regeln gelten auch für Subdomains und können den Agenten nur stärker einschränken.' })}
        </p>
        <form
          className="flex flex-wrap gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ruleDomain.trim()) return;
            void saveSiteRules([...siteRules, { domain: ruleDomain, mode: ruleMode }]);
            setRuleDomain('');
          }}
        >
          <input
            value={ruleDomain}
            onChange={(event) => setRuleDomain(event.target.value)}
            placeholder="bank.example.com"
            aria-label={l({ en: 'Site domain', ar: 'نطاق الموقع', de: 'Website-Domain' })}
            maxLength={253}
            className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100"
          />
          <select
            value={ruleMode}
            onChange={(event) => setRuleMode(event.target.value === 'block' ? 'block' : 'ask')}
            aria-label={l({ en: 'Rule', ar: 'القاعدة', de: 'Regel' })}
            className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100"
          >
            <option value="ask">{l({ en: 'Always ask', ar: 'اسأل دائماً', de: 'Immer fragen' })}</option>
            <option value="block">{l({ en: 'Block', ar: 'حظر', de: 'Blockieren' })}</option>
          </select>
          <button type="submit" className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600">{l({ en: 'Add', ar: 'إضافة', de: 'Hinzufügen' })}</button>
        </form>
        {siteRules.length === 0 ? (
          <p className="text-xs text-slate-400">{l({ en: 'No site rules yet.', ar: 'لا توجد قواعد مواقع بعد.', de: 'Noch keine Website-Regeln.' })}</p>
        ) : (
          <ul className="space-y-1.5">
            {siteRules.map(rule => (
              <li key={rule.domain} className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700/50">
                <code className="text-xs font-mono text-slate-700 dark:text-slate-200 truncate">{rule.domain}</code>
                <span className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${rule.mode === 'block' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'}`}>
                    {rule.mode === 'block' ? l({ en: 'Block', ar: 'حظر', de: 'Blockieren' }) : l({ en: 'Always ask', ar: 'اسأل دائماً', de: 'Immer fragen' })}
                  </span>
                  <button
                    type="button"
                    onClick={() => void saveSiteRules(siteRules.filter(r => r.domain !== rule.domain))}
                    aria-label={l({ en: 'Remove rule for {domain}', ar: 'إزالة قاعدة {domain}', de: 'Regel für {domain} entfernen' }, { domain: rule.domain })}
                    className="text-xs text-slate-500 hover:text-red-600"
                  >
                    {l({ en: 'Remove', ar: 'إزالة', de: 'Entfernen' })}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
