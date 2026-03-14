const DB_NAME = "s-cad-project-store";
const STORE_NAME = "handles";
const HANDLE_KEY = "project-folder";

function openDb() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    } catch (err) {
      reject(err);
    }
  });
}

function withStore(mode, run) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    let settled = false;
    const finishResolve = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const finishReject = (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    };
    tx.oncomplete = () => finishResolve(undefined);
    tx.onerror = () => finishReject(tx.error || new Error("IndexedDB transaction failed"));
    tx.onabort = () => finishReject(tx.error || new Error("IndexedDB transaction aborted"));
    try {
      const maybe = run(store, finishResolve, finishReject);
      if (maybe !== undefined) finishResolve(maybe);
    } catch (err) {
      finishReject(err);
    }
  }));
}

export function isProjectFolderApiSupported() {
  return typeof window !== "undefined"
    && typeof window.showDirectoryPicker === "function"
    && typeof indexedDB !== "undefined";
}

export async function saveProjectDirectoryHandle(handle) {
  if (!isProjectFolderApiSupported() || !handle) return false;
  await withStore("readwrite", (store, resolve, reject) => {
    const req = store.put(handle, HANDLE_KEY);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error || new Error("Failed to save directory handle"));
  });
  return true;
}

export async function loadProjectDirectoryHandle() {
  if (!isProjectFolderApiSupported()) return null;
  return withStore("readonly", (store, resolve, reject) => {
    const req = store.get(HANDLE_KEY);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error || new Error("Failed to load directory handle"));
  });
}

export async function clearProjectDirectoryHandle() {
  if (!isProjectFolderApiSupported()) return false;
  await withStore("readwrite", (store, resolve, reject) => {
    const req = store.delete(HANDLE_KEY);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error || new Error("Failed to clear directory handle"));
  });
  return true;
}

export async function queryProjectDirectoryPermission(handle, writable = false) {
  if (!handle?.queryPermission) return "denied";
  const mode = writable ? "readwrite" : "read";
  try {
    return await handle.queryPermission({ mode });
  } catch (_) {
    return "denied";
  }
}

export async function requestProjectDirectoryPermission(handle, writable = false) {
  if (!handle?.requestPermission) return "denied";
  const mode = writable ? "readwrite" : "read";
  try {
    return await handle.requestPermission({ mode });
  } catch (_) {
    return "denied";
  }
}

async function ensureProjectMetaDir(dirHandle, create = false) {
  return dirHandle.getDirectoryHandle(".s-cad", { create });
}

export async function readProjectSettingsFile(dirHandle, filename = "settings.json") {
  if (!dirHandle) return null;
  try {
    const metaDir = await ensureProjectMetaDir(dirHandle, false);
    const fileHandle = await metaDir.getFileHandle(filename, { create: false });
    const file = await fileHandle.getFile();
    const text = await file.text();
    return JSON.parse(text);
  } catch (_) {
    return null;
  }
}

export async function writeProjectSettingsFile(dirHandle, data, filename = "settings.json") {
  if (!dirHandle) return false;
  try {
    const metaDir = await ensureProjectMetaDir(dirHandle, true);
    const fileHandle = await metaDir.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    return true;
  } catch (_) {
    return false;
  }
}
