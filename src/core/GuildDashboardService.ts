import { RowDataPacket } from "mysql2";
import pool from "../db.js";
import { MemberStatuses } from "../types/database.types.js";
import { memberService } from "./MemberService.js";

export type GuildDashboardUserRole = "owner" | "admin" | "member" | "unknown";

export type GuildDashboardListItem = {
  guildId: string;
  name: string;
  iconUrl: string | null;
  memberCount: number | null;
  streamerCount: number | null;
  isHomeGuild: boolean;
  userRole: GuildDashboardUserRole;
  botRegistered: boolean;
};

export type GuildDashboardOverview = {
  guildId: string;
  name: string;
  iconUrl: string | null;
  memberCount: number | null;
  streamerCount: number | null;
  itemCount: number | null;
  inventoryCount: number | null;
  marketListingCount: number | null;
  userRole: GuildDashboardUserRole;
  botRegistered: boolean;
};

interface MemberRow extends RowDataPacket {
  id: number | string;
  home_guild_id: string | null;
}

interface GuildListRow extends RowDataPacket {
  guild_db_id: number | string;
  guild_id: string;
  display_name: string | null;
  icon_url: string | null;
  member_status_id: number | string | null;
  has_admin_role: number | string | null;
  member_count: number | string | null;
  streamer_count: number | string | null;
  home_guild_id: string | null;
}

interface GuildOverviewRow extends GuildListRow {
  item_count: null;
  inventory_count: null;
  market_listing_count: null;
}

export class GuildDashboardService {
  private static instance: GuildDashboardService;

  static getInstance(): GuildDashboardService {
    if (!GuildDashboardService.instance) {
      GuildDashboardService.instance = new GuildDashboardService();
    }

    return GuildDashboardService.instance;
  }

  async listCurrentUserGuilds(discordId: string): Promise<GuildDashboardListItem[]> {
    const member = await this.ensureMember(discordId);
    const [memberGuildRows] = await pool.query<GuildListRow[]>(
      `SELECT
          g.id AS guild_db_id,
          g.ds_guild_id AS guild_id,
          g.display_name,
          g.icon_url,
          gm.member_status_id,
          EXISTS(
            SELECT 1
            FROM member_roles AS mr
            INNER JOIN guild_roles AS gr ON gr.id = mr.guild_role_id AND gr.guild_id = g.id
            INNER JOIN guild_role_statuses AS grs ON grs.guild_role_id = gr.id
            INNER JOIN role_statuses AS rs ON rs.id = grs.role_status_id
            WHERE mr.member_id = m.id AND rs.name = 'guild_admin'
          ) AS has_admin_role,
          (SELECT COUNT(*) FROM guild_members AS guild_member WHERE guild_member.guild_id = g.id) AS member_count,
          (SELECT COUNT(*) FROM guild_streamers AS guild_streamer WHERE guild_streamer.guild_id = g.id) AS streamer_count,
          m.home_guild_id
       FROM guild_members AS gm
       INNER JOIN members AS m ON m.id = gm.member_id
       INNER JOIN guilds AS g ON g.id = gm.guild_id
       WHERE m.id = ?
       ORDER BY COALESCE(g.display_name, g.ds_guild_id) ASC`,
      [member.id],
    );

    if (memberGuildRows.length > 0) {
      return memberGuildRows.map(row => this.mapGuildListRow(row));
    }

    // TODO: remove this fallback once web sessions can rely on fresh guild_members sync.
    const [fallbackRows] = await pool.query<GuildListRow[]>(
      `SELECT
          g.id AS guild_db_id,
          g.ds_guild_id AS guild_id,
          g.display_name,
          g.icon_url,
          NULL AS member_status_id,
          0 AS has_admin_role,
          (SELECT COUNT(*) FROM guild_members AS guild_member WHERE guild_member.guild_id = g.id) AS member_count,
          (SELECT COUNT(*) FROM guild_streamers AS guild_streamer WHERE guild_streamer.guild_id = g.id) AS streamer_count,
          ? AS home_guild_id
       FROM guilds AS g
       ORDER BY COALESCE(g.display_name, g.ds_guild_id) ASC`,
      [member.homeGuildId],
    );

    return fallbackRows.map(row => this.mapGuildListRow(row));
  }

