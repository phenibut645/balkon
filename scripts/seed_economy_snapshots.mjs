import path from "path";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

const rootDir = path.resolve(import.meta.dirname, "..");
const nodeEnv = String(process.env.NODE_ENV || "dev").toLowerCase();

if (nodeEnv === "prod" || nodeEnv === "production") {
  console.error("Refusing to run economy snapshot seed in production mode.");
  process.exit(1);
}

const envFilePath = path.join(rootDir, ".env.dev");
dotenv.config({ path: envFilePath, override: true, quiet: true });

const host = process.env.DB_HOST ?? process.env.HOST;
const port = Number(process.env.DB_PORT ?? 3306);
const user = process.env.DB_USER ?? process.env.USER;
const password = process.env.DB_PASSWORD ?? process.env.PASSWORD ?? "";
const database = process.env.DB_NAME ?? process.env.DATABASE;

if (!host || !user || !database || Number.isNaN(port)) {
  console.error("Missing database connection variables. Expected DB_HOST/DB_USER/DB_PASSWORD/DB_NAME with optional DB_PORT.");
  process.exit(1);
}

const odmSeries = [
  780,
  820,
  790,
  860,
  910,
  940,
  925,
  590,
  1040,
  1110,
  1080,
  1160,
  1210,
  1195,
  1280,
];

const ldmSeries = [
  52,
  56,
  54,
  60,
  64,
  68,
  66,
  58,
  74,
  79,
  77,
  83,
  89,
  87,
  93,
];

const membersSeries = [
  5,
  5,
  6,
  6,
  7,
  7,
  7,
  8,
  8,
  9,
  9,
  10,
  11,
  11,
  12,
];

function formatDateForSql(date) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildSeedRows(days) {
  const now = new Date();
  const utcToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const rows = [];

  for (let i = 0; i < days; i += 1) {
    const snapshotDate = new Date(utcToday);
    snapshotDate.setUTCDate(utcToday.getUTCDate() - (days - 1 - i));

    rows.push({
      snapshotDate: formatDateForSql(snapshotDate),
      totalOdm: odmSeries[i],
      totalLdm: ldmSeries[i],
      membersCount: membersSeries[i],
    });
  }

  return rows;
}

const clearRequested = process.argv.includes("--clear");
const rows = buildSeedRows(15);
const firstDate = rows[0].snapshotDate;
const lastDate = rows[rows.length - 1].snapshotDate;

const connection = await mysql.createConnection({
  host,
  port,
  user,
  password,
  database,
});

try {
  if (clearRequested) {
    await connection.query(
      `DELETE FROM economy_daily_snapshots
       WHERE snapshot_date BETWEEN ? AND ?`,
      [firstDate, lastDate],
    );
    console.log(`Cleared existing economy snapshots between ${firstDate} and ${lastDate}`);
  }

  for (const row of rows) {
    await connection.query(
      `INSERT INTO economy_daily_snapshots (
         snapshot_date,
         total_odm,
         total_ldm,
         members_count
       ) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         total_odm = VALUES(total_odm),
         total_ldm = VALUES(total_ldm),
         members_count = VALUES(members_count),
         updated_at = CURRENT_TIMESTAMP`,
      [row.snapshotDate, row.totalOdm, row.totalLdm, row.membersCount],
    );
  }

  console.log(`Seeded ${rows.length} economy snapshots.`);
  for (const row of rows) {
    console.log(`${row.snapshotDate} odm=${row.totalOdm} ldm=${row.totalLdm} members=${row.membersCount}`);
  }
} finally {
  await connection.end();
}
