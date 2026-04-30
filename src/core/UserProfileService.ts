import { RowDataPacket } from "mysql2";
import pool from "../db.js";

export type AvailableGuild = {
  guildId: string;
  name: string;
  iconUrl?: string | null;
};

export type UserPublicProfile = {
  discordId: string;
  username: string | null;
  globalName: string | null;
  avatarUrl: string | null;
  balance: number;
  ldmBalance: number;
  homeGuildId: string | null;
  homeGuildName: string | null;
  publicDescription: string | null;
};

export type MarketForbesEntry = UserPublicProfile & {
  rank: number;
};

interface ProfileRow extends RowDataPacket {
  discord_id: string;
  username: string | null;
  global_name: string | null;
  avatar: string | null;
  member_username: string | null;
  member_global_name: string | null;
  member_avatar: string | null;
  member_avatar_url: string | null;
  balance: number | string | null;
  ldm_balance: number | string | null;
  home_guild_id: string | null;
  home_guild_display_name: string | null;
  public_description: string | null;
}

interface GuildOptionRow extends RowDataPacket {
  guild_id: string;
  display_name: string | null;
  icon_url: string | null;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildDiscordAvatarUrl(discordId: string, avatar: string | null): string | null {
  if (!avatar) {
    return null;
  }

  const ext = avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.${ext}?size=128`;
}

function mapProfileRow(row: ProfileRow): UserPublicProfile {
  const discordId = String(row.discord_id);
  const homeGuildId = row.home_guild_id ? String(row.home_guild_id) : null;
  const homeGuildDisplayName = row.home_guild_display_name ? String(row.home_guild_display_name) : null;
  const username = row.username ?? row.member_username ?? null;
  const globalName = row.global_name ?? row.member_global_name ?? null;
  const avatarUrl = buildDiscordAvatarUrl(discordId, row.avatar ?? null)
    || (row.member_avatar_url ? String(row.member_avatar_url) : null)
    || buildDiscordAvatarUrl(discordId, row.member_avatar ?? null);

  return {
    discordId,
    username,
    globalName,
    avatarUrl,
    balance: toNumber(row.balance),
    ldmBalance: toNumber(row.ldm_balance),
    homeGuildId,
    homeGuildName: homeGuildDisplayName || homeGuildId,
    publicDescription: row.public_description ?? null,
  };
}

export class UserProfileService {
  private static instance: UserProfileService;

  static getInstance(): UserProfileService {
    if (!UserProfileService.instance) {
      UserProfileService.instance = new UserProfileService();
    }

    return UserProfileService.instance;
  }

  async ensureMember(discordId: string): Promise<void> {
    await pool.query(
      `INSERT INTO members (ds_member_id, balance, ldm_balance, locale)
       VALUES (?, 0, 0, 'en')
       ON DUPLICATE KEY UPDATE ds_member_id = VALUES(ds_member_id)`,
      [discordId]
    );
  }

  async isKnownGuild(guildId: string): Promise<boolean> {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM guilds WHERE ds_guild_id = ? LIMIT 1`,
      [guildId]
    );

