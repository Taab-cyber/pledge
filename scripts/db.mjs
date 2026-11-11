// Database helper using a direct Postgres connection (SUPABASE_DB_URL in .env.local).
//   node scripts/db.mjs migrate        apply new files in supabase/migrations (in order, each in a transaction)
//   node scripts/db.mjs status         list applied / pending migrations
//   node scripts/db.mjs sql <file>     run a SQL file and print the rows it returns
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

try {
  process.loadEnvFile(".env.local");
} catch {
  // env may come from the shell instead
}
const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Missing SUPABASE_DB_URL in .env.local (Supabase → Connect → Session pooler URI).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
const DIR = "supabase/migrations";
const [cmd, arg] = process.argv.slice(2);

async function applied() {
  await client.query(`create schema if not exists private;
    create table if not exists private.schema_migrations (name text primary key, applied_at timestamptz not null default now());`);
  const { rows } = await client.query("select name from private.schema_migrations");
  return new Set(rows.map((r) => r.name));
}

const files = () =>
  readdirSync(DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

await client.connect();
try {
  if (cmd === "migrate" || cmd === "status") {
    const done = await applied();
    const pending = files().filter((f) => !done.has(f));
    if (cmd === "status") {
      for (const f of files()) console.log(`${done.has(f) ? "applied" : "PENDING"}  ${f}`);
    } else if (pending.length === 0) {
      console.log("Database is up to date.");
    } else {
      for (const f of pending) {
        process.stdout.write(`applying ${f} … `);
        await client.query("begin");
        try {
          await client.query(readFileSync(join(DIR, f), "utf8"));
          await client.query(
            "insert into private.schema_migrations (name) values ($1) on conflict do nothing",
            [f],
          );
          await client.query("commit");
          console.log("ok");
        } catch (err) {
          await client.query("rollback");
          console.log("FAILED");
          throw err;
        }
      }
    }
  } else if (cmd === "sql" && arg) {
    const res = await client.query(readFileSync(arg, "utf8"));
    const results = Array.isArray(res) ? res : [res];
    for (const r of results) if (r.rows?.length) console.table(r.rows);
  } else {
    console.log("Usage: node scripts/db.mjs migrate | status | sql <file>");
    process.exitCode = 1;
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await client.end();
}
