import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

const rootDir = path.resolve(import.meta.dirname, "..");
const env = process.env.NODE_ENV === "prod" ? "prod" : "dev";
const envFilePath = path.join(rootDir, `.env.${env}`);
dotenv.config({ path: envFilePath, override: true });

const host = process.env.DB_HOST ?? process.env.HOST;
const user = process.env.DB_USER ?? process.env.USER;
const password = process.env.DB_PASSWORD ?? process.env.PASSWORD;
const database = process.env.DB_NAME ?? process.env.DATABASE;

if (!host || !user || !password || !database) {
  console.error("Missing database connection variables. Expected DB_HOST/DB_USER/DB_PASSWORD/DB_NAME or HOST/USER/PASSWORD/DATABASE.");
  process.exit(1);
}

const candidateSchemaPaths = [
  path.join(rootDir, "sql", "tables.sql"),
  path.join(rootDir, "dist", "sql", "tables.sql"),
];
const schemaPath = candidateSchemaPaths.find(candidatePath => fs.existsSync(candidatePath));

if (!schemaPath) {
  console.error(`Schema file not found. Checked: ${candidateSchemaPaths.join(", ")}`);
  process.exit(1);
}

const rawSchema = fs.readFileSync(schemaPath, "utf-8");
const sanitizedSchema = rawSchema
  .split(/\r?\n/)
  .filter(line => {
    const normalizedLine = line.trim().toUpperCase();
    return !normalizedLine.startsWith("DROP DATABASE")
      && !normalizedLine.startsWith("CREATE DATABASE")
      && !normalizedLine.startsWith("USE TEST_BALKON")
      && !normalizedLine.startsWith("#");
  })
  .join("\n");

const statements = sanitizedSchema
  .split(/;\s*(?:\r?\n|$)/)
  .map(statement => statement.trim())
  .filter(Boolean);

const streamersStatementIndex = statements.findIndex(statement => /^CREATE TABLE streamers\s*\(/i.test(statement));
const guildStreamersStatementIndex = statements.findIndex(statement => /^CREATE TABLE guild_streamers\s*\(/i.test(statement));

if (streamersStatementIndex !== -1 && guildStreamersStatementIndex !== -1 && streamersStatementIndex > guildStreamersStatementIndex) {
  const [streamersStatement] = statements.splice(streamersStatementIndex, 1);
  statements.splice(guildStreamersStatementIndex, 0, streamersStatement);
}

const connection = await mysql.createConnection({
  host,
  user,
  password,
  database,
});

try {
  for (const statement of statements) {
    try {
      await connection.query(statement);
    } catch (error) {
      if (isIgnorableSchemaError(error)) {
        continue;
      }

      throw error;
    }
  }

  console.log(`Schema initialized for database '${database}' using ${schemaPath}`);
} finally {
  await connection.end();
}

function isIgnorableSchemaError(error) {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }

  return [
    "ER_TABLE_EXISTS_ERROR",
    "ER_DUP_KEYNAME",
    "ER_DUP_ENTRY",
  ].includes(String(error.code));
}