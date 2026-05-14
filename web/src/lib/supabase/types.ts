// Tipe domain mengikuti SCHEMA.md & API.md.
// Tidak generated dari supabase gen types karena project ini boleh dijalankan
// tanpa CLI; tipe minimal yang dipakai UI ditulis manual.

export type LocationType = "gudang_produksi" | "outlet";

export type TransferStatus = "in_transit" | "completed" | "cancelled";

export type TransactionType =
  | "penjualan"
  | "complaiment"
  | "retur"
  | "rusak"
  | "lainnya";

export interface AppLocation {
  id: string;
  name: string;
  type: LocationType;
  is_active: boolean;
}

export interface AppProduct {
  id: string;
  sku: string;
  name: string;
  unit: string;
  is_active: boolean;
}

export interface AppRole {
  id: string;
  name: string;
}

export interface AppUserProfile {
  id: string;
  name: string;
  email: string;
  role_id: string;
  location_id: string | null;
  is_active: boolean;
  role?: AppRole | null;
  location?: AppLocation | null;
}

export interface InventoryBatch {
  id: string;
  product_id: string;
  location_id: string;
  production_date: string;
  expired_date: string | null;
  qty_available: number;
}

export interface DashboardStockRow {
  product_id: string;
  product_sku: string;
  product_name: string;
  qty_total: number;
  batch_count: number;
  oldest_production_date: string | null;
  nearest_expired_date: string | null;
}

export interface IncomingTransferRow {
  transfer_id: string;
  transfer_number: string;
  from_location_id: string;
  from_location: string;
  sent_at: string;
  total_qty: number;
  product_count: number;
}

export interface FifoPreviewRow {
  batch_id: string;
  production_date: string;
  expired_date: string | null;
  qty_available: number;
  qty_take: number;
}

export interface TransferRecord {
  id: string;
  transfer_number: string;
  from_location_id: string;
  to_location_id: string;
  status: TransferStatus;
  notes: string | null;
  sent_at: string;
  received_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  from_location?: AppLocation | null;
  to_location?: AppLocation | null;
}

export interface TransferItemRecord {
  id: string;
  transfer_id: string;
  product_id: string;
  source_batch_id: string;
  production_date: string;
  expired_date: string | null;
  qty: number;
  product?: AppProduct | null;
}

export interface TransactionRecord {
  id: string;
  transaction_number: string;
  location_id: string;
  type: TransactionType;
  notes: string | null;
  client_uuid: string | null;
  created_by: string;
  created_at: string;
  location?: AppLocation | null;
}

export interface TransactionItemRecord {
  id: string;
  transaction_id: string;
  product_id: string;
  batch_id: string;
  qty: number;
  product?: AppProduct | null;
}
