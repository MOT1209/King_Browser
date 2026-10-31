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
