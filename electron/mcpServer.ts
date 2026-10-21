import type { Express, Request } from 'express';
import { BrowserWindow, safeStorage, dialog, powerMonitor, app as electronApp } from 'electron';
import { randomUUID, createHash, timingSafeEqual, createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';
import os from 'os';
import fs from 'fs';
import path from 'path';
// Security: browser_* tools are forwarded to the renderer over a
// sender-gated IPC round-trip instead of executing JS in the main window.
// Imported from main/mcpBridge (not main.ts) to avoid a circular import.
import { requestRendererMcpAction, cancelPendingMcpActions, setMcpActionPhaseListener, requestPolicyContext } from './main/mcpBridge.js';
// §11 execution engine + §12 policy engine: agent-facing actions are classified
// and queued through these dependency-free modules instead of going straight to
// the renderer bridge. Only types and the engine/classifier values are imported.
import { ExecutionEngine } from './main/executionEngine.js';
import type { ActionRequest, ActionRecord, EngineEvent, PendingApproval } from './main/executionEngine.js';
import { classifyAction, buildApprovalSummary } from './main/policyEngine.js';

// Security: Screen-lock tracking prevents MCP execution while user is away
let isScreenLocked = false;
let screenLockGeneration = 0;
try {
  powerMonitor.on('lock-screen', () => {
    isScreenLocked = true;
    screenLockGeneration++;
    cancelPendingMcpActions('MCP tool execution blocked: King Browser is currently locked.');
  });
  powerMonitor.on('unlock-screen', () => { isScreenLocked = false; });
} catch (_) {}

interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: string;
    properties: Record<string, any>;
    required?: string[];
  };
}

const TOOLS: McpTool[] = [
  {
    name: 'king_browser_info',
    description: 'Provides context about King Browser and the MCP integration. You can interact with the browser using browser_* tools according to user instructions and safety approvals. Sensitive actions require explicit user confirmation. Call this tool if you need a reminder of what King Browser is.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'browser_navigate',
    description: 'Navigates the current browser tab to a specific URL.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The absolute URL to navigate to (e.g., https://github.com)' }
      },
      required: ['url']
    }
  },
  {
    name: 'browser_read_page',
    description: 'Extracts the full visible text and all interactive elements (links, buttons, inputs) from the active page. Also returns the current URL and title.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'browser_screenshot',
    description: 'Takes a screenshot of the current active page and returns it as a base64-encoded data URL (image/png).',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'browser_click',
    description: 'Clicks an element on the active page using a CSS selector.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the element to click (e.g., #submit-btn, .nav-link, a[href*="github"])' }
      },
      required: ['selector']
    }
  },
  {
    name: 'browser_type',
    description: 'Types text into an input or textarea element on the active page.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the input element' },
        text: { type: 'string', description: 'Text to type into the element' },
        pressEnter: { type: 'boolean', description: 'Whether to press Enter after typing (default: false)' }
      },
      required: ['selector', 'text']
    }
  },

  {
    name: 'browser_scroll',
    description: 'Scrolls the active page in a given direction.',
    inputSchema: {
      type: 'object',
      properties: {
        direction: { type: 'string', enum: ['up', 'down', 'top', 'bottom'], description: 'Direction to scroll' },
        amount: { type: 'number', description: 'Pixels to scroll (default: 500)' }
      },
      required: ['direction']
    }
  },
  {
    name: 'browser_new_tab',
    description: 'Opens a new browser tab, optionally at a specific URL.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'URL to open in the new tab (optional, defaults to new tab page)' }
      }
    }
  },
  {
    name: 'browser_close_tab',
    description: 'Closes the tab with the specified ID.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'string', description: 'The ID of the tab to close (use browser_list_tabs to get IDs)' }
      },
      required: ['tabId']
    }
  },
  {
    name: 'browser_list_tabs',
    description: 'Lists all currently open tabs with their IDs, titles, URLs, and which one is active.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'browser_switch_tab',
    description: 'Switches the active tab to the one with the specified ID.',
    inputSchema: {
      type: 'object',
      properties: {
        tabId: { type: 'string', description: 'The ID of the tab to switch to' }
      },
      required: ['tabId']
    }
  },
  {
    name: 'browser_go_back',
    description: 'Navigates the active tab back in its history (equivalent to pressing the Back button).',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'browser_go_forward',
    description: 'Navigates the active tab forward in its history (equivalent to pressing the Forward button).',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'browser_reload',
    description: 'Reloads the current active page.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'browser_get_url',
    description: 'Returns the current URL of the active tab.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'browser_hover',
    description: 'Simulates hovering the mouse cursor over an element identified by a CSS selector.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the element to hover over' }
      },
      required: ['selector']
    }
  },
  {
    name: 'browser_focus',
    description: 'Focuses a specific element on the active page.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the element to focus' }
      },
      required: ['selector']
    }
  },
  {
    name: 'browser_select_option',
    description: 'Selects an option in a <select> dropdown element.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the <select> element' },
        value: { type: 'string', description: 'The value attribute of the option to select' }
      },
      required: ['selector', 'value']
    }
  },
  {
    name: 'browser_press_key',
    description: 'Simulates pressing a keyboard key on the active page (e.g., Enter, Tab, Escape, ArrowDown).',
    inputSchema: {
      type: 'object',
      properties: {
        key: { type: 'string', description: 'Key name (e.g., Enter, Tab, Escape, Space, ArrowDown, ArrowUp)' },
        selector: { type: 'string', description: 'Optional CSS selector to focus before pressing key' }
      },
      required: ['key']
    }
  },
  {
    name: 'browser_wait',
    description: 'Pauses execution for a specified number of milliseconds.',
    inputSchema: {
      type: 'object',
      properties: {
        ms: { type: 'number', description: 'Milliseconds to wait (max 10000)' }
      },
      required: ['ms']
    }
  },
  {
    name: 'browser_get_element_text',
    description: 'Returns the inner text content of an element matched by a CSS selector.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the element' }
      },
      required: ['selector']
    }
  },
  {
    name: 'browser_scroll_to_element',
    description: 'Scrolls the page until a specific element is visible in the viewport.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector of the element to scroll to' }
      },
      required: ['selector']
    }
  },
  {
    name: 'browser_zoom',
    description: 'Sets the zoom level of the current page.',
    inputSchema: {
      type: 'object',
      properties: {
        level: { type: 'number', description: 'Zoom level: 0 = 100% (normal), 1 = ~120%, -1 = ~80%, 2 = ~150%' }
      },
      required: ['level']
    }
  },
  {
    name: 'browser_mute_tab',
    description: 'Mutes or unmutes the active tab.',
    inputSchema: {
      type: 'object',
      properties: {
        mute: { type: 'boolean', description: 'true to mute, false to unmute' }
      },
      required: ['mute']
    }
  },
  {
    name: 'browser_pin_tab',
    description: 'Pins or unpins the active tab.',
    inputSchema: {
      type: 'object',
      properties: {
        pin: { type: 'boolean', description: 'true to pin, false to unpin' }
      },
      required: ['pin']
    }
  },
  {
    name: 'browser_duplicate_tab',
    description: 'Duplicates the active tab, opening a copy of it in a new tab.',
    inputSchema: { type: 'object', properties: {} }
  },
  // ---- §9 agent interface: status, aliases, element search, engine controls ----
  {
    name: 'browser_status',
    description: 'Returns the live execution-engine status: state (idle/running/paused/awaiting_approval/stopping/stopped/error), mode (auto/step), queue length, in-flight action, pending approval, phase progress, and stop reason. Check this before planning new actions after a stop.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'browser_open',
    description: 'Opens a URL in the current tab. Alias of browser_navigate.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'The URL to open' }
      },
      required: ['url']
    }
  },
  {
    name: 'browser_back',
    description: 'Goes back in the active tab history. Alias of browser_go_back.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'browser_forward',
    description: 'Goes forward in the active tab history. Alias of browser_go_forward.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'browser_get_page_summary',
    description: 'Returns a compact summary of the active page (visible text plus links). Alias of browser_read_page.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'browser_find_element',
    description: 'Finds up to 10 elements on the active page by CSS selector or by visible text, returning a reusable selector and a text snippet for each. Use before browser_click or browser_type.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector to match elements' },
        text: { type: 'string', description: 'Visible text to search for (links, buttons, inputs, select, textarea, headings)' }
      }
    }
  },
  {
    name: 'browser_select',
    description: 'Selects an option in a <select> dropdown. Alias of browser_select_option.',
    inputSchema: {
      type: 'object',
      properties: {
        selector: { type: 'string', description: 'CSS selector for the <select> element' },
        value: { type: 'string', description: 'Option value or label to select' }
      },
      required: ['selector', 'value']
    }
  },
  {
    name: 'browser_request_approval',
    description: 'Asks the user to approve a specific planned action before performing it. Describe what you intend to do; returns Approved or Rejected. Sensitive actions are also gated automatically.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', description: 'What you plan to do, in user terms' },
        tool: { type: 'string', description: 'Tool you intend to call after approval (optional)' },
        details: { type: 'string', description: 'Extra context shown to the user (optional)' }
      },
      required: ['action']
    }
  },
  {
    name: 'browser_next_step',
    description: '§10 Next Step: allows exactly one more action to run, then pauses again. Use when the user wants to review each action.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'browser_next_phase',
    description: '§10 Next Phase: reports the active phase (objective and actions used) or states that no phase is active. Phase definitions are submitted from the agent panel.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'browser_pause',
    description: '§10 Pause: stops scheduling new actions at a safe boundary. The in-flight action finishes; the queue is kept.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'browser_resume',
    description: '§10 Resume: continues execution from the saved state after a pause or a stop.',
    inputSchema: { type: 'object', properties: {} }
  },
  {
    name: 'browser_stop',
    description: '§10/§11 STOP NOW: emergency stop. Cancels every queued action, aborts the in-flight one, and blocks new actions until browser_resume. Always available.',
    inputSchema: { type: 'object', properties: {} }
  }
];

