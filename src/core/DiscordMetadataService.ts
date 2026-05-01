import { Client } from "discord.js";
import { RowDataPacket } from "mysql2";
import pool from "../db.js";

export type UpsertMemberDiscordProfileInput = {
  discordId: string;
  username?: string | null;
  globalName?: string | null;
  avatar?: string | null;
  avatarUrl?: string | null;
};

export type UpsertGuildDiscordMetadataInput = {
  guildId: string;
  displayName?: string | null;
  iconUrl?: string | null;
};

type MissingMemberProfileRow = RowDataPacket & {
  ds_member_id: string;
};

const MEMBER_PROFILE_BACKFILL_LIMIT = 100;

export class DiscordMetadataService {
  private static instance: DiscordMetadataService;

  static getInstance(): DiscordMetadataService {
    if (!DiscordMetadataService.instance) {
      DiscordMetadataService.instance = new DiscordMetadataService();
    }

    return DiscordMetadataService.instance;
  }

  async upsertMemberDiscordProfile(input: UpsertMemberDiscordProfileInput): Promise<void> {
    await pool.query(
      `INSERT INTO members (
          ds_member_id,
          discord_username,
          discord_global_name,
          discord_avatar,
          discord_avatar_url,
          discord_profile_updated_at,
          balance,
          ldm_balance,
          locale
       ) VALUES (?, ?, ?, ?, ?, NOW(), 0, 0, 'en')
       ON DUPLICATE KEY UPDATE
         discord_username = COALESCE(VALUES(discord_username), discord_username),
         discord_global_name = COALESCE(VALUES(discord_global_name), discord_global_name),
         discord_avatar = COALESCE(VALUES(discord_avatar), discord_avatar),
         discord_avatar_url = COALESCE(VALUES(discord_avatar_url), discord_avatar_url),
         discord_profile_updated_at = NOW()`,
      [
        input.discordId,
        input.username ?? null,
        input.globalName ?? null,
        input.avatar ?? null,
        input.avatarUrl ?? null,
      ],
    );
  }

  async upsertGuildDiscordMetadata(input: UpsertGuildDiscordMetadataInput): Promise<void> {
    await pool.query(
      `INSERT INTO guilds (ds_guild_id, display_name, icon_url)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         display_name = COALESCE(VALUES(display_name), display_name),
         icon_url = COALESCE(VALUES(icon_url), icon_url)`,
      [
        input.guildId,
        input.displayName ?? null,
        input.iconUrl ?? null,
      ],
    );
  }

  async backfillKnownMemberProfiles(client: Client): Promise<{ attempted: number; updated: number; failed: number }> {
    const [rows] = await pool.query<MissingMemberProfileRow[]>(
      `SELECT ds_member_id
       FROM members
       WHERE discord_username IS NULL
          OR discord_global_name IS NULL
          OR discord_avatar_url IS NULL
          OR discord_profile_updated_at IS NULL
       ORDER BY discord_profile_updated_at ASC, id ASC
       LIMIT ?`,
      [MEMBER_PROFILE_BACKFILL_LIMIT],
    );

    let updated = 0;
    let failed = 0;

    for (const row of rows) {
      const discordId = String(row.ds_member_id);

      try {
        const user = await client.users.fetch(discordId);
        await this.upsertMemberDiscordProfile({
          discordId,
          username: user.username,
          globalName: user.globalName ?? null,
          avatar: user.avatar ?? null,
          avatarUrl: user.displayAvatarURL({ size: 128 }) ?? null,
        });
        updated += 1;
      } catch (error) {
        failed += 1;
        console.warn(`Failed to backfill Discord profile for member ${discordId}`, error);
      }
    }

    const summary = {
      attempted: rows.length,
      updated,
      failed,
    };

    console.log(
      `Discord member profile backfill summary: attempted=${summary.attempted}, updated=${summary.updated}, failed=${summary.failed}`,
    );

    return summary;
  }
}
