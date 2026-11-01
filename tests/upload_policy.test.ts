import assert from 'node:assert/strict';
import { validateUploadPath, MAX_UPLOAD_BYTES, type UploadContext } from '../electron/main/uploadPolicy';

console.log('\n--- Upload Policy Test Suite ---');

function ctx(files: Record<string, { size: number; dir?: boolean }>, links: Record<string, string> = {}, platform: NodeJS.Platform = 'linux'): UploadContext {
  return {
    platform,
    userDataDir: platform === 'win32' ? 'C:\\Users\\me\\AppData\\Roaming\\King' : '/home/me/.config/king',
    homeDir: platform === 'win32' ? 'C:\\Users\\me' : '/home/me',
    fs: {
      realpath: (p) => { const r = links[p] ?? p; if (!files[r]) throw new Error('ENOENT'); return r; },
      stat: (p) => ({ isFile: () => !files[p].dir, size: files[p].size })
    }
  };
}
const ok = (r: any) => r.ok === true;

{
  const c = ctx({ '/home/me/doc.pdf': { size: 10 }, '/home/me': { size: 0, dir: true }, '/home/me/.ssh/id_rsa': { size: 5 }, '/home/me/.config/king/secure.bin': { size: 5 },
    '/home/me/.env': { size: 5 }, '/home/me/big.bin': { size: MAX_UPLOAD_BYTES + 1 }, '/home/me/.ssh/known': { size: 1 }, '/home/me/pic.png': { size: 2 } },
    { '/home/me/innocent.png': '/home/me/.ssh/known' });
  assert.ok(ok(validateUploadPath('/home/me/doc.pdf', c)));
  for (const bad of [undefined, 42, '', '  ', 'relative/doc.pdf', './doc.pdf', '/home/me/missing.pdf', '/home/me', '/home/me/doc.pdf\0.png']) {
    assert.equal(ok(validateUploadPath(bad, c)), false, String(bad));
  }
  assert.equal(ok(validateUploadPath('/home/me/.ssh/known', c)), false, 'credential folder');
  assert.equal(ok(validateUploadPath('/home/me/.ssh/id_rsa', c)), false);
  assert.equal(ok(validateUploadPath('/home/me/.config/king/secure.bin', c)), false, 'app data');
  assert.equal(ok(validateUploadPath('/home/me/.env', c)), false, 'dotenv name');
  assert.equal(ok(validateUploadPath('/home/me/big.bin', c)), false, 'size cap');
  assert.equal(ok(validateUploadPath('/home/me/innocent.png', c)), false, 'a symlink into a credential folder is judged by its target');
  assert.equal(ok(validateUploadPath('/home/me/../me/.ssh/known', c)), false, 'dot-dot cannot dodge the check');
  assert.equal((validateUploadPath('/home/me/pic.png', c) as any).path, '/home/me/pic.png');
  console.log('[PASS] Upload policy - only bounded regular files outside credential and app-data folders pass');
}

{
  const c = ctx({ 'C:\\Users\\me\\Docs\\a.pdf': { size: 1 }, 'C:\\Users\\me\\.SSH\\k': { size: 1 }, 'C:\\USERS\\ME\\APPDATA\\ROAMING\\KING\\x': { size: 1 } }, {}, 'win32');
  assert.ok(ok(validateUploadPath('C:\\Users\\me\\Docs\\a.pdf', c)));
  assert.equal(ok(validateUploadPath('\\\\server\\share\\a.pdf', c)), false, 'UNC path');
  assert.equal(ok(validateUploadPath('C:\\Users\\me\\.SSH\\k', c)), false, 'case-insensitive on Windows');
  assert.equal(ok(validateUploadPath('C:\\USERS\\ME\\APPDATA\\ROAMING\\KING\\x', c)), false);
  console.log('[PASS] Upload policy - Windows paths are case-insensitive and UNC is refused');
}