// The names this server actually implements. A name outside this set is not a
// tool at all, whatever the user's per-tool toggles say.
const REGISTERED_TOOL_NAMES = new Set<string>(TOOLS.map(tool => tool.name));

// §9 compatibility vocabulary: agent-facing names are resolved to the canonical
// renderer tool before dispatch, so the renderer only ever sees tool names it
// implements. browser_status and the engine-control tools are handled in the
// main process and never appear here.
const TOOL_ALIASES: Record<string, string> = {
  browser_open: 'browser_navigate',
  browser_back: 'browser_go_back',
  browser_forward: 'browser_go_forward',
  browser_get_page_summary: 'browser_read_page',
  browser_select: 'browser_select_option',
};

// Tools whose approval decision depends on the current page and target element.
const PAGE_CONTEXT_TOOLS = new Set(['browser_click', 'browser_type', 'browser_select_option', 'browser_press_key']);

// Tool permission levels
export type ToolPermissionLevel = 'safe' | 'medium' | 'sensitive';

export const TOOL_PERMISSIONS: Record<string, ToolPermissionLevel> = {
  // Safe — harmless metadata
  king_browser_info: 'safe',
  browser_list_tabs: 'safe',
  browser_get_url: 'safe',
  browser_scroll: 'safe',
  browser_go_back: 'safe',
  browser_go_forward: 'safe',
  browser_reload: 'safe',
  browser_wait: 'safe',
  browser_scroll_to_element: 'safe',
  // Sensitive read-only & inspection tools — medium (disabled by default, requires approval)
  browser_read_page: 'medium',
  browser_screenshot: 'medium',
  browser_full_page_screenshot: 'medium',
  browser_get_element_text: 'medium',
  // Medium — navigation & window actions
  browser_navigate: 'medium',
  browser_click: 'medium',
  browser_hover: 'medium',
  browser_focus: 'medium',
  browser_switch_tab: 'medium',
  browser_close_tab: 'medium',
  browser_new_tab: 'medium',
  browser_mute_tab: 'medium',
  browser_pin_tab: 'medium',
  browser_duplicate_tab: 'medium',
  browser_zoom: 'medium',
  // Sensitive — disabled by default, can be enabled in settings
  browser_type: 'sensitive',

  browser_press_key: 'sensitive',
  browser_select_option: 'sensitive',
  // §9 engine-control tools stay 'safe' so STOP NOW / Pause can never be locked
  // out by a settings toggle.
  browser_status: 'safe',
  browser_back: 'safe',
  browser_forward: 'safe',
  browser_request_approval: 'safe',
  browser_next_step: 'safe',
  browser_next_phase: 'safe',
  browser_pause: 'safe',
  browser_resume: 'safe',
  browser_stop: 'safe',
  // §9 aliases mirror the permission level of the tool they resolve to.
  browser_open: 'medium',
  browser_get_page_summary: 'medium',
  browser_find_element: 'medium',
  browser_select: 'sensitive',
};

// Default disabled tools (all medium & sensitive levels; users can re-enable them in settings)
const DEFAULT_DISABLED_TOOLS = new Set<string>(
  Object.entries(TOOL_PERMISSIONS)
    .filter(([, permission]) => permission !== 'safe')
    .map(([name]) => name)
);

interface SseClient {
  id: string;
  connectedAt: number;
  userAgent: string;
  res: any;
}

