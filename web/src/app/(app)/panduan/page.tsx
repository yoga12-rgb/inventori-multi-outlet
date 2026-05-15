import Link from "next/link";
import {
  ArrowLeftRight,
  BookOpen,
  CheckCircle2,
  CloudOff,
  Database,
  Info,
  KeyRound,
  LayoutDashboard,
  Lightbulb,
  PackagePlus,
  PackageSearch,
  Settings,
  ShoppingCart,
  Truck,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { GuideToc } from "./toc";

export const metadata = {
  title: "Panduan Penggunaan · Sistem Inventori Multi-Outlet",
};

const SECTIONS = [
  { id: "ringkasan", label: "Ringkasan Sistem" },
  { id: "akses-peran", label: "Akses & Peran" },
  { id: "alur-cepat", label: "Alur Cepat (5 Menit)" },
  { id: "dashboard", label: "Dashboard" },
  { id: "kasir", label: "Kasir & FIFO" },
  { id: "transaksi", label: "Riwayat Transaksi" },
  { id: "transfer", label: "Mutasi / Transfer" },
  { id: "produksi", label: "Produksi" },
  { id: "inventory", label: "Inventory" },
  { id: "master", label: "Master Data" },
  { id: "offline", label: "Mode Offline" },
  { id: "kode-error", label: "Kode Error" },
  { id: "tips", label: "Tips & Praktik Baik" },
  { id: "faq", label: "FAQ" },
];

export default function PanduanPage() {
  return (
    <div>
      <PageHeader
        title="Panduan Penggunaan"
        description="Referensi singkat untuk setiap fitur. Pakai daftar isi di kanan untuk lompat ke topik tertentu."
        actions={
          <span className="badge-blue">
            <BookOpen className="h-3.5 w-3.5" />
            Versi Phase 1
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1fr_240px]">
        <article className="space-y-6">
          <Section
            id="ringkasan"
            title="Ringkasan Sistem"
            icon={<Info className="h-4 w-4" />}
          >
            <p>
              Aplikasi ini memantau stok produk jadi yang tersebar di
              <strong> Gudang Pusat </strong> dan beberapa <strong>outlet</strong>.
              Setiap pengeluaran dipotong otomatis dengan logika
              <strong> FIFO </strong> (First In, First Out) berdasarkan tanggal
              produksi tertua. Mutasi antar lokasi mengikuti pola
              <strong> in-transit </strong>: stok dipotong saat dikirim, lalu
              ditambahkan ke tujuan saat diterima.
            </p>
            <ul>
              <li>
                <strong>Backend:</strong> Supabase (PostgreSQL + Auth + RLS).
                Semua mutasi data dijalankan via RPC <code>security definer</code>.
              </li>
              <li>
                <strong>Frontend:</strong> Next.js 14 PWA, offline-first untuk
                transaksi kasir.
              </li>
              <li>
                <strong>Idempotency:</strong> setiap transaksi membawa{" "}
                <code>client_uuid</code> sehingga aman dikirim ulang dari
                antrean offline tanpa duplikasi.
              </li>
            </ul>
          </Section>

          <Section
            id="akses-peran"
            title="Akses & Peran"
            icon={<KeyRound className="h-4 w-4" />}
          >
            <p>
              Empat peran utama. Hak akses diatur lewat RBAC dan dipertegas oleh
              Row Level Security (RLS) Supabase, jadi user hanya melihat data
              yang relevan dengan lokasinya.
            </p>
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Peran</th>
                    <th>Lingkup</th>
                    <th>Kemampuan utama</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <span className="badge-blue">Super Admin</span>
                    </td>
                    <td>Lintas lokasi</td>
                    <td>
                      Konfigurasi master data, kelola pengguna, akses penuh ke
                      semua menu.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <span className="badge-slate">Kepala Gudang</span>
                    </td>
                    <td>Gudang Pusat + lintas lokasi (read)</td>
                    <td>
                      Catat produksi, kirim transfer ke outlet, monitor stok
                      semua lokasi.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <span className="badge-slate">Kasir Outlet</span>
                    </td>
                    <td>Outlet sendiri</td>
                    <td>
                      Catat penjualan/retur/complaiment/rusak, terima transfer
                      masuk.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <span className="badge-slate">Staf Outlet</span>
                    </td>
                    <td>Outlet sendiri</td>
                    <td>
                      Lihat stok, terima transfer (tanpa membuat transaksi
                      kasir).
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <Callout
              icon={<Lightbulb className="h-4 w-4" />}
              tone="info"
              title="Lokasi default"
            >
              Atur lokasi default Anda lewat menu profil di pojok kanan atas →
              <strong> Profil & Lokasi</strong>. RLS membatasi data berdasarkan
              lokasi ini.
            </Callout>
          </Section>

          <Section
            id="alur-cepat"
            title="Alur Cepat (5 Menit)"
            icon={<CheckCircle2 className="h-4 w-4" />}
          >
            <ol>
              <li>
                <strong>Login</strong> dan, jika perlu, set lokasi default di
                halaman <Link href="/profile">Profil</Link>.
              </li>
              <li>
                <strong>Periksa dashboard</strong> di{" "}
                <Link href="/">/</Link> untuk total stok dan transfer masuk.
              </li>
              <li>
                <strong>Catat transaksi</strong> di{" "}
                <Link href="/kasir">/kasir</Link>: pilih produk &amp; qty,
                konfirmasi alokasi FIFO, klik <em>Simpan</em>.
              </li>
              <li>
                <strong>Periksa hasil</strong> di{" "}
                <Link href="/transaksi">/transaksi</Link> dan{" "}
                <Link href="/inventory">/inventory</Link> untuk memastikan stok
                berkurang sesuai batch.
              </li>
              <li>
                Untuk gudang: <strong>kirim transfer</strong> via{" "}
                <Link href="/transfers/new">/transfers/new</Link>. Outlet tujuan
                akan menerima dan menekan <em>Terima Barang</em> di detail
                transfer.
              </li>
            </ol>
          </Section>

          <Section
            id="dashboard"
            title="Dashboard"
            icon={<LayoutDashboard className="h-4 w-4" />}
          >
            <p>
              Halaman <Link href="/">/</Link> memuat ringkasan stok per produk
              dan barang yang sedang menuju lokasi terpilih. Kartu di atas
              menampilkan total qty, jumlah transfer masuk, batch tertua, dan
              shortcut ke kasir.
            </p>
            <ul>
              <li>
                Pakai <strong>pemilih lokasi</strong> di kanan atas untuk
                berpindah konteks (Super Admin/Kepala Gudang).
              </li>
              <li>
                Halaman akan auto-refresh setiap 10 menit selama device online.
              </li>
              <li>
                Hover salah satu transfer untuk melihat ringkas isi item tanpa
                masuk halaman detail.
              </li>
            </ul>
          </Section>

          <Section
            id="kasir"
            title="Kasir & FIFO"
            icon={<ShoppingCart className="h-4 w-4" />}
          >
            <p>
              Halaman <Link href="/kasir">/kasir</Link> dipakai untuk semua jenis
              pengeluaran: <em>Penjualan, Complaiment, Retur, Rusak,</em> dan{" "}
              <em>Lainnya</em>. Setiap baris produk akan otomatis menampilkan
              alokasi FIFO sebelum disimpan.
            </p>
            <h4>Mode FIFO (default)</h4>
            <ol>
              <li>Pilih lokasi, tipe pengeluaran, dan catatan opsional.</li>
              <li>Tambahkan produk dan masukkan qty.</li>
              <li>
                Sistem memanggil <code>fifo_preview</code> dan menampilkan
                pemotongan dari batch tertua.
              </li>
              <li>
                Klik <strong>Simpan Transaksi</strong>. RPC{" "}
                <code>transaction_create</code> menjalankan transaksi atomic.
              </li>
            </ol>

            <h4>Mode Manual Override</h4>
            <p>
              Klik <strong>Override Batch</strong> di kanan atas baris produk
              jika ingin memilih batch sendiri (mis. ada batch khusus yang harus
              dikeluarkan duluan).
            </p>
            <ul>
              <li>
                Total qty dari semua alokasi <strong>harus sama</strong> dengan
                qty produk; UI akan menandai mismatch berwarna merah.
              </li>
              <li>
                Batch yang dipilih harus milik lokasi dan produk yang sama;
                kalau tidak, server menolak dengan kode <code>P0002</code>.
              </li>
              <li>
                Qty per alokasi tidak boleh melebihi stok batch tersebut (lihat
                kolom <em>Stok Tersedia</em>); kalau lebih, server menolak{" "}
                <code>P0001</code>.
              </li>
            </ul>
            <Callout
              icon={<Lightbulb className="h-4 w-4" />}
              tone="info"
              title="Kapan pakai override?"
            >
              Pakai override hanya saat ada alasan operasional (mis. batch
              tertentu rusak dan harus dikeluarkan terpisah). Untuk operasional
              normal, FIFO default lebih akurat dan menghindari risiko stok
              kedaluwarsa.
            </Callout>
          </Section>

          <Section
            id="transaksi"
            title="Riwayat Transaksi"
            icon={<Database className="h-4 w-4" />}
          >
            <p>
              Halaman <Link href="/transaksi">/transaksi</Link> menampilkan 50
              transaksi terbaru di lokasi terpilih beserta panel{" "}
              <strong>Antrean Offline</strong>. Item antrean adalah transaksi
              yang dibuat saat device offline atau gagal kirim sementara.
            </p>
            <ul>
              <li>
                Klik <em>Kirim sekarang</em> untuk menyinkronkan satu item
                manual.
              </li>
              <li>
                Klik <em>Hapus</em> kalau item tidak relevan lagi (mis.
                duplikasi).
              </li>
              <li>
                Antrean otomatis ter-flush ketika device kembali online; item
                idempotent berkat <code>client_uuid</code>.
              </li>
            </ul>
          </Section>

          <Section
            id="transfer"
            title="Mutasi / Transfer"
            icon={<ArrowLeftRight className="h-4 w-4" />}
          >
            <p>
              Pola in-transit: stok di lokasi asal dipotong saat dikirim, lalu
              ditambahkan ke lokasi tujuan saat diterima. Snapshot batch asal
              tersimpan supaya audit jejak tetap akurat meskipun batch sumber
              berubah.
            </p>
            <h4>Mengirim transfer</h4>
            <ol>
              <li>
                Buka <Link href="/transfers/new">/transfers/new</Link>.
              </li>
              <li>Pilih lokasi asal dan tujuan.</li>
              <li>
                Pilih batch yang akan dikirim (urut tanggal produksi naik) dan
                tentukan qty.
              </li>
              <li>
                Klik <strong>Kirim Transfer</strong>. Status akan menjadi{" "}
                <em>In-Transit</em>.
              </li>
            </ol>
            <h4>Menerima transfer</h4>
            <ol>
              <li>
                Buka <Link href="/transfers">/transfers</Link>; daftar
                transfer masuk muncul di kolom <em>Masuk</em>.
              </li>
              <li>
                Hover pada baris untuk melihat ringkasan produk; klik untuk
                masuk ke halaman detail.
              </li>
              <li>
                Klik <strong>Terima Barang</strong>; stok lokasi tujuan akan
                ditambah dengan <code>production_date</code> &amp;{" "}
                <code>expired_date</code> yang sama. Jika ada batch dengan
                tanggal produksi yang sama, qty digabung.
              </li>
              <li>
                Bila salah kirim, klik <strong>Batalkan</strong> selama status
                masih <em>In-Transit</em>; stok dikembalikan ke batch asal.
              </li>
            </ol>
          </Section>

          <Section
            id="produksi"
            title="Produksi"
            icon={<PackagePlus className="h-4 w-4" />}
          >
            <p>
              Halaman <Link href="/production">/production</Link> dipakai oleh
              Kepala Gudang untuk mencatat batch produksi baru di Gudang Pusat.
              Batch baru inilah yang nantinya didistribusikan via Transfer ke
              outlet.
            </p>
            <ul>
              <li>
                Pilih produk, isi <em>Tanggal Produksi</em>, <em>Tanggal Expired</em>,
                dan qty awal.
              </li>
              <li>
                Bila kombinasi (produk, lokasi, tanggal produksi) sudah ada,
                qty otomatis ditambahkan ke baris yang sama.
              </li>
            </ul>
          </Section>

          <Section
            id="inventory"
            title="Inventory"
            icon={<PackageSearch className="h-4 w-4" />}
          >
            <p>
              Halaman <Link href="/inventory">/inventory</Link> menampilkan
              detail batch per produk di lokasi terpilih. Indikator status
              kedaluwarsa membantu mengidentifikasi stok rawan:
            </p>
            <ul>
              <li>
                <span className="badge-green">Fresh</span> &gt; 7 hari menuju
                expired.
              </li>
              <li>
                <span className="badge-yellow">≤ 7 hari</span> stok mendekati
                expired, prioritaskan FIFO.
              </li>
              <li>
                <span className="badge-red">≤ 3 hari</span> sangat dekat,
                pertimbangkan retur/complaiment.
              </li>
              <li>
                <span className="badge-red">Kedaluwarsa</span> sudah lewat
                tanggal expired, lakukan transaksi tipe <em>Rusak</em>.
              </li>
            </ul>
          </Section>

          <Section
            id="master"
            title="Master Data"
            icon={<Settings className="h-4 w-4" />}
          >
            <p>
              Modul master data hanya bisa di-edit oleh Super Admin. Subhalaman:
            </p>
            <ul>
              <li>
                <Link href="/master/products">/master/products</Link> — produk
                jadi (SKU, nama, unit). Nonaktifkan produk bila sudah tidak
                dijual.
              </li>
              <li>
                <Link href="/master/categories">/master/categories</Link> —
                pengelompokan produk untuk laporan.
              </li>
              <li>
                <Link href="/master/locations">/master/locations</Link> — Gudang
                Pusat dan daftar outlet.
              </li>
              <li>
                <Link href="/master/users">/master/users</Link> — kelola role
                dan lokasi default tiap pengguna.
              </li>
            </ul>
          </Section>

          <Section
            id="offline"
            title="Mode Offline"
            icon={<CloudOff className="h-4 w-4" />}
          >
            <p>
              Aplikasi tetap berfungsi saat koneksi terputus. Mekanisme:
            </p>
            <ul>
              <li>
                Master data &amp; stok terakhir di-cache di IndexedDB lokal
                (database <code>inventori-pwa</code>).
              </li>
              <li>
                Transaksi yang dibuat saat offline dimasukkan ke antrean dengan
                status <em>Pending Sync</em>.
              </li>
              <li>
                Indikator status di header menunjukkan jumlah antrean yang
                belum terkirim.
              </li>
              <li>
                Begitu device online kembali, antrean dikirim secara sekuensial
                ke server. Karena setiap item membawa <code>client_uuid</code>,
                kirim ulang aman dan tidak akan menggandakan transaksi.
              </li>
              <li>
                Bila server menolak (mis. stok server sudah habis dipakai user
                lain), notifikasi konflik muncul dan item tetap tersimpan di
                panel antrean untuk Anda perbaiki manual.
              </li>
            </ul>
            <Callout
              icon={<Truck className="h-4 w-4" />}
              tone="warning"
              title="Mutasi/Produksi tetap butuh online"
            >
              Hanya transaksi pengeluaran (kasir) yang punya antrean offline.
              Transfer, produksi, dan perubahan master data harus dilakukan
              saat device online.
            </Callout>
          </Section>

          <Section
            id="kode-error"
            title="Kode Error yang Sering Muncul"
            icon={<Info className="h-4 w-4" />}
          >
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Kode</th>
                    <th>Arti</th>
                    <th>Solusi</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>22023</code>
                    </td>
                    <td>Input tidak valid (qty ≤ 0, total override mismatch).</td>
                    <td>Periksa kembali qty dan total alokasi override.</td>
                  </tr>
                  <tr>
                    <td>
                      <code>P0001</code>
                    </td>
                    <td>Stok tidak cukup di server.</td>
                    <td>
                      Refresh halaman; mungkin ada user lain yang sudah memakai
                      stok yang sama. Cek <Link href="/inventory">/inventory</Link>{" "}
                      lalu coba ulang.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>P0002</code>
                    </td>
                    <td>
                      Resource tidak ditemukan / batch bukan milik lokasi atau
                      produk yang dipilih.
                    </td>
                    <td>
                      Pastikan batch yang Anda pilih (manual override) memang
                      ada di lokasi &amp; produk yang sama.
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>P0003</code>
                    </td>
                    <td>Aksi tidak diizinkan untuk status saat ini.</td>
                    <td>
                      Mis. mencoba menerima transfer yang sudah <em>completed</em>.
                      Refresh halaman.
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Section>

          <Section
            id="tips"
            title="Tips & Praktik Baik"
            icon={<Lightbulb className="h-4 w-4" />}
          >
            <ul>
              <li>
                <strong>Andalkan FIFO default.</strong> Override hanya untuk
                kasus khusus.
              </li>
              <li>
                <strong>Periksa indikator expired</strong> di Inventory setiap
                pagi. Batch{" "}
                <span className="badge-yellow">≤ 7 hari</span> sebaiknya
                dipajang/dijual lebih dulu.
              </li>
              <li>
                <strong>Jangan duplikasi koreksi.</strong> Untuk membatalkan
                penjualan, buat transaksi tipe <em>Retur</em>, bukan menghapus.
              </li>
              <li>
                <strong>Gunakan catatan</strong> di transaksi (mis. nomor invoice,
                nama pembeli) supaya audit trail jelas.
              </li>
              <li>
                <strong>Aktifkan PWA install</strong> di browser untuk
                pengalaman seperti aplikasi native saat outlet sibuk.
              </li>
            </ul>
          </Section>

          <Section
            id="faq"
            title="Pertanyaan yang Sering Ditanya"
            icon={<Info className="h-4 w-4" />}
          >
            <h4>Apa beda “Complaiment” dan “Retur”?</h4>
            <p>
              <em>Complaiment</em> = barang dikeluarkan tanpa pengembalian (mis.
              hadiah, sampling). <em>Retur</em> = pengembalian dari pembeli yang
              mengurangi penjualan. Keduanya tetap memotong stok dengan FIFO
              karena barang fisik berkurang dari outlet.
            </p>
            <h4>Mengapa stok saya beda dengan teman?</h4>
            <p>
              Setiap outlet punya stok sendiri. Pemilih lokasi di kanan atas
              menentukan konteks tampilan. Pastikan lokasi default Anda benar
              di <Link href="/profile">Profil</Link>.
            </p>
            <h4>Saya offline lalu menutup tab. Apakah transaksi saya hilang?</h4>
            <p>
              Tidak. Antrean tersimpan di IndexedDB browser, jadi selama Anda
              membuka aplikasi di device yang sama, antrean tetap ada dan akan
              ter-flush saat online.
            </p>
            <h4>Bagaimana mengubah role saya?</h4>
            <p>
              Hanya Super Admin yang bisa mengubah role. Hubungi admin Anda dan
              minta perubahan dilakukan via{" "}
              <Link href="/master/users">/master/users</Link>.
            </p>
          </Section>
        </article>

        <aside className="hidden xl:block">
          <GuideToc sections={SECTIONS} />
        </aside>
      </div>
    </div>
  );
}

function Section({
  id,
  title,
  icon,
  children,
}: {
  id: string;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="card mb-6 scroll-mt-24">
      <div className="card-header">
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-brand-50 p-1.5 text-brand-700">
            {icon}
          </span>
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        </div>
        <a
          href={`#${id}`}
          className="text-xs text-slate-400 hover:text-slate-600"
          aria-label={`Tautan permanen ke ${title}`}
        >
          #
        </a>
      </div>
      <div className="card-body space-y-3 text-sm leading-relaxed text-slate-700 [&>h4]:mt-4 [&>h4]:text-sm [&>h4]:font-semibold [&>h4]:text-slate-900 [&>ol]:list-decimal [&>ol]:space-y-1 [&>ol]:pl-5 [&>ul]:list-disc [&>ul]:space-y-1 [&>ul]:pl-5 [&_a]:text-brand-700 [&_a]:underline [&_a:hover]:text-brand-900 [&_code]:rounded [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-xs [&_code]:text-slate-800 [&_strong]:font-semibold [&_strong]:text-slate-900">
        {children}
      </div>
    </section>
  );
}

function Callout({
  icon,
  title,
  tone = "info",
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone?: "info" | "warning";
  children: React.ReactNode;
}) {
  const styles =
    tone === "warning"
      ? "border-amber-200 bg-amber-50 text-amber-900"
      : "border-brand-100 bg-brand-50 text-brand-900";
  return (
    <div className={`mt-4 rounded-lg border px-4 py-3 text-sm ${styles}`}>
      <div className="mb-1 flex items-center gap-2 font-semibold">
        {icon}
        {title}
      </div>
      <div className="text-sm">{children}</div>
    </div>
  );
}
