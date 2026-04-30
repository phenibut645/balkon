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
}
