import path from "path";
import dotenv from "dotenv";
import mysql from "mysql2/promise";

const rootDir = path.resolve(import.meta.dirname, "..");
const envFileName = process.env.NODE_ENV === "prod" ? ".env.prod" : ".env.dev";
const envFilePath = path.join(rootDir, envFileName);

dotenv.config({ path: envFilePath, override: true, quiet: true });

const discordId = String(process.argv[2] ?? "").trim();

if (!discordId) {
  console.error("Usage: node scripts/check_member_profile.mjs <discord_id>");
  process.exit(1);
}

const host = process.env.DB_HOST ?? process.env.HOST;
const port = Number(process.env.DB_PORT ?? 3306);
const user = process.env.DB_USER ?? process.env.USER;
const password = process.env.DB_PASSWORD ?? process.env.PASSWORD ?? "";
const database = process.env.DB_NAME ?? process.env.DATABASE;

if (!host || !user || !database || Number.isNaN(port)) {
  console.error("Missing database connection variables. Expected DB_HOST/DB_USER/DB_PASSWORD/DB_NAME, with DB_PORT optional and defaulting to 3306.");
  process.exit(1);
}

let connection;

try {
  connection = await mysql.createConnection({
    host,
    port,
    user,
    password,
    database,
  });

  const [memberRows] = await connection.query(
    `SELECT
        id,
        ds_member_id,
        discord_username,
        discord_global_name,
        discord_avatar,
        discord_avatar_url,
        discord_profile_updated_at,
        balance,
        ldm_balance,
        locale,
        home_guild_id,
        public_description
     FROM members
     WHERE ds_member_id = ?
     ORDER BY id DESC`,
    [discordId],
  );

  const [sessionRows] = await connection.query(
    `SELECT
        id,
        discord_id,
        username,
        global_name,
        avatar,
        scopes,
        created_at,
        updated_at,
        expires_at,
        revoked_at
     FROM api_sessions
     WHERE discord_id = ?
     ORDER BY id DESC
     LIMIT 5`,
    [discordId],
  );

  const member = memberRows[0] ?? null;
  const missingFields = member
    ? [
        ["discord_username", member.discord_username],
        ["discord_global_name", member.discord_global_name],
        ["discord_avatar_url", member.discord_avatar_url],
        ["discord_profile_updated_at", member.discord_profile_updated_at],
      ].filter(([, value]) => value === null || value === undefined || value === "").map(([field]) => field)
    : ["member_row_missing"];

  const hasRecentSession = sessionRows.length > 0;
  let suggestedAction = "No action needed.";

  if (!member) {
    suggestedAction = hasRecentSession
      ? "OAuth session exists. Trigger backend member/profile sync on next login or run a targeted profile sync path."
      : "No member row or OAuth session found. Trigger a login or a Discord user interaction to create the member record.";
  } else if (missingFields.length > 0) {
    suggestedAction = hasRecentSession
      ? "Profile cache is incomplete. Re-run OAuth login or a Discord event path that calls MemberService.ensureMemberFromDiscordProfile."
      : "Profile cache is incomplete and no recent OAuth session exists. Trigger a Discord interaction/message or a fresh OAuth login.";
  }

  console.log(`Discord ID: ${discordId}`);
  console.log("\nMember row:");
  console.log(member ? JSON.stringify(member, null, 2) : "No matching members row.");

  console.log("\nLatest api_sessions rows:");
  console.log(sessionRows.length ? JSON.stringify(sessionRows, null, 2) : "No matching api_sessions rows.");

  console.log("\nProfile cache check:");
  console.log(JSON.stringify({
    hasMemberRow: Boolean(member),
    hasRecentSession,
    missingFields,
    suggestedAction,
  }, null, 2));
} catch (error) {
  if (error && typeof error === "object") {
    const runtimeError = error;
    const code = "code" in runtimeError ? String(runtimeError.code) : "unknown";
    const message = "message" in runtimeError && runtimeError.message ? String(runtimeError.message) : "No error message returned.";
    console.error(`Member profile diagnostic failed (${code}): ${message}`);
  } else {
    console.error(error);
  }

  process.exitCode = 1;
} finally {
  if (connection) {
    await connection.end();
  }
}