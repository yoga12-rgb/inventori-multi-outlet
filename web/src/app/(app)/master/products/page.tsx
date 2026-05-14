import { Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { requireSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import type { AppProduct } from "@/lib/supabase/types";
import { ProductsTable } from "./products-table";

export const metadata = { title: "Produk · Master Data" };

type SearchParams = { q?: string; show?: "all" | "active" };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await requireSession();
  const supabase = getSupabaseServerClient();

  const query = (searchParams.q ?? "").trim();
  const showAll = searchParams.show === "all";

  let q = supabase
    .from("products")
    .select("id, sku, name, unit, is_active")
    .order("name", { ascending: true });
  if (!showAll) q = q.eq("is_active", true);
  if (query) q = q.or(`name.ilike.%${query}%,sku.ilike.%${query}%`);

  const { data } = await q;
  const products = (data ?? []) as AppProduct[];
  const isAdmin = session.profile?.role?.name === "Super Admin";

  return (
    <div>
      <PageHeader
        title="Produk"
        description="Kelola daftar barang jadi yang dipakai oleh seluruh outlet. Hanya Super Admin yang dapat menambah, mengubah, atau menonaktifkan produk."
      />

      {products.length === 0 ? (
        <EmptyState
          title="Belum ada produk"
          description={
            isAdmin
              ? "Klik tombol Tambah Produk untuk membuat data pertama."
              : "Hubungi Super Admin untuk menambah data produk."
          }
          icon={Plus}
        />
      ) : null}

      <ProductsTable
        initial={products}
        initialQuery={query}
        initialShowAll={showAll}
        isAdmin={isAdmin}
      />
    </div>
  );
}
