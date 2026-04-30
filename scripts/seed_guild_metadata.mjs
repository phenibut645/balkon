import dotenv from "dotenv";
import mysql from "mysql2/promise";
import path from "path";

const rootDir = path.resolve(import.meta.dirname, "..");
const envFileName = process.env.NODE_ENV === "prod" ? ".env.prod" : ".env.dev";
const envFilePath = path.join(rootDir, envFileName);

dotenv.config({ path: envFilePath, override: true, quiet: true });

if (process.env.NODE_ENV === "prod" || process.env.NODE_ENV === "production") {
  console.error("Refusing to run seed_guild_metadata.mjs in production.");
  process.exit(1);
}

const host = process.env.DB_HOST ?? process.env.HOST;
const port = Number(process.env.DB_PORT ?? 3306);
const user = process.env.DB_USER ?? process.env.USER;
const password = process.env.DB_PASSWORD ?? process.env.PASSWORD ?? "";
const database = process.env.DB_NAME ?? process.env.DATABASE;

if (!host || !user || !database || Number.isNaN(port)) {
  console.error("Missing database connection variables.");
  process.exit(1);
}

// Add local development overrides here when needed.
const LOCAL_GUILD_NAMES = {
  // "1254753632533086270": "VNMCR",
};

const connection = await mysql.createConnection({
  host,
  port,
  user,
  password,
  database,
});

try {
  const [rows] = await connection.query("SELECT ds_guild_id, display_name FROM guilds ORDER BY id ASC");

  for (const row of rows) {
    const guildId = String(row.ds_guild_id);
    const currentDisplayName = row.display_name ? String(row.display_name).trim() : "";
    if (currentDisplayName.length > 0) {
      continue;
    }

    const mapped = Object.prototype.hasOwnProperty.call(LOCAL_GUILD_NAMES, guildId)
      ? LOCAL_GUILD_NAMES[guildId]
      : null;

    const displayName = mapped && String(mapped).trim().length > 0
      ? String(mapped).trim()
      : `Guild ${guildId}`;

    await connection.query(
      "UPDATE guilds SET display_name = ? WHERE ds_guild_id = ?",
      [displayName, guildId],
    );

    console.log(`Updated guild ${guildId} -> ${displayName}`);
  }

  console.log("Guild metadata seed complete.");
} finally {
  await connection.end();
}
