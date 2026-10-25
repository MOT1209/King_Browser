export type McpContentBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; data: string; mimeType: string };

const IMAGE_DATA_URL = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/;

/**
 * MCP content for a tool result. Screenshots come back from the renderer as a
 * data URL; returning them as an image block lets the agent see the picture
 * instead of receiving tens of thousands of base64 characters as text.
 */
export function toMcpContent(result: string): McpContentBlock[] {
  const image = typeof result === 'string' ? IMAGE_DATA_URL.exec(result) : null;
  if (image) return [{ type: 'image', data: image[2], mimeType: image[1] }];
  return [{ type: 'text', text: result }];
}

/** Renderer failures already start with "Error:"; never print it twice. */
export function formatToolError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Error: ${message.replace(/^(Error:\s*)+/, '')}`;
}
