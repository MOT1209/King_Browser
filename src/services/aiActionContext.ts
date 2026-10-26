import type { AIActionContext } from './aiAgent';

/**
 * Hand-over point for the browser actions the AI agent may take.
 *
 * The browser bridge (loaded with the main window) publishes the context here
 * and the agent module subscribes when it loads. Importing the agent straight
 * into the bridge pulled the whole agent into the startup bundle even though it
 * is only used once the assistant panel opens. A subscriber that arrives late
 * still receives the latest context, so nothing is lost by loading it lazily.
 *
 * Dependency-free at runtime (the import above is type-only).
 */

type Listener = (context: AIActionContext) => void;

let latest: AIActionContext | null = null;
const listeners = new Set<Listener>();

export function publishActionContext(context: AIActionContext): void {
  latest = context;
  listeners.forEach((listener) => listener(context));
}

export function subscribeActionContext(listener: Listener): () => void {
  listeners.add(listener);
  if (latest) listener(latest);
  return () => { listeners.delete(listener); };
}
