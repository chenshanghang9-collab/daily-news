export const REMEMBER_NAME_MS = 30 * 24 * 60 * 60 * 1000;

const NAME_KEY = 'daily.name';
const MAX_TIMESTAMP = 8640000000000000;
const emptyName = () => ({ name: '', remember: false });

function validName(value) {
  if (typeof value !== 'string') return '';
  const name = value.trim();
  return name && Array.from(name).length <= 16 ? name : '';
}

function validTimestamp(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= MAX_TIMESTAMP;
}

export function createNameStorage({
  local = () => globalThis.localStorage,
  session = () => globalThis.sessionStorage,
  now = () => Date.now(),
} = {}) {
  // Access the browser properties inside try/catch: their getters can throw too.
  function read(getStorage) {
    try { return getStorage().getItem(NAME_KEY); } catch { return null; }
  }

  function remove(getStorage) {
    try { getStorage().removeItem(NAME_KEY); return true; } catch { return false; }
  }

  function write(getStorage, value) {
    try { getStorage().setItem(NAME_KEY, JSON.stringify(value)); return true; } catch { return false; }
  }

  function time() {
    try { return now(); } catch { return NaN; }
  }

  function parse(getStorage) {
    const raw = read(getStorage);
    if (raw === null) return null;
    try {
      const value = JSON.parse(raw);
      if (value === null) remove(getStorage);
      return value;
    } catch { remove(getStorage); return null; }
  }

  function clear() {
    const localCleared = remove(local);
    const sessionCleared = remove(session);
    return localCleared && sessionCleared;
  }

  function load() {
    const sessionRecord = parse(session);
    const sessionName = sessionRecord && typeof sessionRecord === 'object' && !Array.isArray(sessionRecord)
      && !Object.hasOwn(sessionRecord, 'expiresAt') ? validName(sessionRecord.name) : '';
    if (sessionRecord !== null && !sessionName) remove(session);

    const localRecord = parse(local);
    if (typeof localRecord === 'string') {
      const legacyName = validName(localRecord);
      remove(local);
      if (sessionName) return { name: sessionName, remember: false };
      if (legacyName) {
        write(session, { name: legacyName });
        return { name: legacyName, remember: false };
      }
      return emptyName();
    }

    const localName = localRecord && typeof localRecord === 'object' && !Array.isArray(localRecord)
      ? validName(localRecord.name) : '';
    const currentTime = time();
    const remembered = Boolean(localName && validTimestamp(localRecord.expiresAt)
      && validTimestamp(currentTime) && localRecord.expiresAt > currentTime);
    if (localRecord !== null && !remembered) remove(local);

    // A tab's explicit session choice may differ from a choice made in another tab.
    if (sessionName) return { name: sessionName, remember: false };
    return remembered ? { name: localName, remember: true } : emptyName();
  }

  function save(value, remember) {
    const name = validName(value);
    if (!name) return { ...emptyName(), stored: false };

    const cleared = clear();
    if (remember) {
      const currentTime = time();
      const expiresAt = currentTime + REMEMBER_NAME_MS;
      if (cleared && validTimestamp(currentTime) && validTimestamp(expiresAt)
        && write(local, { name, expiresAt })) {
        return { name, remember: true, stored: true };
      }
      // Keep the current tab usable while telling the caller persistence failed.
      write(session, { name });
      return { name, remember: false, stored: false };
    }

    const written = write(session, { name });
    return { name, remember: false, stored: cleared && written };
  }

  return { load, save, clear };
}
