import { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../db.js";
import { settingsService } from "./SettingsService.js";
import { DiscordMetadataService } from "./DiscordMetadataService.js";

const DEFAULT_MEMBER_LOCALE = "en";
const DEFAULT_LDM_BALANCE = 0;
const DEFAULT_MEMBER_CREATED_SOURCE = "unknown";
const DEFAULT_MEMBER_PROFILE_STATUS = "minimal";

type MemberIdRow = RowDataPacket & {
  id: number | string;
};

type MemberProfileCacheRow = RowDataPacket & {
  id: number | string;
  ds_member_id: string;
  discord_username: string | null;
  discord_global_name: string | null;
  discord_avatar: string | null;
  discord_avatar_url: string | null;
  discord_profile_updated_at: Date | null;
  locale: string | null;
};

export type MemberCreatedSource =
  | "oauth"
  | "discord_interaction"
  | "discord_message"
  | "system"
  | "seed"
  | "unknown";

export type EnsureMemberByDiscordIdOptions = {
  startBalance?: number;
  locale?: string;
  createdSource?: MemberCreatedSource;
};

export type EnsureMemberFromDiscordProfileInput = {
  discordId: string;
  username?: string | null;
  globalName?: string | null;
  avatar?: string | null;
  avatarUrl?: string | null;
  locale?: string | null;
  createdSource?: MemberCreatedSource;
};

export type MemberProfileCache = {
  id: number;
  discordId: string;
  username: string | null;
  globalName: string | null;
  avatar: string | null;
  avatarUrl: string | null;
  profileUpdatedAt: Date | null;
  locale: string | null;
};

function normalizeDiscordId(discordId: string): string {
  const normalized = discordId.trim();
  if (!normalized.length) {
    throw new Error("discordId is required.");
  }

  return normalized;
}

function normalizeOptionalLocale(locale: string | null | undefined): string | undefined {
  if (locale === null || locale === undefined) {
    return undefined;
  }

  const normalized = locale.trim();
  return normalized.length ? normalized : undefined;
}

function normalizeMemberCreatedSource(createdSource: MemberCreatedSource | undefined): MemberCreatedSource {
  // Existing callers do not pass a creation source yet, so newly inserted rows
  // must fall back to an explicit runtime value instead of legacy.
  return createdSource ?? DEFAULT_MEMBER_CREATED_SOURCE;
}

function isDuplicateEntryError(error: unknown): error is { code: string } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY";
}

export class MemberService {
  private static instance: MemberService;

  static getInstance(): MemberService {
    if (!MemberService.instance) {
      MemberService.instance = new MemberService();
    }

    return MemberService.instance;
  }

  async getMemberIdByDiscordId(discordId: string): Promise<number | null> {
    const normalizedDiscordId = normalizeDiscordId(discordId);
    const [rows] = await pool.query<MemberIdRow[]>(
      `SELECT id
       FROM members
       WHERE ds_member_id = ?
       LIMIT 1`,
      [normalizedDiscordId],
    );

    if (!rows.length) {
      return null;
    }

    return Number(rows[0].id);
  }

  async getMemberProfileCache(discordId: string): Promise<MemberProfileCache | null> {
    const normalizedDiscordId = normalizeDiscordId(discordId);
    const [rows] = await pool.query<MemberProfileCacheRow[]>(
      `SELECT
          id,
          ds_member_id,
          discord_username,
          discord_global_name,
          discord_avatar,
          discord_avatar_url,
          discord_profile_updated_at,
          locale
       FROM members
       WHERE ds_member_id = ?
       LIMIT 1`,
      [normalizedDiscordId],
    );

    if (!rows.length) {
      return null;
    }

    const row = rows[0];
    return {
      id: Number(row.id),
      discordId: String(row.ds_member_id),
      username: row.discord_username ?? null,
      globalName: row.discord_global_name ?? null,
      avatar: row.discord_avatar ?? null,
      avatarUrl: row.discord_avatar_url ?? null,
      profileUpdatedAt: row.discord_profile_updated_at ?? null,
      locale: row.locale ?? null,
    };
  }

  async ensureMemberByDiscordId(discordId: string, options?: EnsureMemberByDiscordIdOptions): Promise<number> {
    const normalizedDiscordId = normalizeDiscordId(discordId);
    const existingMemberId = await this.getMemberIdByDiscordId(normalizedDiscordId);
    if (existingMemberId !== null) {
      return existingMemberId;
    }

    const normalizedLocale = normalizeOptionalLocale(options?.locale) ?? DEFAULT_MEMBER_LOCALE;
    const createdSource = normalizeMemberCreatedSource(options?.createdSource);
    const startBalance = Number.isFinite(options?.startBalance)
      ? Number(options?.startBalance)
      : Number((await settingsService.ensureGeneralSettings()).start_balance ?? 0);

    try {
      const [result] = await pool.query<ResultSetHeader>(
        `INSERT INTO members (
           ds_member_id,
           created_at,
           updated_at,
           created_source,
           discord_profile_status,
           balance,
           ldm_balance,
           locale
         )
         VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ?, ?, ?, ?, ?)`,
        [
          normalizedDiscordId,
          createdSource,
          DEFAULT_MEMBER_PROFILE_STATUS,
          startBalance,
          DEFAULT_LDM_BALANCE,
          normalizedLocale,
        ],
      );

      if (result.insertId) {
        return Number(result.insertId);
      }
    } catch (error) {
      if (!isDuplicateEntryError(error)) {
        throw error;
      }
    }

    const memberId = await this.getMemberIdByDiscordId(normalizedDiscordId);
    if (memberId === null) {
      throw new Error("Unable to resolve member.");
    }

    return memberId;
  }

  async ensureMemberFromDiscordProfile(input: EnsureMemberFromDiscordProfileInput): Promise<number> {
    const normalizedDiscordId = normalizeDiscordId(input.discordId);
    const memberId = await this.ensureMemberByDiscordId(normalizedDiscordId, {
      locale: normalizeOptionalLocale(input.locale) ?? undefined,
      createdSource: input.createdSource,
    });

    await DiscordMetadataService.getInstance().upsertMemberDiscordProfile({
      discordId: normalizedDiscordId,
      username: input.username ?? null,
      globalName: input.globalName ?? null,
      avatar: input.avatar ?? null,
      avatarUrl: input.avatarUrl ?? null,
    });

    const locale = normalizeOptionalLocale(input.locale);
    if (locale) {
      await pool.query(
        `UPDATE members
         SET locale = ?
         WHERE id = ?`,
        [locale, memberId],
      );
    }

    return memberId;
  }
}

export const memberService = MemberService.getInstance();