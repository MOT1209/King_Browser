import React, { useState, useEffect, useCallback } from 'react';
import { Cpu, Play, Square, Copy, Check, Users, Key, RefreshCw, Lock, Unlock, ShieldAlert } from 'lucide-react';
import { UserSettings } from '../../types/browser';
import { copyTextToClipboard } from '../../utils/clipboard';
import { showConfirm } from '../../utils/confirmDialog';
import { useSafeTimeout } from '../../hooks/useSafeTimeout';

// mcpToken from getMcpTokenStatus is only a display prefix (e.g. "king_mcp_••••").
// Never treat a masked value as the real secret.
const isMaskedToken = (v: string) => !v || v.includes('•') || v.includes('****');

export interface McpSectionProps {
  settings: Pick<UserSettings, 'mcpServerEnabled' | 'agentIsolatedProfile' | 'agentPersistentProfile'>;
  onUpdateSettings: (newSettings: Partial<UserSettings>) => void;
}

const MCP_TOOLS = [
  { name: 'browser_navigate', desc: 'Navigate to a URL', level: 'safe' },
  { name: 'browser_read_page', desc: 'Extract full page text + links', level: 'safe' },
  { name: 'browser_snapshot', desc: 'List interactive elements with refs (e12) for click/type', level: 'safe' },
  { name: 'browser_screenshot', desc: 'Take a screenshot', level: 'safe' },
  { name: 'browser_list_tabs', desc: 'List all open tabs', level: 'safe' },
  { name: 'browser_get_url', desc: 'Get the current tab URL', level: 'safe' },
  { name: 'browser_scroll', desc: 'Scroll the page up/down/top/bottom', level: 'safe' },
  { name: 'browser_go_back', desc: 'Navigate back in history', level: 'safe' },
  { name: 'browser_go_forward', desc: 'Navigate forward in history', level: 'safe' },
  { name: 'browser_reload', desc: 'Reload the current page', level: 'safe' },
  { name: 'browser_wait', desc: 'Wait for N milliseconds', level: 'safe' },
  { name: 'browser_get_element_text', desc: 'Get an element\'s text content', level: 'safe' },
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
];

