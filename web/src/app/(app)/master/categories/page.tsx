import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { TransactionCategory } from "@/lib/supabase/types";
import { CategoriesTable } from "./categories-table";

export const metadata = { title: "Kategori Pengeluaran · Master Data" };

export default async function CategoriesPage() {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();
  const isAdmin = session.profile?.role?.name === "Super Admin";

  const { data } = await supabase
    .from("transaction_categories")
    .select("id, code, name, description, is_system, is_active, sort_order")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  const categories = (data ?? []) as TransactionCategory[];

  return (
    <div>
      <PageHeader
        title="Kategori Pengeluaran"
        description="Daftar kategori transaksi pengeluaran (penjualan, retur, dst.). Kategori sistem tidak bisa dihapus, hanya dinonaktifkan. Tambah kategori baru kapan saja tanpa migrasi DB."
      />

      {categories.length === 0 ? (
        <EmptyState
          title="Belum ada kategori"
          description="Hubungi Super Admin untuk menambahkan kategori awal."
          icon={Plus}
        />
      ) : null}

      <CategoriesTable initial={categories} isAdmin={isAdmin} />
    </div>
  );
}
