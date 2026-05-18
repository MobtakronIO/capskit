import type { QueueEntry } from './types/client.type';

const STORE_NAME = 'capskit-offline-queue';
const DB_NAME = 'capskit-offline-db';
const DB_VERSION = 1;

/**
 * IndexedDB-backed queue for offline operations.
 * Falls back to in-memory storage when IndexedDB is unavailable (Node.js, SSR).
 */
export class OfflineQueue {
  private maxQueueSize: number;
  private storageMode: 'indexeddb' | 'memory';
  private memoryStore: QueueEntry[] = [];
  private dbReady: Promise<boolean>;

  constructor(options?: { maxQueueSize?: number; storage?: 'indexeddb' | 'memory' }) {
    this.maxQueueSize = options?.maxQueueSize ?? 100;
    this.storageMode = options?.storage ?? (this.isIndexedDbAvailable() ? 'indexeddb' : 'memory');
    this.dbReady = this.storageMode === 'indexeddb' ? this.initDb() : Promise.resolve(false);
  }

  // ── Public API ──────────────────────────────────────────────────────

  async enqueue(entry: Omit<QueueEntry, 'id' | 'timestamp'>): Promise<QueueEntry> {
    const fullEntry: QueueEntry = {
      ...entry,
      id: this.generateId(),
      timestamp: Date.now(),
    };

    // Enforce max size: drop oldest if at capacity
    const currentSize = await this.size();
    if (currentSize >= this.maxQueueSize) {
      await this.dequeue(); // Remove oldest to make room
    }

    if (this.storageMode === 'indexeddb') {
      const ready = await this.dbReady;
      if (ready) {
        await this.dbPut(fullEntry);
        return fullEntry;
      }
    }

    // Memory fallback
    this.memoryStore.push(fullEntry);
    return fullEntry;
  }

  async dequeue(): Promise<QueueEntry | null> {
    if (this.storageMode === 'indexeddb') {
      const ready = await this.dbReady;
      if (ready) {
        return this.dbDeleteOldest();
      }
    }

    return this.memoryStore.shift() ?? null;
  }

  async peek(): Promise<QueueEntry | null> {
    if (this.storageMode === 'indexeddb') {
      const ready = await this.dbReady;
      if (ready) {
        return this.dbGetOldest();
      }
    }

    return this.memoryStore[0] ?? null;
  }

  async clear(): Promise<void> {
    if (this.storageMode === 'indexeddb') {
      const ready = await this.dbReady;
      if (ready) {
        await this.dbClear();
        return;
      }
    }

    this.memoryStore = [];
  }

  async size(): Promise<number> {
    if (this.storageMode === 'indexeddb') {
      const ready = await this.dbReady;
      if (ready) {
        return this.dbCount();
      }
    }

    return this.memoryStore.length;
  }

  async getAll(): Promise<QueueEntry[]> {
    if (this.storageMode === 'indexeddb') {
      const ready = await this.dbReady;
      if (ready) {
        return this.dbGetAll();
      }
    }

    return [...this.memoryStore];
  }

  // ── IndexedDB helpers ───────────────────────────────────────────────

  private isIndexedDbAvailable(): boolean {
    try {
      return typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch {
      return false;
    }
  }

  private initDb(): Promise<boolean> {
    return new Promise((resolve) => {
      try {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('timestamp', 'timestamp', { unique: false });
          }
        };

        request.onsuccess = () => {
          request.result.close();
          resolve(true);
        };

        request.onerror = () => {
          resolve(false);
        };
      } catch {
        resolve(false);
      }
    });
  }

  private openDb(mode: IDBTransactionMode = 'readwrite'): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  private dbPut(entry: QueueEntry): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        const db = await this.openDb('readwrite');
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(entry);
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      } catch (err) {
        reject(err);
      }
    });
  }

  private dbDeleteOldest(): Promise<QueueEntry | null> {
    return new Promise(async (resolve, reject) => {
      try {
        const db = await this.openDb('readwrite');
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('timestamp');
        const cursorRequest = index.openCursor();

        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (cursor) {
            const entry = cursor.value as QueueEntry;
            cursor.delete();
            tx.oncomplete = () => { db.close(); resolve(entry); };
          } else {
            db.close();
            resolve(null);
          }
        };

        cursorRequest.onerror = () => { db.close(); reject(cursorRequest.error); };
      } catch (err) {
        reject(err);
      }
    });
  }

  private dbGetOldest(): Promise<QueueEntry | null> {
    return new Promise(async (resolve, reject) => {
      try {
        const db = await this.openDb('readonly');
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const index = store.index('timestamp');

        // Use cursor to get the first (oldest) entry
        const cursorRequest = index.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          db.close();
          resolve(cursor ? (cursor.value as QueueEntry) : null);
        };
        cursorRequest.onerror = () => { db.close(); reject(cursorRequest.error); };
      } catch (err) {
        reject(err);
      }
    });
  }

  private dbClear(): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        const db = await this.openDb('readwrite');
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.clear();
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => { db.close(); reject(tx.error); };
      } catch (err) {
        reject(err);
      }
    });
  }

  private dbCount(): Promise<number> {
    return new Promise(async (resolve, reject) => {
      try {
        const db = await this.openDb('readonly');
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.count();
        request.onsuccess = () => { db.close(); resolve(request.result); };
        request.onerror = () => { db.close(); reject(request.error); };
      } catch (err) {
        reject(err);
      }
    });
  }

  private dbGetAll(): Promise<QueueEntry[]> {
    return new Promise(async (resolve, reject) => {
      try {
        const db = await this.openDb('readonly');
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const request = store.getAll();
        request.onsuccess = () => {
          const entries = (request.result as QueueEntry[]).sort(
            (a, b) => a.timestamp - b.timestamp,
          );
          db.close();
          resolve(entries);
        };
        request.onerror = () => { db.close(); reject(request.error); };
      } catch (err) {
        reject(err);
      }
    });
  }

  private generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}
