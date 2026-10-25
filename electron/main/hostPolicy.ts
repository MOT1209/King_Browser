import { isIP } from 'net';
import { isPrivateIP } from './ipAddress';

export function isLocalOrIntranetHost(hostname: string): boolean {
  if (!hostname) return false;
  const host = hostname.toLowerCase().replace(/\.+$/, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) {
    return true;
  }
  if (host === '127.0.0.1' || host.startsWith('127.') || host === '0.0.0.0' || host === '::1' || host === '[::1]') {
    return true;
  }
  const bareV6 = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  if (isIP(bareV6) !== 0) {
    return isPrivateIP(bareV6);
  }
  return false;
}
