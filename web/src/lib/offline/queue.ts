"use client";

// Antrean offline untuk transaction_create.
// Dokumen JSON disimpan di IndexedDB (database "inventori-pwa", store "tx_queue").
// Saat online, hooks/useOfflineQueue akan mem-flush satu per satu.

import { openDB, type IDBPDatabase } from "idb";
import type { TransactionType } from "@/lib/supabase/types";

const DB_NAME = "inventori-pwa";
const DB_VERSION = 1;
const STORE = "tx_queue";

export interface QueuedTransactionItem {
  product_id: string;
  qty: number;
  override?: { batch_id: string; qty: number }[];
}

export interface QueuedTransaction {
  client_uuid: string;
  enqueued_at: number;
  payload: {
    p_location_id: string;
    p_type: TransactionType;
    p_items: QueuedTransactionItem[];
    p_notes?: string | null;
  };
  last_error?: string | null;
  retry_count?: number;
}

let _dbPromise: Promise<IDBPDatabase> | null = null;

function getDb() {
  if (typeof window === "undefined") {
    throw new Error("IndexedDB hanya tersedia di browser.");
  }
  if (_dbPromise) return _dbPromise;
  _dbPromise = openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "client_uuid" });
        store.createIndex("enqueued_at", "enqueued_at");
      }
    },
  });
  return _dbPromise;
}

export async function enqueueTransaction(
  payload: QueuedTransaction["payload"]
): Promise<QueuedTransaction> {
  const db = await getDb();
  const item: QueuedTransaction = {
    client_uuid: crypto.randomUUID(),
    enqueued_at: Date.now(),
    payload,
    retry_count: 0,
    last_error: null,
  };
  await db.put(STORE, item);
  notifyChange();
  return item;
}

export async function listQueue(): Promise<QueuedTransaction[]> {
  const db = await getDb();
  return (await db.getAllFromIndex(STORE, "enqueued_at")) as QueuedTransaction[];
}

export async function removeQueueItem(client_uuid: string) {
  const db = await getDb();
  await db.delete(STORE, client_uuid);
  notifyChange();
}

export async function updateQueueItem(item: QueuedTransaction) {
  const db = await getDb();
  await db.put(STORE, item);
  notifyChange();
}

export async function countQueue(): Promise<number> {
  const db = await getDb();
  return db.count(STORE);
}

// Event bus sederhana supaya komponen tahu kapan antrean berubah.
const CHANGE_EVENT = "inventori-queue-change";

export function notifyChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
  }
}

export function subscribeQueue(handler: () => void) {
  if (typeof window === "undefined") return () => {};
  const fn = () => handler();
  window.addEventListener(CHANGE_EVENT, fn);
  return () => window.removeEventListener(CHANGE_EVENT, fn);
}
