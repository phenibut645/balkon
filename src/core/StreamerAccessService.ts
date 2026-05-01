import { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../db.js";
import { isBotAdmin as isBotAdminId } from "./BotAdmin.js";
import { ItemService } from "./ItemService.js";
import { ObsAgentStatusService } from "./ObsAgentStatusService.js";

export type StreamerAccessRole = "owner" | "manager" | "moderator" | "bot_admin";

export type StreamerAccessView = {
  streamerId: number;
  nickname: string;
  twitchUrl: string | null;
  accessRole: StreamerAccessRole;
  canManage: boolean;
  canControl: boolean;
  obsAgentConfigured?: boolean;
  obsAgentOnline?: boolean;
};

export type TrustedUserView = {
  id: number;
  memberId: number;
  discordId: string;
  displayName: string;
  avatarUrl: string | null;
  role: "moderator" | "manager";
  createdAt: string;
};

type StreamerRow = RowDataPacket & {
  id: number;
  nickname: string;
  twitch_url: string;
};

type OwnerRow = RowDataPacket & {
  streamer_id: number;
  role: "owner" | "manager";
};

type TrustedRow = RowDataPacket & {
  streamer_id: number;
  role: "moderator" | "manager";
};

type TrustedUserRow = RowDataPacket & {
  id: number;
  member_id: number;
  ds_member_id: string;
  discord_username: string | null;
  discord_global_name: string | null;
  discord_avatar_url: string | null;
  role: "moderator" | "manager";
  created_at: Date | string;
};

type ObsBindingRow = RowDataPacket & {
  setting_key: string;
  setting_value: string | null;
};

export class StreamerAccessService {
  private static instance: StreamerAccessService;

  static getInstance(): StreamerAccessService {
    if (!StreamerAccessService.instance) {
      StreamerAccessService.instance = new StreamerAccessService();
    }
    return StreamerAccessService.instance;
  }

  async getMyStreamerAccess(discordId: string): Promise<{
    owned: StreamerAccessView[];
    trusted: StreamerAccessView[];
    isBotAdmin: boolean;
  }> {
    const isAdmin = this.isBotAdmin(discordId);
    const memberId = await this.ensureMemberId(discordId);

    const [ownerRows, trustedRows] = await Promise.all([
      this.listOwnerRelations(memberId),
      this.listTrustedRelations(memberId),
    ]);

    const owned = await this.buildAccessViews({
      discordId,
      streamerRoles: new Map(ownerRows.map(r => [r.streamer_id, r.role])),
      roleKind: "owner",
      forceAdmin: false,
    });

    const trusted = await this.buildAccessViews({
      discordId,
      streamerRoles: new Map(trustedRows.map(r => [r.streamer_id, r.role])),
      roleKind: "trusted",
      forceAdmin: false,
    });

    return {
      owned,
      trusted,
      isBotAdmin: isAdmin,
    };
  }

  async listAccessibleStreamers(discordId: string): Promise<StreamerAccessView[]> {
    if (this.isBotAdmin(discordId)) {
      const streamers = await this.listStreamersByIds(null);
      const obsMeta = await this.loadObsMeta(streamers.map(s => s.id));
      return streamers.map(streamer => this.mapStreamerToAccessView(discordId, streamer, "bot_admin", obsMeta.get(streamer.id)));
    }

    const memberId = await this.ensureMemberId(discordId);
    const [ownerRows, trustedRows] = await Promise.all([
      this.listOwnerRelations(memberId),
      this.listTrustedRelations(memberId),
    ]);

    const merged = new Map<number, StreamerAccessRole>();
    for (const row of trustedRows) {
      merged.set(row.streamer_id, row.role);
    }
    for (const row of ownerRows) {
      merged.set(row.streamer_id, row.role);
    }

    const streamerIds = Array.from(merged.keys());
    const streamers = await this.listStreamersByIds(streamerIds);
    const obsMeta = await this.loadObsMeta(streamerIds);

    return streamers.map(streamer => this.mapStreamerToAccessView(discordId, streamer, merged.get(streamer.id)!, obsMeta.get(streamer.id)));
  }

  async listTrustedUsers(discordId: string, streamerId: number): Promise<TrustedUserView[]> {
    const canManage = await this.canManageStreamer(discordId, streamerId);
    if (!canManage) {
      throw this.forbiddenError();
    }

    const [rows] = await pool.query<TrustedUserRow[]>(
      `SELECT
          tu.id,
          tu.member_id,
          m.ds_member_id,
          m.discord_username,
          m.discord_global_name,
          m.discord_avatar_url,
          tu.role,
          tu.created_at
       FROM streamer_trusted_users AS tu
       INNER JOIN members AS m ON m.id = tu.member_id
       WHERE tu.streamer_id = ?
       ORDER BY tu.created_at DESC, tu.id DESC`,
      [streamerId],
    );

    return rows.map(row => ({
      id: row.id,
      memberId: row.member_id,
      discordId: row.ds_member_id,
      displayName: this.getMemberDisplayName(row),
      avatarUrl: row.discord_avatar_url ?? null,
      role: row.role,
      createdAt: this.toIsoTimestamp(row.created_at),
    }));
  }

  async addTrustedUser(input: {
    actorDiscordId: string;
    streamerId: number;
    targetDiscordId: string;
    role?: "moderator" | "manager";
  }): Promise<TrustedUserView> {
    const canManage = await this.canManageStreamer(input.actorDiscordId, input.streamerId);
    if (!canManage) {
      throw this.forbiddenError();
    }

    const role = input.role ?? "moderator";
    if (role !== "moderator" && role !== "manager") {
      throw Object.assign(new Error("Invalid trusted user role."), { code: "STREAMER_TRUSTED_USER_INVALID" });
    }

    const [streamerExists, actorMemberId, targetMember] = await Promise.all([
      this.getStreamerById(input.streamerId),
      this.ensureMemberId(input.actorDiscordId),
      ItemService.getInstance().ensureMemberByDiscordId(input.targetDiscordId),
    ]);

    if (!streamerExists) {
      throw Object.assign(new Error("Streamer not found."), { code: "STREAMER_NOT_FOUND" });
    }

    try {
      await pool.query<ResultSetHeader>(
        `INSERT INTO streamer_trusted_users (
            streamer_id,
            member_id,
            role,
            created_by_member_id
         ) VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
            role = VALUES(role),
            created_by_member_id = VALUES(created_by_member_id)`,
        [input.streamerId, targetMember.data.id, role, actorMemberId],
      );
    } catch (error) {
      const e = error instanceof Error ? error : new Error("Failed to save trusted user.");
      throw Object.assign(e, { code: "STREAMER_TRUSTED_USER_SAVE_FAILED" });
    }

    const [rows] = await pool.query<TrustedUserRow[]>(
      `SELECT
          tu.id,
          tu.member_id,
          m.ds_member_id,
          m.discord_username,
          m.discord_global_name,
          m.discord_avatar_url,
          tu.role,
          tu.created_at
       FROM streamer_trusted_users AS tu
       INNER JOIN members AS m ON m.id = tu.member_id
       WHERE tu.streamer_id = ? AND tu.member_id = ?
       LIMIT 1`,
      [input.streamerId, targetMember.data.id],
    );

    const row = rows[0];
    if (!row) {
      throw Object.assign(new Error("Failed to load trusted user after save."), { code: "STREAMER_TRUSTED_USER_SAVE_FAILED" });
    }

    return {
      id: row.id,
      memberId: row.member_id,
      discordId: row.ds_member_id,
      displayName: this.getMemberDisplayName(row),
      avatarUrl: row.discord_avatar_url ?? null,
      role: row.role,
      createdAt: this.toIsoTimestamp(row.created_at),
    };
  }

  async removeTrustedUser(input: { actorDiscordId: string; streamerId: number; memberId: number }): Promise<{ removed: boolean }> {
    const canManage = await this.canManageStreamer(input.actorDiscordId, input.streamerId);
    if (!canManage) {
      throw this.forbiddenError();
    }

    try {
      const [result] = await pool.query<ResultSetHeader>(
        `DELETE FROM streamer_trusted_users WHERE streamer_id = ? AND member_id = ?`,
        [input.streamerId, input.memberId],
      );
      return { removed: result.affectedRows > 0 };
    } catch (error) {
      const e = error instanceof Error ? error : new Error("Failed to delete trusted user.");
      throw Object.assign(e, { code: "STREAMER_TRUSTED_USER_DELETE_FAILED" });
    }
  }

  async canManageStreamer(discordId: string, streamerId: number): Promise<boolean> {
    if (this.isBotAdmin(discordId)) {
      return true;
    }

    const memberId = await this.ensureMemberId(discordId);

    const [ownerRows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM streamer_owners WHERE streamer_id = ? AND member_id = ? LIMIT 1`,
      [streamerId, memberId],
    );
    if (ownerRows.length) {
      return true;
    }

    const [trustedRows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM streamer_trusted_users WHERE streamer_id = ? AND member_id = ? AND role = 'manager' LIMIT 1`,
      [streamerId, memberId],
    );
    return trustedRows.length > 0;
  }

  async canControlStreamer(discordId: string, streamerId: number): Promise<boolean> {
    if (this.isBotAdmin(discordId)) {
      return true;
    }

    const memberId = await this.ensureMemberId(discordId);

    const [ownerRows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM streamer_owners WHERE streamer_id = ? AND member_id = ? LIMIT 1`,
      [streamerId, memberId],
    );
    if (ownerRows.length) {
      return true;
    }

    const [trustedRows] = await pool.query<RowDataPacket[]>(
      `SELECT id FROM streamer_trusted_users WHERE streamer_id = ? AND member_id = ? LIMIT 1`,
      [streamerId, memberId],
    );
    return trustedRows.length > 0;
  }

  // ──────────────────────────────────────────────────────────────────────────────
  private forbiddenError() {
    return Object.assign(new Error("Forbidden."), { code: "STREAMER_STUDIO_FORBIDDEN" });
  }

  private isBotAdmin(discordId: string): boolean {
    return isBotAdminId(discordId);
  }

  private async ensureMemberId(discordId: string): Promise<number> {
    const member = await ItemService.getInstance().ensureMemberByDiscordId(discordId);
    return member.data.id;
  }

  private async getStreamerById(streamerId: number): Promise<StreamerRow | null> {
    const [rows] = await pool.query<StreamerRow[]>(`SELECT id, nickname, twitch_url FROM streamers WHERE id = ? LIMIT 1`, [streamerId]);
    return rows[0] ?? null;
  }

  private async listOwnerRelations(memberId: number): Promise<OwnerRow[]> {
    const [rows] = await pool.query<OwnerRow[]>(
      `SELECT streamer_id, role FROM streamer_owners WHERE member_id = ? ORDER BY id DESC`,
      [memberId],
    );
    return rows;
  }

  private async listTrustedRelations(memberId: number): Promise<TrustedRow[]> {
    const [rows] = await pool.query<TrustedRow[]>(
      `SELECT streamer_id, role FROM streamer_trusted_users WHERE member_id = ? ORDER BY id DESC`,
      [memberId],
    );
    return rows;
  }

  private async buildAccessViews(input: {
    discordId: string;
    streamerRoles: Map<number, "owner" | "manager" | "moderator">;
    roleKind: "owner" | "trusted";
    forceAdmin: boolean;
  }): Promise<StreamerAccessView[]> {
    const streamerIds = Array.from(input.streamerRoles.keys());
    if (!streamerIds.length) {
      return [];
    }

    const [streamers, obsMeta] = await Promise.all([
      this.listStreamersByIds(streamerIds),
      this.loadObsMeta(streamerIds),
    ]);

    return streamers.map(streamer => {
      const role = input.forceAdmin ? "bot_admin" : (input.streamerRoles.get(streamer.id)! as StreamerAccessRole);
      return this.mapStreamerToAccessView(input.discordId, streamer, role, obsMeta.get(streamer.id));
    });
  }

  private async listStreamersByIds(streamerIds: number[] | null): Promise<StreamerRow[]> {
    if (streamerIds === null) {
      const [rows] = await pool.query<StreamerRow[]>(`SELECT id, nickname, twitch_url FROM streamers ORDER BY nickname ASC, id ASC`);
      return rows;
    }

    if (!streamerIds.length) {
      return [];
    }

    const placeholders = streamerIds.map(() => "?").join(",");
    const [rows] = await pool.query<StreamerRow[]>(
      `SELECT id, nickname, twitch_url FROM streamers WHERE id IN (${placeholders}) ORDER BY nickname ASC, id ASC`,
      streamerIds,
    );
    return rows;
  }

  private mapStreamerToAccessView(
    discordId: string,
    streamer: StreamerRow,
    accessRole: StreamerAccessRole,
    obsMeta?: { configured: boolean; online: boolean } | undefined,
  ): StreamerAccessView {
    const canManage = accessRole === "bot_admin" || accessRole === "owner" || accessRole === "manager";
    const canControl = canManage || accessRole === "moderator";

    return {
      streamerId: streamer.id,
      nickname: streamer.nickname,
      twitchUrl: streamer.twitch_url ?? null,
      accessRole,
      canManage,
      canControl,
      obsAgentConfigured: obsMeta?.configured,
      obsAgentOnline: obsMeta?.online,
    };
  }

  private async loadObsMeta(streamerIds: number[]): Promise<Map<number, { configured: boolean; online: boolean }>> {
    const result = new Map<number, { configured: boolean; online: boolean }>();
    if (!streamerIds.length) {
      return result;
    }

    const [settingRows] = await pool.query<ObsBindingRow[]>(
      `SELECT setting_key, setting_value FROM bot_settings WHERE setting_key LIKE ?`,
      ["obs_agent_binding:%"],
    );

    const agentByStreamerId = new Map<number, string>();
    for (const row of settingRows) {
      const key = String(row.setting_key ?? "");
      const streamerId = Number(key.replace("obs_agent_binding:", ""));
      if (!streamerIds.includes(streamerId)) {
        continue;
      }
      if (!row.setting_value) {
        continue;
      }
      try {
        const parsed = JSON.parse(String(row.setting_value)) as { agentId?: string };
        if (parsed.agentId) {
          agentByStreamerId.set(streamerId, parsed.agentId);
        }
      } catch {
        continue;
      }
    }

    const agentIds = Array.from(new Set(Array.from(agentByStreamerId.values())));
    const statuses = await ObsAgentStatusService.getInstance().getStatuses(agentIds);

    for (const streamerId of streamerIds) {
      const agentId = agentByStreamerId.get(streamerId);
      if (!agentId) {
        result.set(streamerId, { configured: false, online: false });
        continue;
      }
      const status = statuses.get(agentId);
      result.set(streamerId, { configured: true, online: status?.online ?? false });
    }

    return result;
  }

  private getMemberDisplayName(row: {
    discord_global_name: string | null;
    discord_username: string | null;
    ds_member_id: string;
  }): string {
    const globalName = (row.discord_global_name ?? "").trim();
    if (globalName) {
      return globalName;
    }
    const username = (row.discord_username ?? "").trim();
    if (username) {
      return username;
    }
    return row.ds_member_id;
  }

  private toIsoTimestamp(value: Date | string | null | undefined): string {
    if (!value) {
      return new Date(0).toISOString();
    }
    if (value instanceof Date) {
      return value.toISOString();
    }
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date(0).toISOString() : parsed.toISOString();
  }
}

export const streamerAccessService = StreamerAccessService.getInstance();

