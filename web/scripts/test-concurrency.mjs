// =====================================================================
// test_concurrency.mjs
// Smoke test concurrency: dua transaksi penjualan konkuren atas batch
// yang sama tidak boleh menghasilkan qty_available negatif.
//
// Strategi:
//   - Buat batch baru qty 10 di Outlet Pajajaran (lokasi yang belum
//     dipakai test lain).
//   - Buka 2 koneksi Postgres terpisah.
//   - Eksekusi 2x rpc transaction_create(qty=8) bersamaan via Promise.all.
//   - Hasil yang valid hanya:
//       (a) salah satu sukses, satu raise P0001 (stok kurang)
//       (b) ATAU keduanya sukses TAPI total qty terambil tidak boleh > 10
//         dan qty_available akhir tidak boleh negatif.
//   - Pada implementasi RPC kita (UPDATE ... WHERE qty_available >= qty),
//     skenario (a) yang terjadi.
//
// Dijalankan via Node (bukan psql) supaya bisa benar-benar paralel.
// =====================================================================

import pg from "pg";

const DSN =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:55432/appdb";

const SQL_PREP = `
do $$
declare
  v_pa  uuid;
  v_loc uuid;
begin
  select id into v_pa  from public.products  where sku = 'SKU-001';
  select id into v_loc from public.locations where name = 'Outlet Pajajaran';

  insert into public.inventory_batches(product_id, location_id, production_date, expired_date, qty_available)
  values (v_pa, v_loc, current_date - 40, current_date + 60, 10)
  on conflict (product_id, location_id, production_date) do update
    set qty_available = 10,
        updated_at    = now();
end$$;
`;

const SQL_CALL = `
select public.transaction_create(
  p_location_id => (select id from public.locations where name = 'Outlet Pajajaran'),
  p_type        => 'penjualan',
  p_items       => jsonb_build_array(
                     jsonb_build_object(
                       'product_id', (select id from public.products where sku = 'SKU-001'),
                       'qty', 8
                     )
                   ),
  p_notes       => 'concurrency test',
  p_client_uuid => gen_random_uuid(),
  p_created_by  => (select id from public.users limit 1)
) as result;
`;

const SQL_FINAL = `
select qty_available
from public.inventory_batches b
join public.locations l on l.id = b.location_id and l.name = 'Outlet Pajajaran'
join public.products  p on p.id = b.product_id  and p.sku  = 'SKU-001'
where b.production_date = current_date - 40;
`;

async function exec(client, sql) {
  return await client.query(sql);
}

async function main() {
  const prep = new pg.Client({ connectionString: DSN });
  await prep.connect();
  await exec(prep, SQL_PREP);
  await prep.end();

  // Pastikan ada user di public.users.
  {
    const c = new pg.Client({ connectionString: DSN });
    await c.connect();
    const r = await c.query("select count(*)::int as n from public.users");
    if (r.rows[0].n === 0) {
      console.log("SKIP: belum ada user di public.users (jalankan 99_seed_test_user.sql).");
      await c.end();
      process.exit(0);
    }
    await c.end();
  }

  const c1 = new pg.Client({ connectionString: DSN });
  const c2 = new pg.Client({ connectionString: DSN });
  await Promise.all([c1.connect(), c2.connect()]);

  // Jalankan dua call PARALEL (bukan sequential).
  const results = await Promise.allSettled([
    exec(c1, SQL_CALL),
    exec(c2, SQL_CALL),
  ]);

  await Promise.all([c1.end(), c2.end()]);

  const summary = results.map((r, i) => {
    if (r.status === "fulfilled") {
      return { idx: i, ok: true, json: r.value.rows[0]?.result };
    }
    const err = r.reason;
    return {
      idx: i,
      ok: false,
      code: err?.code ?? null,
      message: err?.message ?? String(err),
    };
  });

  console.log(JSON.stringify(summary, null, 2));

  const successes = summary.filter((s) => s.ok).length;
  const stockErrors = summary.filter((s) => !s.ok && s.code === "P0001").length;
  const otherErrors = summary.filter((s) => !s.ok && s.code !== "P0001").length;

  // Verifikasi state akhir.
  const verify = new pg.Client({ connectionString: DSN });
  await verify.connect();
  const r = await verify.query(SQL_FINAL);
  const qtyAfter = r.rows[0]?.qty_available;
  await verify.end();
  console.log("qty_available akhir:", qtyAfter);

  // Aturan invariant:
  //  - qty_available akhir >= 0.
  //  - Tidak ada error yang BUKAN P0001 (selain itu berarti bug, bukan stok kurang).
  //  - Total potongan (8 * successes) <= 10 (qty awal).
  const assertions = [];
  if (qtyAfter < 0) assertions.push(`qty_available negatif (${qtyAfter})`);
  if (otherErrors > 0) assertions.push(`error non-P0001: ${otherErrors}`);
  if (8 * successes > 10) assertions.push(`total potongan ${8 * successes} > 10`);
  if (successes === 0) assertions.push("tidak ada transaksi yang sukses sama sekali");

  if (assertions.length) {
    console.error("FAIL:", assertions.join("; "));
    process.exit(1);
  }

  console.log(
    `OK CONCURRENCY: success=${successes}, P0001=${stockErrors}, qtyAfter=${qtyAfter}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
