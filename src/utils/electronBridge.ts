import type { ElectronAPI } from '../vite-env';

export type { ElectronAPI };

// Test-only override hook. Null in production; tests install it so they can
// control which ElectronAPI renderer code sees WITHOUT replacing the shared
// window object (which concurrent suites own while they run).
let electronAPIForTests: ElectronAPI | null = null;

export function setElectronAPIForTests(api: ElectronAPI | null): void {
  electronAPIForTests = api;
}

export function getElectronAPI(): ElectronAPI | undefined {
  if (electronAPIForTests) {
    return electronAPIForTests;
  }
  if (typeof window !== 'undefined') {
    return window.electronAPI;
  }
  return undefined;
}
