import fs from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

const rootDir = path.resolve(import.meta.dirname, "..");
const envFileName = process.env.NODE_ENV === "prod" ? ".env.prod" : ".env.dev";
const envFilePath = path.join(rootDir, envFileName);

dotenv.config({ path: envFilePath, override: true, quiet: true });

const host = process.env.DB_HOST ?? process.env.HOST;
const port = Number(process.env.DB_PORT ?? 3306);
const user = process.env.DB_USER ?? process.env.USER;
const password = process.env.DB_PASSWORD ?? process.env.PASSWORD ?? "";
const database = process.env.DB_NAME ?? process.env.DATABASE;

if (!host || !user || !database || Number.isNaN(port)) {
  console.error("Missing database connection variables. Expected DB_HOST/DB_USER/DB_PASSWORD/DB_NAME, with DB_PORT optional and defaulting to 3306.");
  process.exit(1);
}

const migrationsDir = path.join(rootDir, "sql", "migrations");

let connection;

try {
  connection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
    multipleStatements: true,
  });

  await ensureSchemaMigrationsTable(connection);

  const migrationFiles = await listMigrationFiles(migrationsDir);
  const appliedMigrations = await getAppliedMigrationNames(connection);

  if (migrationFiles.length === 0) {
    console.log(`No migration files found in ${migrationsDir}`);
    process.exit(0);
  }

  for (const migrationFile of migrationFiles) {
    if (appliedMigrations.has(migrationFile)) {
      console.log(`SKIP ${migrationFile}`);
      continue;
    }

    const migrationPath = path.join(migrationsDir, migrationFile);
    const sql = await fs.readFile(migrationPath, "utf8");
    const hasExecutableSql = containsExecutableSql(sql);

    console.log(`APPLY ${migrationFile}`);

    try {
      await connection.beginTransaction();

      if (hasExecutableSql) {
        await connection.query(sql);
      }

      await connection.execute(
        "INSERT INTO schema_migrations (migration_name) VALUES (?)",
        [migrationFile],
      );

      await connection.commit();
      console.log(`DONE ${migrationFile}`);
    } catch (error) {
      await rollbackQuietly(connection);
      console.error(`FAILED ${migrationFile}`);
      console.error("MySQL may partially apply DDL statements before a rollback completes. Review the database state before retrying.");
      throw error;
    }
  }

  console.log("Migration run complete.");
} catch (error) {
  if (error && typeof error === "object") {
    const runtimeError = error;
    const code = "code" in runtimeError ? String(runtimeError.code) : "unknown";
    const message = "message" in runtimeError && runtimeError.message ? String(runtimeError.message) : "No error message returned.";
    console.error(`Migration runner failed (${code}): ${message}`);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
} finally {
  if (connection) {
    await connection.end();
  }
}

async function ensureSchemaMigrationsTable(connection) {
  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INT AUTO_INCREMENT PRIMARY KEY,
      migration_name VARCHAR(255) NOT NULL UNIQUE,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function getAppliedMigrationNames(connection) {
  const [rows] = await connection.query(
    "SELECT migration_name FROM schema_migrations ORDER BY id ASC",
  );

  return new Set(rows.map(row => row.migration_name));
}

async function listMigrationFiles(migrationsPath) {
  const entries = await fs.readdir(migrationsPath, { withFileTypes: true });

  return entries
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(name => name !== "README.md")
    .filter(name => !name.startsWith("000_"))
    .filter(name => /^[0-9]{3}_.+\.sql$/.test(name))
    .sort((left, right) => left.localeCompare(right));
}

function containsExecutableSql(sql) {
  const withoutBlockComments = sql.replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutLineComments = withoutBlockComments.replace(/^\s*--.*$/gm, "");

  return withoutLineComments.trim().length > 0;
}

async function rollbackQuietly(connection) {
  try {
    await connection.rollback();
  } catch {
    // Ignore rollback failures so the original migration error stays visible.
  }
}