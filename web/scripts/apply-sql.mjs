// Aplikasikan SQL ke Postgres / Supabase tanpa Supabase CLI.
//
// Set DATABASE_URL ke connection string Postgres project Supabase:
//   Dashboard → Project Settings → Database → Connection string → "URI"
//   (pilih varian "Session" untuk koneksi langsung dengan password project).
//
// Pemakaian (PowerShell):
//   $env:DATABASE_URL = "postgresql://postgres:PWD@db.<ref>.supabase.co:5432/postgres"
//   node scripts/apply-sql.mjs                          # jalankan semua migrasi 01..06 berurutan
//   node scripts/apply-sql.mjs --filter 06_seed         # hanya migrasi yang nama-nya match
//   node scripts/apply-sql.mjs --file ../supabase/setup_supabase.sql
//   node scripts/apply-sql.mjs --file ../supabase/setup_first_user.sql
//
// Idempotent: file migrasi & setup pakai IF NOT EXISTS / ON CONFLICT,
// jadi boleh dijalankan ulang.

import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(here, "..");
const repoRoot = resolve(webRoot, "..");
const migrationsDir = join(repoRoot, "supabase", "migrations");

const args = process.argv.slice(2);
let mode = "migrations";
let filter = "";
let explicitFile = "";

for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === "--file" || a === "-f") {
    mode = "file";
    explicitFile = args[++i];
  } else if (a === "--filter") {
    filter = args[++i];
  } else if (!a.startsWith("--") && !filter && mode === "migrations") {
    // legacy: `node apply-sql.mjs 06_seed`
    filter = a;
  }
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
  console.error(
    "DATABASE_URL belum di-set. Contoh:\n" +
      "  $env:DATABASE_URL = \"postgresql://postgres:PWD@db.<ref>.supabase.co:5432/postgres\""
  );
  process.exit(1);
}

let pg;
try {
  pg = await import("pg");
} catch {
  console.error('Modul "pg" belum terpasang. Jalankan dulu: npm install pg');
  process.exit(1);
}
const { Client } = pg.default ?? pg;

let files;
if (mode === "file") {
  if (!explicitFile) {
    console.error("--file butuh path argumen.");
    process.exit(1);
  }
  files = [resolve(webRoot, explicitFile)];
} else {
  const all = await readdir(migrationsDir);
  files = all
    .filter((f) => f.endsWith(".sql"))
    .filter((f) => (filter ? f.includes(filter) : true))
    .sort()
    .map((f) => join(migrationsDir, f));
}

if (files.length === 0) {
  console.error("Tidak ada file SQL yang cocok.");
  process.exit(1);
}

const client = new Client({
  connectionString: dbUrl,
  ssl: dbUrl.includes("supabase.co") ? { rejectUnauthorized: false } : undefined,
});

await client.connect();
try {
  for (const file of files) {
    const sql = await readFile(file, "utf8");
    const label = file.replace(repoRoot + "\\", "").replace(repoRoot + "/", "");
    process.stdout.write(`==> ${label} ... `);
    await client.query(sql);
    process.stdout.write("OK\n");
  }
  console.log("Selesai.");
} catch (err) {
  console.error("\nGagal:", err.message);
  if (err.position) console.error("  position:", err.position);
  if (err.detail) console.error("  detail:", err.detail);
  process.exitCode = 1;
} finally {
  await client.end();
}