    return rows.length > 0;
  }

  async getCurrentUserProfile(discordId: string): Promise<UserPublicProfile> {
    await this.ensureMember(discordId);

    const [rows] = await pool.query<ProfileRow[]>(
      `SELECT
          m.ds_member_id AS discord_id,
          s.username AS username,
          s.global_name AS global_name,
          s.avatar AS avatar,
          m.discord_username AS member_username,
          m.discord_global_name AS member_global_name,
          m.discord_avatar AS member_avatar,
          m.discord_avatar_url AS member_avatar_url,
          m.balance AS balance,
          m.ldm_balance AS ldm_balance,
          m.home_guild_id AS home_guild_id,
           hg.display_name AS home_guild_display_name,
          m.public_description AS public_description
       FROM members AS m
         LEFT JOIN guilds AS hg ON hg.ds_guild_id = m.home_guild_id
       LEFT JOIN (
         SELECT s1.discord_id, s1.username, s1.global_name, s1.avatar
         FROM api_sessions AS s1
         INNER JOIN (
           SELECT discord_id, MAX(id) AS max_id
           FROM api_sessions
           GROUP BY discord_id
         ) AS latest ON latest.max_id = s1.id
       ) AS s ON s.discord_id = m.ds_member_id
       WHERE m.ds_member_id = ?
       LIMIT 1`,
      [discordId]
    );

    if (!rows.length) {
      throw new Error("Profile not found.");
    }

    return mapProfileRow(rows[0]);
  }

  async listAvailableHomeGuilds(discordId: string): Promise<AvailableGuild[]> {
    const [memberGuildRows] = await pool.query<GuildOptionRow[]>(
      `SELECT DISTINCT g.ds_guild_id AS guild_id, g.display_name AS display_name, g.icon_url AS icon_url
       FROM guild_members AS gm
       INNER JOIN members AS m ON m.id = gm.member_id
       INNER JOIN guilds AS g ON g.id = gm.guild_id
       WHERE m.ds_member_id = ?
       ORDER BY g.ds_guild_id ASC`,
      [discordId]
    );

    const sourceRows = memberGuildRows.length
      ? memberGuildRows
      : (await pool.query<GuildOptionRow[]>(
        `SELECT g.ds_guild_id AS guild_id, g.display_name AS display_name, g.icon_url AS icon_url
         FROM guilds AS g
         ORDER BY g.ds_guild_id ASC`
      ))[0];

    return sourceRows.map(row => ({
      guildId: String(row.guild_id),
      name: row.display_name ? String(row.display_name) : String(row.guild_id),
      iconUrl: row.icon_url ? String(row.icon_url) : null,
    }));
  }

  async updateCurrentUserProfile(
    discordId: string,
    input: {
      homeGuildId?: string | null;
      publicDescription?: string | null;
    },
  ): Promise<UserPublicProfile> {
    await this.ensureMember(discordId);

    const updates: string[] = [];
    const values: Array<string | null> = [];

    if (input.homeGuildId !== undefined) {
      updates.push("home_guild_id = ?");
      values.push(input.homeGuildId);
    }

    if (input.publicDescription !== undefined) {
      updates.push("public_description = ?");
      values.push(input.publicDescription);
    }

    if (updates.length) {
      values.push(discordId);
      await pool.query(
        `UPDATE members
         SET ${updates.join(", ")}
         WHERE ds_member_id = ?`,
        values
      );
    }

    return this.getCurrentUserProfile(discordId);
  }

  async getMarketForbes(limit = 10): Promise<MarketForbesEntry[]> {
    const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)));

    const [rows] = await pool.query<ProfileRow[]>(
      `SELECT
          m.ds_member_id AS discord_id,
          s.username AS username,
          s.global_name AS global_name,
          s.avatar AS avatar,
          m.discord_username AS member_username,
          m.discord_global_name AS member_global_name,
          m.discord_avatar AS member_avatar,
          m.discord_avatar_url AS member_avatar_url,
          m.balance AS balance,
          m.ldm_balance AS ldm_balance,
          m.home_guild_id AS home_guild_id,
           hg.display_name AS home_guild_display_name,
          m.public_description AS public_description
       FROM members AS m
         LEFT JOIN guilds AS hg ON hg.ds_guild_id = m.home_guild_id
       LEFT JOIN (
         SELECT s1.discord_id, s1.username, s1.global_name, s1.avatar
         FROM api_sessions AS s1
         INNER JOIN (
           SELECT discord_id, MAX(id) AS max_id
           FROM api_sessions
           GROUP BY discord_id
         ) AS latest ON latest.max_id = s1.id
       ) AS s ON s.discord_id = m.ds_member_id
       ORDER BY m.balance DESC, m.ldm_balance DESC, m.id ASC
       LIMIT ?`,
      [safeLimit]
    );

    return rows.map((row, index) => ({
      rank: index + 1,
      ...mapProfileRow(row),
    }));
  }
}
