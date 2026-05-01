import dotenv from "dotenv";
import mysql from "mysql2/promise";
import path from "path";

const rootDir = path.resolve(import.meta.dirname, "..");
const envFileName = process.env.NODE_ENV === "prod" ? ".env.prod" : ".env.dev";
const envFilePath = path.join(rootDir, envFileName);
const shouldApply = process.argv.includes("--apply");

dotenv.config({ path: envFilePath, override: true, quiet: true });

const host = process.env.DB_HOST ?? process.env.HOST;
const port = Number(process.env.DB_PORT ?? 3306);
const user = process.env.DB_USER ?? process.env.USER;
const password = process.env.DB_PASSWORD ?? process.env.PASSWORD ?? "";
const database = process.env.DB_NAME ?? process.env.DATABASE;

if (!host || !user || !database || Number.isNaN(port)) {
  console.error("Missing database connection variables.");
  process.exit(1);
}

const connection = await mysql.createConnection({
  host,
  port,
  user,
  password,
  database,
});

try {
  const [rows] = await connection.query(
    `SELECT id, start_balance, default_earning_multiply
     FROM general_settings
     ORDER BY id ASC`,
  );

  console.log(`Mode: ${shouldApply ? "apply" : "dry-run"}`);
  console.log("Current general_settings rows:");
  console.table(rows);

  if (!rows.length) {
    console.log("general_settings is empty.");

    if (shouldApply) {
      await connection.query(
        `INSERT INTO general_settings (start_balance, default_earning_multiply)
         VALUES (?, ?)`,
        [20, 1],
      );
      console.log("Created default general_settings row with start_balance=20 and default_earning_multiply=1.");
    } else {
      console.log("Dry-run only. Re-run with --apply to create the default row.");
    }

    process.exit(0);
  }

  const duplicates = rows.slice(1);
  console.log("Duplicate rows that would be deleted:");
  console.table(duplicates);

  if (!shouldApply) {
    console.log("Dry-run complete. Re-run with --apply to delete duplicate rows.");
    process.exit(0);
  }

  if (!duplicates.length) {
    console.log("No duplicate general_settings rows found.");
    process.exit(0);
  }

  const idsToDelete = duplicates.map(row => row.id);
  const placeholders = idsToDelete.map(() => "?").join(", ");
  await connection.query(
    `DELETE FROM general_settings
     WHERE id IN (${placeholders})`,
    idsToDelete,
  );

  console.log(`Deleted ${idsToDelete.length} duplicate general_settings rows. Kept row id=${rows[0].id}.`);
} finally {
  await connection.end();
}