  async getGuildOverview(discordId: string, guildId: string): Promise<GuildDashboardOverview | null> {
    await this.ensureMember(discordId);

    const [rows] = await pool.query<GuildOverviewRow[]>(
      `SELECT
          g.id AS guild_db_id,
          g.ds_guild_id AS guild_id,
          g.display_name,
          g.icon_url,
          gm.member_status_id,
          EXISTS(
            SELECT 1
            FROM member_roles AS mr
            INNER JOIN guild_roles AS gr ON gr.id = mr.guild_role_id AND gr.guild_id = g.id
            INNER JOIN guild_role_statuses AS grs ON grs.guild_role_id = gr.id
            INNER JOIN role_statuses AS rs ON rs.id = grs.role_status_id
            WHERE mr.member_id = m.id AND rs.name = 'guild_admin'
          ) AS has_admin_role,
          (SELECT COUNT(*) FROM guild_members AS guild_member WHERE guild_member.guild_id = g.id) AS member_count,
          (SELECT COUNT(*) FROM guild_streamers AS guild_streamer WHERE guild_streamer.guild_id = g.id) AS streamer_count,
          m.home_guild_id,
          NULL AS item_count,
          NULL AS inventory_count,
          NULL AS market_listing_count
       FROM guilds AS g
       LEFT JOIN members AS m ON m.ds_member_id = ?
       LEFT JOIN guild_members AS gm ON gm.guild_id = g.id AND gm.member_id = m.id
       WHERE g.ds_guild_id = ?
       LIMIT 1`,
      [discordId, guildId],
    );

    if (!rows.length) {
      return null;
    }

    const row = rows[0];
    return {
      guildId: String(row.guild_id),
      name: row.display_name ? String(row.display_name) : String(row.guild_id),
      iconUrl: row.icon_url ? String(row.icon_url) : null,
      memberCount: this.toNullableNumber(row.member_count),
      streamerCount: this.toNullableNumber(row.streamer_count),
      itemCount: null,
      inventoryCount: null,
      marketListingCount: null,
      userRole: this.resolveUserRole(row),
      botRegistered: true,
    };
  }

  private async ensureMember(discordId: string): Promise<{ id: number; homeGuildId: string | null }> {
    await memberService.ensureMemberByDiscordId(discordId, { createdSource: "unknown" });

    const [rows] = await pool.query<MemberRow[]>(
      `SELECT id, home_guild_id
       FROM members
       WHERE ds_member_id = ?
       LIMIT 1`,
      [discordId],
    );

    if (!rows.length) {
      throw new Error("Unable to resolve current member.");
    }

    return {
      id: Number(rows[0].id),
      homeGuildId: rows[0].home_guild_id ? String(rows[0].home_guild_id) : null,
    };
  }

  private mapGuildListRow(row: GuildListRow): GuildDashboardListItem {
    const guildId = String(row.guild_id);

    return {
      guildId,
      name: row.display_name ? String(row.display_name) : guildId,
      iconUrl: row.icon_url ? String(row.icon_url) : null,
      memberCount: this.toNullableNumber(row.member_count),
      streamerCount: this.toNullableNumber(row.streamer_count),
      isHomeGuild: row.home_guild_id === guildId,
      userRole: this.resolveUserRole(row),
      botRegistered: true,
    };
  }

  private resolveUserRole(row: Pick<GuildListRow, "member_status_id" | "has_admin_role">): GuildDashboardUserRole {
    if (row.member_status_id === null || row.member_status_id === undefined) {
      return "unknown";
    }

    if (Number(row.member_status_id) === MemberStatuses.GuildOwner) {
      return "owner";
    }

    if (Number(row.has_admin_role ?? 0) > 0) {
      return "admin";
    }

    return "member";
  }

  private toNullableNumber(value: number | string | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
}