export class BrowserMCPServer {
  private warnedQueryToken = false;
  private server: any;
  // A start() that has been claimed but has not bound its port yet. The
  // caller's isRunning() guard is evaluated BEFORE start() runs, so without a
  // synchronous claim two concurrent calls (e.g. the user double-clicking the
  // toggle) both reach app.listen() and the second assignment to this.server
  // orphans the first listener — an authenticated port stays bound while the
  // UI reports "stopped", and stop() only closes the one it still knows about.
  private starting: boolean = false;
  private authorizationGeneration = 0;
  // Set by stop() when it lands while a start() is still in flight. The
  // in-flight start has no port to close yet, so it unwinds on bind instead
  // of leaving an orphan listener behind.
  private stopRequested: boolean = false;
  // Rejects the in-flight start(), if there is one. Defaults to a no-op so
  // stop() is safe before start() has reached its listen call. Without this, a
  // stop() landing after listen() but before the 'listening' callback would
  // close the pending listener and leave start()'s promise pending forever.
  private abortStart: (err: Error) => void = () => {};
  private mainWindow: BrowserWindow | null = null;
  private clients: Map<string, SseClient> = new Map();
  private token: string;
  private disabledTools: Set<string> = new Set(DEFAULT_DISABLED_TOOLS);
  private tokenFilePath: string = '';
  private actualPort: number = 0;
  private portFilePath: string = '';
  private firstUseApproved: boolean = process.env.NODE_ENV === 'test' && !electronApp.isPackaged && Boolean(process.env.VITEST || process.env.JEST_WORKER_ID);
  private pendingApprovalPromise: Promise<boolean> | null = null;
  // §11/§12: forwarded agent actions pass through the policy classifier and the
  // execution-engine queue when the composition root (main.ts) enables this. It
  // stays off in unit tests so only the pre-existing dispatch path runs there.
  private policyEnforced: boolean = false;
  private engineInstance: ExecutionEngine | null = null;

  constructor(private requestedPort: number = 3020) {
    // Performance: express/express-rate-limit are NOT required here — they are
    // dynamically imported in start() so the main bundle doesn't pay their
    // parse/require cost on every launch when the MCP server never starts.
    // Set token file path in app userData
    try {
      this.tokenFilePath = path.join(electronApp.getPath('userData'), 'king-mcp-token');
      this.portFilePath = path.join(electronApp.getPath('userData'), 'king-mcp-port');
      if (process.env.MCP_TOKEN) {
        this.token = process.env.MCP_TOKEN;
      } else {
        this.token = this.loadOrGenerateToken();
      }
      if (process.env.MCP_PORT) {
        const parsed = parseInt(process.env.MCP_PORT, 10);
        if (!isNaN(parsed) && parsed > 0 && parsed < 65536) {
          this.requestedPort = parsed;
        }
      }
    } catch {
      this.token = process.env.MCP_TOKEN || randomUUID();
    }
    // Restore persisted per-tool enable/disable settings (safe: internal try/catch)
    this.loadToolSettings();
  }

  private loadPersistedPort(): void {
    try {
      if (fs.existsSync(this.portFilePath)) {
        const savedPort = parseInt(fs.readFileSync(this.portFilePath, 'utf-8'), 10);
        if (!isNaN(savedPort) && savedPort > 0 && savedPort < 65536) {
          this.requestedPort = savedPort;
        }
      }
    } catch (e) {
      console.warn('[MCP Server] Error reading persisted port:', e);
    }
  }

  private savePersistedPort(port: number): void {
    try {
      fs.writeFileSync(this.portFilePath, String(port), 'utf-8');
    } catch (e) {
      console.warn('[MCP Server] Error saving persisted port:', e);
    }
  }

  private getFallbackMcpKey(): Buffer {
    const secretPath = path.join(electronApp.getPath('userData'), '.machine_secret');
    let secret: Buffer;
    try {
      secret = fs.readFileSync(secretPath);
    } catch (err: any) {
      if (err?.code === 'ENOENT') {
        secret = randomBytes(32);
        try {
          fs.writeFileSync(secretPath, secret, { mode: 0o600 });
          if (process.platform !== 'win32') {
            fs.chmodSync(secretPath, 0o600);
          }
        } catch (_) {}
      } else {
        throw err;
      }
    }
    let username = 'unknown';
    try {
      username = os.userInfo().username;
    } catch (_) {
      username = process.env.USER || process.env.USERNAME || 'unknown';
    }
    const machineSalt = createHash('sha256')
      .update(`${os.hostname()}:${username}:${os.homedir()}:king-mcp-salt`)
      .digest();
    return scryptSync(secret, machineSalt, 32);
  }

  private loadOrGenerateToken(): string {
    try {
      if (this.tokenFilePath && fs.existsSync(this.tokenFilePath)) {
        const raw = fs.readFileSync(this.tokenFilePath);
        if (raw.length > 0) {
          if (safeStorage.isEncryptionAvailable()) {
            try {
              const decrypted = safeStorage.decryptString(raw);
              if (decrypted && decrypted.length >= 16) return decrypted;
            } catch (_) {}
          }
          // Check for fallback AES-256-GCM authenticated format
          if (raw.length >= 36 && raw.subarray(0, 4).toString('utf8') === 'NMCP') {
            try {
              const keyBuf = this.getFallbackMcpKey();
              const iv = raw.subarray(4, 16);
              const tag = raw.subarray(16, 32);
              const enc = raw.subarray(32);
              const decipher = createDecipheriv('aes-256-gcm', keyBuf, iv);
              decipher.setAuthTag(tag);
              const decrypted = decipher.update(enc) + decipher.final('utf8');
              if (decrypted && decrypted.length >= 16) return decrypted;
            } catch (_) {}
          }
        }
      }
    } catch (err) {
      console.warn('[MCP Server] Error loading persisted token:', err);
    }
    return this.saveNewToken();
  }

