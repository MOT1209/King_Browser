/**
 * Shapes the Tool Manager exchanges with the main process (electron/main/customTools.ts).
 * A credential is write-only: views only say whether one is saved.
 */
export type McpParamType = 'string' | 'number' | 'integer' | 'boolean';

export interface McpToolParameter {
  name: string;
  type: McpParamType;
  description: string;
  required: boolean;
  enum?: string[];
  maxLength?: number;
  minimum?: number;
  maximum?: number;
}

export type McpToolAuth = { type: 'none' } | { type: 'bearer' } | { type: 'header'; headerName: string };

export interface McpToolHttpConfig {
  method: 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  urlTemplate: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  bodyTemplate?: Record<string, unknown>;
  auth: McpToolAuth;
  timeoutMs: number;
  maxResponseBytes: number;
}

/** What the form edits and what is sent to the main process (it validates again). */
export interface McpCustomToolInput {
  name: string;
  description: string;
  enabled?: boolean;
  parameters: McpToolParameter[];
  http: Partial<McpToolHttpConfig> & { method: McpToolHttpConfig['method']; urlTemplate: string };
  approval: 'always' | 'read-only';
}

export interface McpCustomToolView extends McpCustomToolInput {
  id: string;
  enabled: boolean;
  type: 'http';
  http: McpToolHttpConfig;
  createdAt: string;
  updatedAt: string;
  hasSecret: boolean;
  valid: boolean;
  validation: { ok: boolean; at: string; errors: string[] };
  lastTest?: { ok: boolean; at: string; message: string };
}

export interface McpBuiltInToolView {
  name: string;
  description: string;
  source: 'built-in';
  level: 'safe' | 'medium' | 'sensitive';
  enabled: boolean;
}

export interface McpToolRegistry { builtIn: McpBuiltInToolView[]; custom: McpCustomToolView[] }

export type McpToolMutation =
  | { ok: true; tool: McpCustomToolView }
  | { ok: false; errors: string[]; needsConfirmation?: boolean; changes?: string[] };
