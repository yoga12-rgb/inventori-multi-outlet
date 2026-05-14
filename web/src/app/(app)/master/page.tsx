import Link from "next/link";
import { ArrowRight, Database } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { requireSession } from "@/lib/session";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { locationTypeLabel } from "@/lib/format";
import type { AppLocation, AppProduct, AppRole } from "@/lib/supabase/types";

export const metadata = { title: "Master Data" };

export default async function MasterPage() {
  await requireSession();
  const supabase = getSupabaseServerClient();
  const [locationsRes, productsRes, rolesRes] = await Promise.all([
    supabase
      .from("locations")
      .select("id, name, type, is_active")
      .order("name"),
    supabase
      .from("products")
      .select("id, sku, name, unit, is_active")
      .order("name"),
    supabase.from("roles").select("id, name").order("name"),
  ]);

  const locations = (locationsRes.data ?? []) as AppLocation[];
  const products = (productsRes.data ?? []) as AppProduct[];
  const roles = (rolesRes.data ?? []) as AppRole[];

  return (
    <div>
      <PageHeader
        title="Master Data"
        description="Tampilan baca-saja untuk data acuan. Modifikasi master data dilakukan oleh Super Admin lewat Supabase Studio (atau RPC khusus pada fase berikutnya)."
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <SectionCard
          title="Lokasi"
          count={locations.length}
          actions={
            <Link href="/master/locations" className="btn-secondary">
              Kelola
              <ArrowRight className="h-4 w-4" />
            </Link>
          }
        >
          <table className="table">
            <thead>
              <tr>
                <th>Nama</th>
                <th>Tipe</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {locations.map((l) => (
                <tr key={l.id}>
                  <td className="font-medium text-slate-900">{l.name}</td>
                  <td>
                    <span className="badge-slate">
                      {locationTypeLabel[l.type]}
                    </span>
                  </td>
                  <td>
                    {l.is_active ? (
                      <span className="badge-green">Aktif</span>
                    ) : (
                      <span className="badge-red">Nonaktif</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>

        <SectionCard
          title="Produk"
          count={products.length}
          actions={
            <Link href="/master/products" className="btn-secondary">
              Kelola
              <ArrowRight className="h-4 w-4" />
            </Link>
          }
        >
          <table className="table">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Nama</th>
                <th>Unit</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td className="font-mono text-xs">{p.sku}</td>
                  <td className="font-medium text-slate-900">{p.name}</td>
                  <td>{p.unit}</td>
                  <td>
                    {p.is_active ? (
                      <span className="badge-green">Aktif</span>
                    ) : (
                      <span className="badge-red">Nonaktif</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>

        <SectionCard
          title="Role"
          count={roles.length}
          actions={
            <Link href="/master/users" className="btn-secondary">
              Pengguna
              <ArrowRight className="h-4 w-4" />
            </Link>
          }
        >
          <ul className="divide-y divide-slate-100">
            {roles.map((r) => (
              <li key={r.id} className="py-2 text-sm font-medium text-slate-900">
                {r.name}
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  count,
  actions,
  children,
}: {
  title: string;
  count: number;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-slate-500" />
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="badge-slate">{count}</span>
          {actions}
        </div>
      </div>
      <div className="card-body overflow-x-auto">{children}</div>
    </div>
  );
}