  private saveNewToken(): string {
    const newToken = randomUUID();
    this.token = newToken;
    try {
      if (this.tokenFilePath) {
        const dir = path.dirname(this.tokenFilePath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
        if (safeStorage.isEncryptionAvailable()) {
          const encrypted = safeStorage.encryptString(newToken);
          fs.writeFileSync(this.tokenFilePath, encrypted, { mode: 0o600 });
          if (process.platform !== 'win32') {
            try { fs.chmodSync(this.tokenFilePath, 0o600); } catch (_) {}
          }
        } else {
          const keyBuf = this.getFallbackMcpKey();
          const iv = randomBytes(12);
          const cipher = createCipheriv('aes-256-gcm', keyBuf, iv);
          const enc = Buffer.concat([cipher.update(newToken, 'utf8'), cipher.final()]);
          const tag = cipher.getAuthTag();
          const payload = Buffer.concat([Buffer.from('NMCP', 'utf8'), iv, tag, enc]);
          fs.writeFileSync(this.tokenFilePath, payload, { mode: 0o600 });
          if (process.platform !== 'win32') {
            try { fs.chmodSync(this.tokenFilePath, 0o600); } catch (_) {}
          }
        }
      }
    } catch (err) {
      console.warn('[MCP Server] Error saving persisted token:', err);
    }
    return newToken;
  }

  public getToken(): string { return this.token; }

  public rotateToken(): string {
    this.authorizationGeneration++;
    this.firstUseApproved = false;
    cancelPendingMcpActions('MCP authentication token was revoked');
    // Security: rotating the token is documented as a hard revocation, so it
    // must actually evict live sessions. /message re-validates the bearer on
    // every request, so the old token can no longer issue commands — but
    // without ending the already-open SSE streams the previous holder keeps
    // receiving events, in-flight tool results still land on its stream, and
    // getConnectedClientsInfo() still lists it. Close every live stream and
    // drop the registry exactly like stop() does. Token-rotation semantics are
    // unchanged: the new token is persisted and the old one stops matching.
    this.revokeAllClients();
    this.token = this.saveNewToken();
    return this.token;
  }

  public getDisabledTools(): string[] { return Array.from(this.disabledTools); }

  public setToolEnabled(toolName: string, enabled: boolean) {
    if (typeof toolName !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(toolName)) return;
    if (toolName === '__proto__' || toolName === 'constructor' || toolName === 'prototype') return;
    if (!enabled) cancelPendingMcpActions(`MCP tool '${toolName}' was disabled`, toolName);
    if (enabled) this.disabledTools.delete(toolName);
    else this.disabledTools.add(toolName);
    // Persist to userData
    try {
      const settingsPath = path.join(electronApp.getPath('userData'), 'mcp-tool-settings.json');
      const current = Object.create(null) as Record<string, boolean>;
      try {
        const raw = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
          for (const [k, v] of Object.entries(raw)) {
            if (typeof k === 'string' && /^[a-zA-Z0-9_-]+$/.test(k) && k !== '__proto__' && k !== 'constructor' && k !== 'prototype' && typeof v === 'boolean') {
              current[k] = v;
            }
          }
        }
      } catch {}
      current[toolName] = Boolean(enabled);
      fs.writeFileSync(settingsPath, JSON.stringify(current));
    } catch {}
  }

  public loadToolSettings() {
    try {
      const settingsPath = path.join(electronApp.getPath('userData'), 'mcp-tool-settings.json');
      let settings: Record<string, boolean>;
      try {
        settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
      } catch {
        return;
      }
      if (!settings || typeof settings !== 'object' || Array.isArray(settings)) return;
      for (const [tool, enabled] of Object.entries(settings)) {
        if (typeof tool === 'string' && /^[a-zA-Z0-9_-]+$/.test(tool) && tool !== '__proto__' && tool !== 'constructor' && tool !== 'prototype' && typeof enabled === 'boolean') {
          this.setToolEnabled(tool, enabled);
        }
      }
    } catch {}
  }

  // Security: constant-time token comparison. Both sides are hashed with SHA-256
  // first so the buffers always have equal length (a timingSafeEqual requirement) and
  // comparison cost is independent of where the first differing byte occurs.
  private tokenMatches(provided: string): boolean {
    try {
      const expected = createHash('sha256').update(this.token).digest();
      const actual = createHash('sha256').update(provided).digest();
      return timingSafeEqual(expected, actual);
    } catch {
      return false;
    }
  }

  private isAuthenticated(req: Request): boolean {
    // Security: Only accept Authorization header: Bearer <token>
    // Tokens in URL query strings (?token=...) are strictly rejected as they leak into logs, proxies, and referrers.
    const authHeader = req.headers.authorization || '';
    if (authHeader.startsWith('Bearer ') && this.tokenMatches(authHeader.slice(7))) {
      return true;
    }
    return false;
  }

  private isRegisteredTool(toolName: unknown): boolean {
    return typeof toolName === 'string' && REGISTERED_TOOL_NAMES.has(toolName);
  }

  private isToolAllowed(toolName: string): boolean {
    // Allowlist, not blocklist. "Not in the disabled set" let any name the
    // registry never declared — a typo, a tool removed from TOOLS but still
    // listed in TOOL_PERMISSIONS (browser_full_page_screenshot), or a
    // non-string such as an absent body.params.name — pass the gate and be
    // forwarded to the renderer. A name must now be a registered tool AND not
    // be disabled.
    return this.isRegisteredTool(toolName) && !this.disabledTools.has(toolName);
  }

  /**
   * §11/§12 opt-in. main.ts (the composition root) turns this on; unit tests
   * leave it off. When enabled, forwarded agent actions are classified by the
   * policy engine and queued through the execution engine with approval gating.
   */
  public setPolicyEnforcement(enabled: boolean) {
    this.policyEnforced = Boolean(enabled);
  }

  /** §11 execution engine instance — also used by the §10 control panel. */
  public getExecutionEngine(): ExecutionEngine {
    return this.engine();
  }

  private engine(): ExecutionEngine {
    if (!this.engineInstance) {
      this.engineInstance = new ExecutionEngine({
        executor: (request) => this.dispatchToRenderer(request),
        askApproval: (approval) => this.promptSensitiveApproval(approval),
        // §10/§11 STOP NOW parity: every stop path — the control panel's
        // stop/emergency_close (engineIpc) as well as MCP browser_stop — must
        // abort the in-flight renderer action, not just prevent new ones. The
        // renderer receives 'mcp-action-cancel' for the pending id, so the
        // action stops instead of running out its 15s bridge timeout.
        abortInFlight: (reason) => cancelPendingMcpActions(reason),
        onEvent: (event) => this.forwardEngineEvent(event)
      });
      // While the renderer waits for the user's approval, the engine timeout
      // must not fire first. One extra second lets the bridge report the
      // clearer reason (approval vs. execution) when the window runs out.
      setMcpActionPhaseListener((_phase, windowMs) => {
        this.engineInstance?.extendInFlightTimeout(windowMs + 1_000);
      });
    }
    return this.engineInstance;
  }

  // §10: engine events are pushed to the renderer so the control panel can show
  // a live status line without polling.
  private forwardEngineEvent(event: EngineEvent): void {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return;
    try {
      this.mainWindow.webContents.send('mcp-engine-event', event);
    } catch (_) {}
  }

