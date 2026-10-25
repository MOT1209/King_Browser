import fs from 'fs';
import path from 'path';

export const MAX_CRASH_LOG_BYTES = 1024 * 1024;
const RETAINED_CRASH_LOG_BYTES = 100 * 1024;

export function appendCrashLog(logPath: string, entry: string): void {
  const logDirectory = path.dirname(logPath);
  fs.mkdirSync(logDirectory, { recursive: true, mode: 0o700 });

  let descriptor: number;
  try {
    descriptor = fs.openSync(logPath, 'r+');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    try {
      fs.closeSync(fs.openSync(logPath, 'wx', 0o600));
    } catch (createError) {
      if ((createError as NodeJS.ErrnoException).code !== 'EEXIST') throw createError;
    }
    descriptor = fs.openSync(logPath, 'r+');
  }

  try {
    const currentSize = fs.fstatSync(descriptor).size;
    let appendOffset = currentSize;
    if (currentSize > MAX_CRASH_LOG_BYTES) {
      const retainedSize = Math.min(RETAINED_CRASH_LOG_BYTES, currentSize);
      const retainedLog = Buffer.alloc(retainedSize);
      fs.readSync(descriptor, retainedLog, 0, retainedSize, currentSize - retainedSize);
      fs.ftruncateSync(descriptor, 0);
      fs.writeSync(descriptor, retainedLog, 0, retainedSize, 0);
      appendOffset = retainedSize;
    }
    const crashEntry = Buffer.from(entry, 'utf8');
    fs.writeSync(descriptor, crashEntry, 0, crashEntry.length, appendOffset);
  } finally {
    fs.closeSync(descriptor);
  }
}
