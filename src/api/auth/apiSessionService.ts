import { createHash, randomBytes } from "node:crypto";
import { RowDataPacket } from "mysql2";
import pool from "../../db.js";
import { ApiAuthUser } from "../types/auth.js";
import { isBotAdmin } from "../../core/BotAdmin.js";

export interface DiscordTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
}

export interface DiscordUserResponse {
  id: string;
  username: string;
  global_name: string | null;
  avatar: string | null;
}

export interface DiscordGuildResponse {
  id: string;
  name: string;
  icon: string | null;
  owner: boolean;
  permissions: string;
  features: string[];
}

interface ApiSessionRow extends RowDataPacket {
  id: number;
  session_token_hash: string;
  discord_id: string;
  username: string | null;
  global_name: string | null;
  avatar: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: Date | null;
  scopes: string;
  user_json: string | null;
  guilds_json: string | null;
  created_at: Date;
  updated_at: Date;
  expires_at: Date;
  revoked_at: Date | null;
}

export interface ApiSessionRecord {
  id: number;
  sessionTokenHash: string;
  discordId: string;
  username: string | null;
  globalName: string | null;
  avatar: string | null;
  accessToken: string;
  refreshToken: string | null;
  tokenExpiresAt: Date | null;
  scopes: string;
  userJson: string | null;
  guildsJson: string | null;
  createdAt: Date;
  updatedAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
}

export interface CreateApiSessionInput {
  discordUser: DiscordUserResponse;
  discordGuilds: DiscordGuildResponse[];
  token: DiscordTokenResponse;
}

export interface SessionCookieConfig {
  cookieName: string;
  ttlDays: number;
  isProduction: boolean;
}

function parseJsonObject<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function hashSessionToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

function getTtlDays(): number {
  const parsed = Number(process.env.API_SESSION_TTL_DAYS ?? 14);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 14;
  }

  return Math.floor(parsed);
}

export function getSessionCookieConfig(): SessionCookieConfig {
  return {
    cookieName: process.env.API_SESSION_COOKIE_NAME?.trim() || "balkon_session",
    ttlDays: getTtlDays(),
    isProduction: process.env.NODE_ENV === "prod",
  };
}

export class ApiSessionService {
  createStateToken(): string {
    return randomBytes(32).toString("hex");
  }

  createRawSessionToken(): string {
    return randomBytes(48).toString("hex");
  }

  async createSession(input: CreateApiSessionInput): Promise<{ rawSessionToken: string; expiresAt: Date }> {
    const rawSessionToken = this.createRawSessionToken();
    const sessionTokenHash = hashSessionToken(rawSessionToken);
    const now = Date.now();
    const ttlDays = getSessionCookieConfig().ttlDays;
    const expiresAt = new Date(now + ttlDays * 24 * 60 * 60 * 1000);

    const tokenExpiresAt = Number.isFinite(input.token.expires_in)
      ? new Date(now + input.token.expires_in * 1000)
      : null;

    await pool.query(
      `INSERT INTO api_sessions (
        session_token_hash,
        discord_id,
        username,
        global_name,
        avatar,
        access_token,
        refresh_token,
        token_expires_at,
        scopes,
        user_json,
        guilds_json,
        expires_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        sessionTokenHash,
        input.discordUser.id,
        input.discordUser.username,
        input.discordUser.global_name,
        input.discordUser.avatar,
        input.token.access_token,
        input.token.refresh_token ?? null,
        tokenExpiresAt,
        input.token.scope,
        JSON.stringify(input.discordUser),
        JSON.stringify(input.discordGuilds),
        expiresAt,
      ],
    );

    return { rawSessionToken, expiresAt };
  }

  async resolveAuthUserByRawSessionToken(rawSessionToken: string): Promise<ApiAuthUser | null> {
    const tokenHash = hashSessionToken(rawSessionToken);
    const [rows] = await pool.query<ApiSessionRow[]>(
      `SELECT discord_id
       FROM api_sessions
       WHERE session_token_hash = ?
         AND revoked_at IS NULL
         AND expires_at > UTC_TIMESTAMP()
       LIMIT 1`,
      [tokenHash],
    );

    if (!rows.length) {
      return null;
    }

    const discordId = String(rows[0].discord_id);
    const roles: ApiAuthUser["roles"] = [];
    if (isBotAdmin(discordId)) {
      roles.push("bot_admin");
    }

    return {
      discordId,
      roles,
    };
  }

  async revokeSessionByRawToken(rawSessionToken: string): Promise<void> {
    const tokenHash = hashSessionToken(rawSessionToken);
    await pool.query(
      `UPDATE api_sessions
       SET revoked_at = IFNULL(revoked_at, UTC_TIMESTAMP())
       WHERE session_token_hash = ?`,
      [tokenHash],
    );
  }

  async getSessionSnapshotByRawToken(rawSessionToken: string): Promise<{ user: DiscordUserResponse | null; guilds: DiscordGuildResponse[] }> {
    const tokenHash = hashSessionToken(rawSessionToken);
    const [rows] = await pool.query<ApiSessionRow[]>(
      `SELECT user_json, guilds_json
       FROM api_sessions
       WHERE session_token_hash = ?
         AND revoked_at IS NULL
         AND expires_at > UTC_TIMESTAMP()
       LIMIT 1`,
      [tokenHash],
    );

    if (!rows.length) {
      return { user: null, guilds: [] };
    }

    const user = parseJsonObject<DiscordUserResponse>(rows[0].user_json);
    const guilds = parseJsonObject<DiscordGuildResponse[]>(rows[0].guilds_json) ?? [];
    return { user, guilds };
  }
}

export const apiSessionService = new ApiSessionService();