export const McpSection: React.FC<McpSectionProps> = ({
  settings,
  onUpdateSettings,
}) => {
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
    const skipped = result?.skipped?.length ? ` ${result.skipped.length} step(s) could not be recorded.` : '';
    setRecMessage(result?.saved ? `Saved "${result.saved.name}" with ${result.saved.steps} step(s).${skipped}` : `Nothing to save: no repeatable steps were recorded.${skipped}`);
    await loadRecordings();
  }, [recName, loadRecordings]);

  const replayRecording = useCallback(async (id: string) => {
    setRecMessage('Replaying... approvals appear as usual.');
    setRecState(prev => ({ ...prev, replaying: true }));
    const report = await (window as any).electronAPI?.replayRecording?.(id);
    setRecMessage(report?.message ?? 'Replay finished.');
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
            MCP Server
          </h2>
          <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">Model Context Protocol — Let AI tools control King Browser</p>
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
          {mcpStatus?.running ? 'Stop Server' : 'Start Server'}
        </button>
      </div>

      {/* Status Card */}
      <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${mcpStatus?.running ? 'bg-green-500 animate-pulse' : 'bg-slate-400'}`} />
            <span className="font-semibold text-slate-800 dark:text-slate-100">
              {mcpStatus?.running ? 'Running' : 'Stopped'}
            </span>
            {mcpStatus?.running && (
              <span className="text-xs text-slate-500 dark:text-slate-400 font-mono bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded-md">
                http://localhost:{mcpStatus.port}/sse
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Users className="w-4 h-4" />
            <span>{mcpStatus?.clientCount || 0} connected</span>
          </div>
        </div>

        {/* Connected clients list */}
        {(mcpStatus?.clients?.length || 0) > 0 && (
          <div className="border-t border-slate-200 dark:border-slate-700 pt-4 space-y-2">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Connected Clients</p>
            {mcpStatus?.clients?.map((c: any) => (
              <div key={c.id} className="flex items-center gap-2 text-sm">
                <div className="w-2 h-2 rounded-full bg-green-400" />
                <span className="text-slate-700 dark:text-slate-300 truncate">{c.userAgent}</span>
                <span className="text-slate-400 text-xs ml-auto">
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
          <p className="font-semibold text-slate-800 dark:text-slate-100">API Token Authentication</p>
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
            title={mcpTokenVisible ? "Hide Token" : "Show Token"}
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
            title="Revoke old token and generate a new one"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Rotate
          </button>
        </div>
        <p className="text-xs text-slate-500">This token is required for all MCP clients to connect securely.</p>
      </div>

      {/* Activity Log */}
      <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">Agent Activity Log</p>
            <p className="text-xs text-slate-500 mt-0.5">Export every executed/declined action with reason (JSON or CSV). Stored in memory.</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleExportLog('json')}
              disabled={logExporting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
            >
              <Copy className="w-3.5 h-3.5" />
              {logExporting ? 'Exporting…' : 'Export JSON'}
            </button>
            <button
              onClick={() => handleExportLog('csv')}
              disabled={logExporting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-sm hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors disabled:opacity-50"
            >
              <Copy className="w-3.5 h-3.5" />
              {logExporting ? 'Exporting…' : 'Export CSV'}
            </button>
          </div>
        </div>
      </div>

      {/* Config snippet */}
      <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-100">Setup Guide</p>
            <p className="text-xs text-slate-500 mt-0.5">Add this to your AI tool's MCP config (e.g., claude_desktop_config.json). Copied configs run the bundled stdio bridge, so Node.js must be on PATH.</p>
          </div>
          <button
            onClick={handleCopyOpenCodeConfig}
            title="Copies a ready opencode.json entry (type: local) that runs the bundled stdio bridge with the live port and token. Paste it into opencode.json in your project or ~/.config/opencode/opencode.json. Requires Node.js on PATH."
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
            {mcpCopied ? 'Copied!' : 'Copy'}
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
          <p className="font-semibold text-slate-800 dark:text-slate-100">Tool Permissions ({MCP_TOOLS.length})</p>
        </div>
        <p className="text-xs text-slate-500 mb-2">Enable or disable specific browser capabilities. Sensitive actions are disabled by default.</p>
        <div className="grid grid-cols-1 gap-1.5 max-h-[400px] overflow-y-auto pr-1">
          {MCP_TOOLS.map(tool => {
            const isDisabled = disabledTools.includes(tool.name);
            let badgeClass = "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400";
            let badgeText = "Safe";
            if (tool.level === 'medium') {
              badgeClass = "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400";
              badgeText = "Medium";
            } else if (tool.level === 'sensitive') {
              badgeClass = "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400";
              badgeText = "Sensitive";
            }

            return (
              <div key={tool.name} className={`flex items-center justify-between py-2 px-3 rounded-lg border transition-colors ${isDisabled ? 'bg-slate-50 border-slate-200 dark:bg-slate-800/30 dark:border-slate-700/50 opacity-60' : 'bg-white border-slate-200 dark:bg-slate-800/50 dark:border-slate-700/50'}`}>
                <div className="flex flex-col gap-1 pr-4 min-w-0">
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
              <p className="font-semibold text-slate-800 dark:text-slate-100">Keep the agent's logins</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Saves the agent session (cookies and logins) on this computer so you only sign in once: open a tab with the agent, sign in yourself, then let the agent work. The agent never sees your password. Anyone with access to this computer, and any instruction the agent follows, can use those logins until you clear them. Applies to tabs the agent opens from now on.
              </p>
            </div>
            <button
              onClick={() => onUpdateSettings({ agentPersistentProfile: !settings.agentPersistentProfile })}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.agentPersistentProfile ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-600'}`}
              role="switch"
              aria-checked={Boolean(settings.agentPersistentProfile)}
              aria-label="Keep the agent's logins"
            >
              <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.agentPersistentProfile ? 'translate-x-4' : 'translate-x-0'}`} />
            </button>
          </div>
          <button
            onClick={async () => {
              if (!await showConfirm({ message: 'Clear everything the agent has stored (cookies, logins, caches)?', confirmLabel: 'Clear' })) return;
              await (window as any).electronAPI?.clearAgentProfile?.();
            }}
            className="px-3 py-1.5 rounded-lg border border-red-300 dark:border-red-800 text-red-700 dark:text-red-300 text-sm hover:bg-red-50 dark:hover:bg-red-950/40"
          >
            Clear the agent's session
          </button>
        </div>
      )}

      {/* Record and replay */}
      <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 space-y-3">
        <p className="font-semibold text-slate-800 dark:text-slate-100">Record and replay</p>
        <p className="text-xs text-slate-500">
          Record what an agent does, then replay it later without any AI model. Every replayed step goes through the same approval as a live action.
          Text typed into password-like fields is never stored; a replay stops there and waits for you. Steps that used a page element are found again by their role and name, and the replay stops if the page no longer has them.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {!recState.recording ? (
            <button onClick={() => void startRecording()} disabled={recState.replaying} className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600 disabled:opacity-40">Start recording</button>
          ) : (
            <>
              <input
                value={recName}
                onChange={(event) => setRecName(event.target.value)}
                placeholder="Name this recording"
                aria-label="Recording name"
                maxLength={80}
                className="flex-1 min-w-[160px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100"
              />
              <button onClick={() => void stopRecording()} className="px-3 py-1.5 rounded-lg bg-red-500 text-white text-sm hover:bg-red-600">Stop and save</button>
              <button onClick={() => void loadRecordings()} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs">{recState.steps} step(s) so far</button>
            </>
          )}
        </div>
        {recMessage && <p className="text-xs text-slate-600 dark:text-slate-300" role="status">{recMessage}</p>}
        {recState.recordings.length === 0 ? (
          <p className="text-xs text-slate-400">No recordings yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {recState.recordings.map(rec => (
              <li key={rec.id} className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700/50">
                <span className="min-w-0 truncate text-sm text-slate-700 dark:text-slate-200">{rec.name} <span className="text-xs text-slate-400">({rec.steps} steps)</span></span>
                <span className="flex items-center gap-2 shrink-0">
                  <button onClick={() => void replayRecording(rec.id)} disabled={recState.replaying || recState.recording} className="text-xs text-blue-600 hover:underline disabled:opacity-40">Replay</button>
                  <button onClick={() => void deleteRecording(rec.id)} aria-label={`Delete ${rec.name}`} className="text-xs text-slate-500 hover:text-red-600">Delete</button>
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
            <p className="font-semibold text-slate-800 dark:text-slate-100">Approval mode</p>
            <p className="text-xs text-slate-500 mt-0.5">
              <strong>Balanced</strong> asks for sensitive actions only (purchases, sending, deleting, sign-in and similar).
              <strong> Strict</strong> asks for every agent action, including reading a page. Sensitive actions always ask in both modes.
            </p>
          </div>
          <select
            value={approvalMode}
            onChange={(event) => void changeApprovalMode(event.target.value === 'strict' ? 'strict' : 'balanced')}
            aria-label="Approval mode"
            className="shrink-0 px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100"
          >
            <option value="balanced">Balanced</option>
            <option value="strict">Strict</option>
          </select>
        </div>
      </div>

      {/* Activity log */}
      <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="font-semibold text-slate-800 dark:text-slate-100">Agent activity ({activity.length})</p>
          <div className="flex items-center gap-2">
            <select
              value={activityFilter}
              onChange={(event) => setActivityFilter(event.target.value as typeof activityFilter)}
              aria-label="Filter activity"
              className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100"
            >
              <option value="all">All</option>
              <option value="completed">Completed</option>
              <option value="rejected">Rejected</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <button onClick={() => void loadActivity()} className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs hover:bg-slate-200 dark:hover:bg-slate-600">Refresh</button>
          </div>
        </div>
        {(() => {
          const rows = activity.filter(entry => activityFilter === 'all' || entry.status === activityFilter);
          if (rows.length === 0) return <p className="text-xs text-slate-400">No activity to show.</p>;
          return (
            <div className="max-h-[300px] overflow-y-auto pr-1">
              <table className="w-full text-xs text-left">
                <thead className="text-slate-500">
                  <tr><th className="py-1 pr-2 font-medium">Time</th><th className="py-1 pr-2 font-medium">Tool</th><th className="py-1 pr-2 font-medium">Site</th><th className="py-1 pr-2 font-medium">Result</th></tr>
                </thead>
                <tbody>
                  {rows.map(entry => (
                    <tr key={entry.id} className="border-t border-slate-100 dark:border-slate-700/50 align-top" title={entry.reason || undefined}>
                      <td className="py-1 pr-2 whitespace-nowrap text-slate-500">{entry.requestedAt ? new Date(entry.requestedAt).toLocaleString() : ''}</td>
                      <td className="py-1 pr-2"><code className="text-blue-600 dark:text-blue-400">{entry.tool}</code></td>
                      <td className="py-1 pr-2 text-slate-600 dark:text-slate-300 break-all">{entry.domain}</td>
                      <td className={`py-1 pr-2 font-medium ${entry.status === 'completed' ? 'text-green-600' : entry.status === 'rejected' ? 'text-amber-600' : 'text-red-600'}`}>{entry.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        })()}
        <p className="text-[11px] text-slate-400">Showing the latest 100 saved actions. Hover a row for the reason. Export the full log from the Agent Control panel.</p>
      </div>

      {/* Isolated agent profile */}
      <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 space-y-3">
        <div className="flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="font-semibold text-slate-800 dark:text-slate-100">Isolated agent profile</p>
            <p className="text-xs text-slate-500 mt-0.5">
              The agent works in its own session (separate cookies and storage) and can only see and use tabs it opened itself, never the tabs you are signed in to.
              It starts signed out. By default this session is cleared when you close the window.
            </p>
          </div>
          <button
            onClick={() => onUpdateSettings({ agentIsolatedProfile: !settings.agentIsolatedProfile })}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${settings.agentIsolatedProfile ? 'bg-blue-500' : 'bg-slate-200 dark:bg-slate-600'}`}
            role="switch"
            aria-checked={Boolean(settings.agentIsolatedProfile)}
            aria-label="Isolated agent profile"
          >
            <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.agentIsolatedProfile ? 'translate-x-4' : 'translate-x-0'}`} />
          </button>
        </div>
      </div>

      {/* Per-site rules */}
      <div className="premium-card bg-white dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700/50 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-500" />
          <p className="font-semibold text-slate-800 dark:text-slate-100">Site Rules ({siteRules.length})</p>
        </div>
        <p className="text-xs text-slate-500">
          <strong>Always ask</strong> requires your approval for every agent action on a site (for example your bank).
          <strong> Block</strong> stops the agent from reading, using or opening it. Rules also apply to subdomains and can only make the agent more restricted.
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
            aria-label="Site domain"
            maxLength={253}
            className="flex-1 min-w-[180px] px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100"
          />
          <select
            value={ruleMode}
            onChange={(event) => setRuleMode(event.target.value === 'block' ? 'block' : 'ask')}
            aria-label="Rule"
            className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-100"
          >
            <option value="ask">Always ask</option>
            <option value="block">Block</option>
          </select>
          <button type="submit" className="px-3 py-1.5 rounded-lg bg-blue-500 text-white text-sm hover:bg-blue-600">Add</button>
        </form>
        {siteRules.length === 0 ? (
          <p className="text-xs text-slate-400">No site rules yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {siteRules.map(rule => (
              <li key={rule.domain} className="flex items-center justify-between gap-2 py-1.5 px-3 rounded-lg border border-slate-200 dark:border-slate-700/50">
                <code className="text-xs font-mono text-slate-700 dark:text-slate-200 truncate">{rule.domain}</code>
                <span className="flex items-center gap-2 shrink-0">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${rule.mode === 'block' ? 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400' : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400'}`}>
                    {rule.mode === 'block' ? 'Block' : 'Always ask'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void saveSiteRules(siteRules.filter(r => r.domain !== rule.domain))}
                    aria-label={`Remove rule for ${rule.domain}`}
                    className="text-xs text-slate-500 hover:text-red-600"
                  >
                    Remove
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