  private async dispatchToRenderer(request: ActionRequest): Promise<unknown> {
    // The queue can hold an action for a while, so re-check the guards that
    // executeTool checked at intake time before anything reaches the renderer.
    if (isScreenLocked) {
      throw new Error('MCP tool execution blocked: King Browser is currently locked.');
    }
    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      throw new Error('King Browser window is not available');
    }
    const result = await requestRendererMcpAction(this.mainWindow, request.toolName, request.args);
    // The engine's executor receives the same ActionRequest object that was
    // submitted (submit stores the reference), so the result can travel back on
    // it — ActionRecord intentionally carries no result payload.
    (request as ActionRequest & { __mcpResult?: unknown }).__mcpResult = result;
    return result;
  }

  // §12: sensitive actions surface the pending action, its destination domain
  // and the intended result before anything runs. Default-deny on timeout,
  // dismissal, screen lock or authorization revocation.
  private async promptSensitiveApproval(approval: PendingApproval): Promise<boolean> {
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return false;
    const authorizationGeneration = this.authorizationGeneration;
    const lockGeneration = screenLockGeneration;
    try {
      const detailLines = [
        approval.domain ? `Site: ${approval.domain}` : null,
        approval.summary ? `Action: ${approval.summary}` : null,
        `Tool: ${approval.toolName}`
      ].filter(Boolean).join('\n');
      const dialogPromise = dialog.showMessageBox(this.mainWindow, {
        type: 'warning',
        buttons: ['Approve', 'Reject'],
        defaultId: 1,
        cancelId: 1,
        title: 'King Browser - Action Approval',
        message: 'The agent is requesting approval for a sensitive action.',
        detail: detailLines,
        noLink: true
      });

      let timeoutHandle: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<{ response: number }>((resolve) => {
        timeoutHandle = setTimeout(() => resolve({ response: 1 }), 60000);
      });

      const result = await Promise.race([dialogPromise, timeoutPromise]);
      if (timeoutHandle) clearTimeout(timeoutHandle);

      if (authorizationGeneration !== this.authorizationGeneration ||
          lockGeneration !== screenLockGeneration || isScreenLocked) return false;
      return result.response === 0;
    } catch (err) {
      console.warn('[MCP Server] Error prompting for action approval:', err);
      return false;
    }
  }

  public setMainWindow(window: BrowserWindow | null) {
    this.mainWindow = window;
  }

  public getConnectedClientsInfo() {
    return Array.from(this.clients.values()).map(c => ({
      id: c.id,
      connectedAt: c.connectedAt,
      userAgent: c.userAgent
    }));
  }

  public getClientCount() {
    return this.clients.size;
  }

  // Terminate every live SSE stream and clear the client registry. The
  // requests' own 'close' handlers fire when res.end() completes, which also
  // notifies the renderer, so no explicit mcp-client-changed send is needed.
  private revokeAllClients(): void {
    for (const client of this.clients.values()) {
      try { client.res.end(); } catch (_) {}
    }
    this.clients.clear();
  }

  private sendToClient(clientId: string, event: string, data: any) {
    const client = this.clients.get(clientId);
    if (client) {
      try { client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch (_) {}
    }
  }

  private async ensureFirstUseApproved(): Promise<boolean> {
    if (this.firstUseApproved) return true;
    if (!this.mainWindow || this.mainWindow.isDestroyed()) return false;
    if (this.pendingApprovalPromise) return this.pendingApprovalPromise;

    const authorizationGeneration = this.authorizationGeneration;
    const lockGeneration = screenLockGeneration;

    const askApproval = async (): Promise<boolean> => {
      try {
        const dialogPromise = dialog.showMessageBox(this.mainWindow!, {
          type: 'question',
          buttons: ['Allow', 'Deny'],
          defaultId: 0,
          cancelId: 1,
          title: 'King Browser - MCP Authorization',
          message: 'An external client is attempting to connect to King Browser via Model Context Protocol (MCP).',
          detail: 'Do you want to allow this external client to interact with King Browser? Tool permissions can be managed in Settings.',
          noLink: true
        });

        let timeoutHandle: NodeJS.Timeout | undefined;
        const timeoutPromise = new Promise<{ response: number }>((resolve) => {
          timeoutHandle = setTimeout(() => resolve({ response: 1 }), 60000);
        });

        const result = await Promise.race([dialogPromise, timeoutPromise]);
        if (timeoutHandle) clearTimeout(timeoutHandle);

        if (authorizationGeneration !== this.authorizationGeneration ||
            lockGeneration !== screenLockGeneration || isScreenLocked) return false;
        if (result.response === 0) {
          this.firstUseApproved = true;
          return true;
        }
      } catch (err) {
        console.warn('[MCP Server] Error prompting for first-use approval:', err);
      }
      return false;
    };

    this.pendingApprovalPromise = askApproval().finally(() => {
      this.pendingApprovalPromise = null;
    });

    return this.pendingApprovalPromise;
  }

  private async executeTool(toolName: string, args: Record<string, any>): Promise<string> {
    const authorizationGeneration = this.authorizationGeneration;
    const lockGeneration = screenLockGeneration;
    if (isScreenLocked) {
      throw new Error('MCP tool execution blocked: King Browser is currently locked.');
    }

    if (!this.mainWindow || this.mainWindow.isDestroyed()) {
      throw new Error('King Browser window is not available');
    }

    const approved = await this.ensureFirstUseApproved();
    if (authorizationGeneration !== this.authorizationGeneration || lockGeneration !== screenLockGeneration) {
      throw new Error('MCP authorization was revoked while awaiting approval.');
    }
    if (isScreenLocked) throw new Error('MCP tool execution blocked: King Browser is currently locked.');
    if (!approved) {
      throw new Error('Permission denied: MCP connection rejected by the user.');
    }

    if (!this.isToolAllowed(toolName)) {
      // Distinguish "you turned this off" from "this does not exist", and never
      // echo a non-string name straight back into the response.
      const label = typeof toolName === 'string' ? toolName : 'unnamed';
      throw new Error(
        this.isRegisteredTool(toolName)
          ? `Permission denied: Tool '${toolName}' is disabled in MCP security settings.`
          : `Permission denied: Tool '${label}' is not a known MCP tool.`
      );
    }

    // §9 alias resolution: agent vocabulary is mapped to the canonical renderer
    // tool. Using an alias requires the canonical tool to be enabled too —
    // permission is the intersection, so an enabled alias can never bypass a
    // disabled canonical tool.
    const canonicalTool = TOOL_ALIASES[toolName] ?? toolName;
    if (canonicalTool !== toolName && !this.isToolAllowed(canonicalTool)) {
      throw new Error(
        `Permission denied: Tool '${canonicalTool}' (required by '${toolName}') is disabled in MCP security settings.`
      );
    }

    // Special: king_browser_info
    if (toolName === 'king_browser_info') {
      return 'You are connected to King Browser. Use the browser_* tools to navigate and interact with web pages according to user instructions and safety approvals.';
    }

    // §11 engine status — answered locally with the live engine snapshot.
    if (toolName === 'browser_status') {
      return JSON.stringify(this.engine().getStatusSnapshot(), null, 2);
    }

    // §10/§11 engine controls — handled in the main process, never forwarded.
    // These are control-plane calls, not page actions, so they do not enter the
    // action queue themselves.
    if (toolName === 'browser_stop') {
      const stopResult = this.engine().stop('STOP NOW requested via MCP browser_stop');
      cancelPendingMcpActions('STOP NOW: cancelled by MCP browser_stop.');
      return `STOP NOW acknowledged: ${JSON.stringify(stopResult)}`;
    }
    if (toolName === 'browser_pause') {
      this.engine().pause();
      return `Pause requested. State: ${this.engine().getState()}`;
    }
    if (toolName === 'browser_resume') {
      this.engine().resume();
      return `Resume requested. State: ${this.engine().getState()}`;
    }
    if (toolName === 'browser_next_step') {
      this.engine().nextStep();
      return 'Step mode enabled: exactly one action will run, then execution pauses again.';
    }
    if (toolName === 'browser_next_phase') {
      const phaseInfo = this.engine().getPhase();
      if (!phaseInfo) return 'No active phase. Phase definitions are submitted from the agent panel.';
      return `Active phase: ${phaseInfo.phase.objective} (actions used: ${phaseInfo.actionsUsed}).`;
    }

    // §12 explicit approval request from the agent for a planned action.
    if (toolName === 'browser_request_approval') {
      const action = typeof args.action === 'string' ? args.action.trim() : '';
      if (!action) return "Error: Missing 'action' parameter describing the planned action.";
      const details = typeof args.details === 'string' ? args.details.trim() : '';
      const approved = await this.promptSensitiveApproval({
        actionId: 'manual',
        toolName: typeof args.tool === 'string' && args.tool ? args.tool : 'unspecified',
        args: { summary: action },
        summary: [action, details].filter(Boolean).join(' — ')
      });
      return approved
        ? 'Approved by the user.'
        : 'Rejected by the user. Do not perform this action.';
    }

    // Special: browser_wait is handled directly
    if (toolName === 'browser_wait') {
      const ms = Math.max(0, Math.min(Number(args.ms) || 1000, 10000));
      await new Promise(r => setTimeout(r, ms));
      return `Waited ${ms}ms`;
    }

    // Forward the tool call to the renderer via IPC and wait for its response.
    // §11/§12: when enforcement is enabled the action is classified and queued
    // through the execution engine (sensitive decisions get an approval dialog
    // first); otherwise the pre-existing direct-forward path is kept.
    if (!this.policyEnforced) {
      const result = await requestRendererMcpAction(this.mainWindow, canonicalTool, args);
      return typeof result === 'string' ? result : JSON.stringify(result);
    }

    // §12: page actions are classified against the page they land on. The
    // selector alone is chosen by the agent, so "#btn-3" could be a
    // "Delete account" button; the renderer describes the real element.
    let pageContext: { currentUrl?: string; elementText?: string; contextUnavailable?: boolean } = {};
    if (PAGE_CONTEXT_TOOLS.has(canonicalTool)) {
      const selector = canonicalTool !== 'browser_press_key' && typeof args.selector === 'string' ? args.selector : undefined;
      const context = await requestPolicyContext(this.mainWindow, selector);
      pageContext = context
        ? { currentUrl: context.url, elementText: context.elementText }
        : { contextUnavailable: true };
    }
    const decision = classifyAction({ toolName: canonicalTool, args, ...pageContext });
    const approvalSummary = decision.risk === 'sensitive'
      ? buildApprovalSummary({ toolName: canonicalTool, args }, decision)
      : null;
    const actionRequest: ActionRequest = {
      toolName: canonicalTool,
      args,
      risk: decision.risk,
      domain: decision.domain,
      summary: approvalSummary
        ? [approvalSummary.intendedAction, approvalSummary.affectedResource, ...approvalSummary.consequences]
            .filter((part): part is string => Boolean(part))
            .join(' — ')
        : undefined
    };

    const record: ActionRecord = await this.engine().submit(actionRequest);
    if (record.status !== 'completed') {
      throw new Error(record.error ? `${record.error} (${record.status})` : `Action ${record.status}.`);
    }
    const dispatched = (actionRequest as ActionRequest & { __mcpResult?: unknown }).__mcpResult;
    return typeof dispatched === 'string' ? dispatched : JSON.stringify(dispatched ?? '');
  }

  private setupRoutes(app: Express) {
    // Security: Prevent DNS rebinding attacks by strictly validating the Host header
    app.use((req, res, next) => {
      const host = (req.headers.host || '').toLowerCase();
      const port = this.actualPort || this.requestedPort;
      const allowedHosts = [
        `localhost:${port}`,
        `127.0.0.1:${port}`,
        `[::1]:${port}`,
        'localhost',
        '127.0.0.1',
        '[::1]'
      ];
      if (!allowedHosts.includes(host)) {
        return res.status(403).json({ error: 'Forbidden: Invalid Host header' });
      }
      next();
    });

    // CORS for all routes - restricted to local origins (http://localhost:*, http://127.0.0.1:*, http://[::1]:*)
    app.use((req, res, next) => {
      const origin = req.headers.origin;
      if (origin) {
        try {
          const url = new URL(origin);
          if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]' || url.protocol === 'king:') {
            res.header('Access-Control-Allow-Origin', origin);
          }
        } catch (_) {
          if (/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)) {
            res.header('Access-Control-Allow-Origin', origin);
          }
        }
      }
      res.header('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      next();
    });

    app.use((req, res, next) => {
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Health check endpoint — only return minimal info without auth
    app.get('/health', (req, res) => {
      if (this.isAuthenticated(req)) {
        // Authenticated: return detailed info, build string included. Read the
        // version only on this branch so an unauthenticated probe never causes
        // it to be computed at all.
        const appVersion = electronApp?.getVersion?.() || '1.5.0';
        res.json({
          status: 'ok',
          server: 'king-browser-mcp',
          version: appVersion,
          port: this.actualPort || this.requestedPort,
          connected_clients: this.clients.size,
          clients: this.getConnectedClientsInfo(),
          tools_count: TOOLS.length,
          timestamp: Date.now()
        });
      } else {
        // Unauthenticated: liveness only. The exact build string is a
        // fingerprinting primitive — it maps 1:1 onto a published
        // known-vulnerability list, so it is gated behind the same bearer check
        // as /sse, /message, /call and /tools rather than served to any local
        // process that can open a socket. The endpoint and its rate-limiter
        // exemption both stay: a liveness probe must never be locked out, and a
        // probe that cannot read a version is still a working probe.
        // (Grepped: nothing in this repo consumes /health — no UI, renderer,
        // test or client code — so this reduces disclosure with no consumer to
        // break.)
        res.json({ status: 'ok' });
      }
    });

    // MCP over SSE — client connects here
    app.get('/sse', (req, res) => {
      if (!this.isAuthenticated(req)) {
        return res.status(401).send('Unauthorized: Invalid or missing token');
      }

      const clientId = `client_${randomUUID().replace(/-/g, '')}`;

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      const client: SseClient = {
        id: clientId,
        connectedAt: Date.now(),
        userAgent: req.headers['user-agent'] || 'Unknown',
        res
      };
      this.clients.set(clientId, client);

      console.log(`[MCP] Client connected: ${clientId} (${client.userAgent})`);

      // Notify renderer of new connection
      if (this.mainWindow && !this.mainWindow.isDestroyed()) {
        this.mainWindow.webContents.send('mcp-client-changed', {
          count: this.clients.size,
          clients: this.getConnectedClientsInfo()
        });
      }

      // Send initial "endpoint" event so client knows where to POST
      // Using relative URL because some MCP clients fail to parse absolute URLs to extract the session ID
      res.write(`event: endpoint\ndata: /message?sessionId=${clientId}\n\n`);

      // Keep-alive ping every 15s
      const keepAlive = setInterval(() => {
        try { res.write(': ping\n\n'); } catch (_) { clearInterval(keepAlive); }
      }, 15000);
      keepAlive.unref?.();

      req.on('close', () => {
        clearInterval(keepAlive);
        this.clients.delete(clientId);
        console.log(`[MCP] Client disconnected: ${clientId}`);
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('mcp-client-changed', {
            count: this.clients.size,
            clients: this.getConnectedClientsInfo()
          });
        }
      });
    });

    // MCP message endpoint — client POSTs JSON-RPC here
    app.post('/message', async (req, res) => {
      if (!this.isAuthenticated(req)) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing token' });
      }

      const body = req.body;
      const sessionId = req.query.sessionId as string;

      // express.json() only parses a JSON content type, so a text/plain, empty
      // or otherwise unmatched POST leaves req.body undefined. Dereferencing it
      // below threw a TypeError that the catch further down turned into a 500
      // carrying an internal message — a client error reported as a server
      // fault. Answer 4xx with a generic message instead, before anything
      // reads the body. (`body?.id` below is now redundant but harmless; it is
      // left alone to keep the diff surgical.)
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({
          jsonrpc: '2.0',
          id: null,
          error: { code: -32600, message: 'Invalid JSON-RPC request' }
        });
      }

      // Security: only route responses to KNOWN sessions. A missing or unknown
      // sessionId must never fall back to broadcasting tool results to ALL clients.
      if (!sessionId || !this.clients.has(sessionId)) {
        return res.status(sessionId ? 404 : 400).json({
          jsonrpc: '2.0',
          id: body?.id ?? null,
          error: {
            code: sessionId ? -32000 : -32600,
            message: sessionId ? 'Unknown sessionId' : 'Missing sessionId'
          }
        });
      }

      const respondToClient = (payload: any) => {
        this.sendToClient(sessionId, 'message', payload);
      };

      try {
        // Handle MCP protocol messages
        if (body.method === 'initialize') {
          const appVersion = electronApp?.getVersion?.() || '1.5.0';
          const responsePayload = {
            jsonrpc: '2.0',
            id: body.id,
            result: {
              protocolVersion: '2024-11-05',
              capabilities: { tools: {} },
              serverInfo: { name: 'king-browser', version: appVersion }
            }
          };
          respondToClient(responsePayload);
          return res.status(202).json({ status: 'accepted' });
        }

        if (body.method === 'tools/list') {
          const responsePayload = {
            jsonrpc: '2.0',
            id: body.id,
            result: { tools: TOOLS.filter((tool) => this.isToolAllowed(tool.name)) }
          };
          respondToClient(responsePayload);
          return res.status(202).json({ status: 'accepted' });
        }

        if (body.method === 'tools/call') {
          const toolName = body.params?.name;
          const args = body.params?.arguments || {};

          try {
            const result = await this.executeTool(toolName, args);
            const isError = typeof result === 'string' && result.startsWith('Error:');
            const responsePayload = {
              jsonrpc: '2.0',
              id: body.id,
              result: {
                content: [{ type: 'text', text: result }],
                ...(isError ? { isError: true } : {})
              }
            };
            respondToClient(responsePayload);
          } catch (err: any) {
            const errorPayload = {
              jsonrpc: '2.0',
              id: body.id,
              result: {
                content: [{ type: 'text', text: `Error: ${err.message}` }],
                isError: true
              }
            };
            respondToClient(errorPayload);
          }
          return res.status(202).json({ status: 'accepted' });
        }

        // Fallback for unknown methods
        respondToClient({
          jsonrpc: '2.0',
          id: body.id,
          error: { code: -32601, message: `Method not found: ${body.method}` }
        });
        res.status(202).json({ status: 'accepted' });

      } catch (err: any) {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        let safeMsg = typeof err?.message === 'string' ? err.message : 'Internal error';
        if (homeDir) safeMsg = safeMsg.replaceAll(homeDir, '~');
        safeMsg = safeMsg.replace(/([A-Za-z]:\\[^:\s]+|\/(?:Users|home|root|var|etc)\/[^\s:]+)/g, '<path>');
        res.status(500).json({ error: safeMsg.slice(0, 200) });
      }
    });

    // Direct tool call endpoint (for testing without full MCP protocol)
    app.post('/call', async (req, res) => {
      if (!this.isAuthenticated(req)) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing token' });
      }

      // Same unguarded-dereference hazard as /message: this destructure threw a
      // TypeError on a non-JSON body, and being inside an async handler the
      // rejection reached Express 5's error handler as a 500.
      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ error: 'Invalid request body' });
      }

      const { tool, args = {} } = body;
      if (!tool) return res.status(400).json({ error: 'Missing tool name' });

      try {
        const result = await this.executeTool(tool, args);
        res.json({ success: true, result });
      } catch (err: any) {
        const homeDir = process.env.HOME || process.env.USERPROFILE || '';
        let safeMsg = typeof err?.message === 'string' ? err.message : 'Tool execution failed';
        if (homeDir) safeMsg = safeMsg.replaceAll(homeDir, '~');
        safeMsg = safeMsg.replace(/([A-Za-z]:\\[^:\s]+|\/(?:Users|home|root|var|etc)\/[^\s:]+)/g, '<path>');
        res.status(500).json({ success: false, error: safeMsg.slice(0, 200) });
      }
    });

    // List available tools
    app.get('/tools', (req, res) => {
      if (!this.isAuthenticated(req)) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing token' });
      }
      res.json({ tools: TOOLS.filter((tool) => this.isToolAllowed(tool.name)) });
    });
  }

  public async start(): Promise<void> {
    // Idempotency: claim the "starting" state SYNCHRONOUSLY, before the first
    // await below. The caller checks isRunning() before invoking start(), and
    // the dynamic imports suspend in between, so without this claim two
    // concurrent invocations (a double-clicked toggle — the UI button is never
    // disabled) both reach app.listen() and the second assignment to
    // this.server orphans the first listener on the requested port.
    if (this.server || this.starting) {
      throw new Error('MCP server is already running or starting');
    }
    this.starting = true;
    this.stopRequested = false;

    try {
      // Performance: load express + express-rate-limit lazily — they are only parsed/
      // required when the MCP server actually starts, not on every app launch.
      const [{ default: express }, { default: rateLimit }] = await Promise.all([
        import('express'),
        import('express-rate-limit')
      ]);

      const app = express();
      // Security: Tighten JSON body limit to 1MB (prevents memory exhaustion DoS)
      app.use(express.json({ limit: '1mb' }));

      // Rate limiter: exempt /health so liveness checks are never locked out
      const apiLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 120,
        message: 'Too many requests',
        standardHeaders: true,
        legacyHeaders: false,
        skip: (req) => req.path === '/health'
      });
      app.use(apiLimiter);
      this.setupRoutes(app);

      return await new Promise<void>((resolve, reject) => {
        // The promise must settle at most once on every path below. Note that
        // express 5's app.listen() also registers the callback it is given as a
        // one-time 'error' listener, so the listen callback below fires for a
        // FAILED bind as well as for 'listening' — the 'error' handler below is
        // what decides whether to fall back to another port.
        let settled = false;
        const resolveOnce = () => { if (settled) return; settled = true; resolve(); };
        const rejectOnce = (err: any) => { if (settled) return; settled = true; reject(err); };
        // Let a stop() that arrives from here on settle this promise directly,
        // rather than relying on the listen callback still being delivered.
        this.abortStart = rejectOnce;

        // A stop() that lands while this start() is in flight has no port to
        // close yet, so unwind as soon as the listener binds instead of
        // leaving it running behind a UI that already says "stopped".
        const abortIfStopRequested = (): boolean => {
          if (!this.stopRequested) return false;
          console.log('[MCP Server] Start aborted: stop() was requested before the listener bound');
          if (this.server) {
            try { this.server.close(); } catch (_) {}
            this.server = null;
          }
          rejectOnce(new Error('MCP server start aborted: stop() requested before bind completed'));
          return true;
        };

        try {
          // Use requestedPort (0 = random ephemeral port assigned by OS)
          this.server = app.listen(this.requestedPort, '127.0.0.1', (error?: Error) => {
            if (error) return; // The error listener below handles rejection/fallback.
            // Capture the actual port assigned by the OS. No address means the
            // bind failed and express routed us here through its 'error'
            // listener. Only a successfully bound listener can resolve startup.
            const address = this.server?.address();
            if (!address || typeof address !== 'object') return;
            if (address && typeof address === 'object') {
              this.actualPort = address.port;
              // Persist the actual port for client reconnection
              this.savePersistedPort(this.actualPort);
              if (abortIfStopRequested()) return;
              console.log(`[MCP Server] Running at http://localhost:${this.actualPort}`);
              console.log(`[MCP Server] SSE endpoint: http://localhost:${this.actualPort}/sse`);
              console.log(`[MCP Server] Health: http://localhost:${this.actualPort}/health`);
              console.log('[MCP Server] Authentication token loaded securely');
            }
            resolveOnce();
          });

          this.server.on('error', (err: any) => {
            if (err.code === 'EADDRINUSE' && this.requestedPort !== 0) {
              console.warn(`[MCP Server] Port ${this.requestedPort} is in use, falling back to random available port...`);
              try {
                this.server = app.listen(0, '127.0.0.1', (error?: Error) => {
                  if (error) return;
                  const address = this.server?.address();
                  if (!address || typeof address !== 'object') return;
                  if (address && typeof address === 'object') {
                    this.actualPort = address.port;
                    this.savePersistedPort(this.actualPort);
                    if (abortIfStopRequested()) return;
                    console.log(`[MCP Server] Running on fallback port http://localhost:${this.actualPort}`);
                    console.log(`[MCP Server] SSE endpoint: http://localhost:${this.actualPort}/sse`);
                    console.log(`[MCP Server] Health: http://localhost:${this.actualPort}/health`);
                    console.log('[MCP Server] Authentication token loaded securely');
                  }
                  resolveOnce();
                });
              } catch (fallbackErr) {
                console.error('[MCP Server] Fallback bind failed:', fallbackErr);
                this.server = null;
                rejectOnce(fallbackErr);
                return;
              }
              // An unhandled 'error' on a net.Server is rethrown as an uncaught
              // exception. The main process' uncaughtException handler swallows
              // that, so this failure would never reach the caller and the app
              // would silently half-start. The replacement server therefore needs
              // its own handler, bound before the listen callback can fail, so
              // every path out of this fallback settles the promise and cleans up
              // the half-bound listener instead of hanging.
              const fallbackServer = this.server;
              fallbackServer.on('error', (fallbackErr: any) => {
                if (fallbackServer.listening) {
                  // Already bound and serving: this is a runtime accept/socket
                  // error, not a failed start. Log it and keep serving rather
                  // than killing a healthy listener.
                  console.error('[MCP Server] Fallback listener error after start:', fallbackErr);
                  return;
                }
                console.error('[MCP Server] Fallback bind failed:', fallbackErr);
                try { fallbackServer.close(); } catch (_) {}
                if (this.server === fallbackServer) this.server = null;
                rejectOnce(fallbackErr);
              });
              return;
            }
            console.error('[MCP Server] Failed to start:', err);
            // Clear the handle so isRunning() returns false and the server can be restarted
            this.server = null;
            rejectOnce(err);
          });
        } catch (err) {
          rejectOnce(err);
        }
      });
    } finally {
      // Release the claim on every path (success, failure, abort) so a failed
      // start can be retried and a running one is tracked by this.server.
      this.starting = false;
      this.abortStart = () => {};
    }
  }

  public stop() {
    this.authorizationGeneration++;
    this.firstUseApproved = false;
    this.pendingApprovalPromise = null;
    this.actualPort = 0;
    cancelPendingMcpActions('MCP server was stopped');
    // A start() that is still in flight has not bound its port yet: reject it
    // so its promise always settles, and record the request so a listener that
    // binds afterwards is torn down instead of being orphaned.
    if (this.starting) {
      this.stopRequested = true;
      console.log('[MCP Server] Stop requested while starting');
      this.abortStart(new Error('MCP server start aborted: stop() called during startup'));
    }
    if (this.server) {
      // Close all SSE connections gracefully
      this.revokeAllClients();
      // close() throws ERR_SERVER_NOT_RUNNING if the listener never finished
      // binding, which is now reachable because isRunning() reports true while
      // a start is in flight. Nothing is listening in that case, so ignore it.
      try { this.server.close(); } catch (_) {}
      this.server = null;
      console.log('[MCP Server] Stopped');
    }
  }

  public isRunning() {
    // Report true while a start() is in flight so a second concurrent start()
    // is refused before it can bind a second listener.
    return !!this.server || this.starting;
  }

  public getPort(): number {
    return this.actualPort || this.requestedPort;
  }

  public getRequestedPort(): number {
    return this.requestedPort;
  }
}
