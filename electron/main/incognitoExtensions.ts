const incognitoAllowedExtensions = new Set<string>();

export function isExtensionAllowedInIncognito(extensionId: string, manifest: any): boolean {
  if (!extensionId) return false;
  if (manifest?.incognito === 'not_allowed') return false;
  return incognitoAllowedExtensions.has(extensionId);
}

export function setExtensionIncognitoAccess(extensionId: string, allowed: boolean): void {
  if (allowed) {
    incognitoAllowedExtensions.add(extensionId);
  } else {
    incognitoAllowedExtensions.delete(extensionId);
  }
}

export function hasExtensionIncognitoAccess(extensionId: string): boolean {
  return incognitoAllowedExtensions.has(extensionId);
}
