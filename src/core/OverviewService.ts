import { RowDataPacket } from "mysql2";
import pool from "../db.js";
import { ItemService } from "./ItemService.js";
import { NotificationSeverity } from "./NotificationService.js";
import { ObsMediaActionStatus, ObsMediaProductKind } from "./ObsMediaActionService.js";

type OverviewLatestNotification = {
  id: number;
  title: string;
  body: string;
  type: string | null;
  severity: NotificationSeverity;
  readAt: string | null;
  createdAt: string;
};

type OverviewLatestObsAction = {
  id: number;
  productTitle: string;
  productKind: ObsMediaProductKind;
  streamerNickname: string;
  status: ObsMediaActionStatus;
  priceOdm: number;
  createdAt: string;
};

export type OverviewSummary = {
  balance: {
    odm: number;
    ldm: number;
  };
  inventoryCount: number;
  unreadNotificationsCount: number;
  latestNotifications: OverviewLatestNotification[];
  homeGuild: {
    guildId: string;
    name: string;
    iconUrl: string | null;
  } | null;
  obsActions: {
    total: number;
    latest: OverviewLatestObsAction | null;
  };
};

interface CountRow extends RowDataPacket {
  total: number | string;
}

interface NotificationRow extends RowDataPacket {
  id: number | string;
  title: string;
  body: string;
  type: string | null;
  severity: NotificationSeverity;
  read_at: Date | string | null;
  created_at: Date | string;
}

interface HomeGuildRow extends RowDataPacket {
  guild_id: string | null;
  display_name: string | null;
  icon_url: string | null;
}

interface ObsActionRow extends RowDataPacket {
  id: number | string;
  product_title: string;
  product_kind: ObsMediaProductKind;
  streamer_nickname: string;
  status: ObsMediaActionStatus;
  price_odm: number | string;
  created_at: Date | string;
}

export class OverviewService {
  private static instance: OverviewService;

  static getInstance(): OverviewService {
    if (!OverviewService.instance) {
      OverviewService.instance = new OverviewService();
    }

    return OverviewService.instance;
  }

  async getCurrentUserOverview(discordId: string): Promise<OverviewSummary> {
    const member = await ItemService.getInstance().ensureMemberByDiscordId(discordId);
    const memberId = Number(member.data.id);

    const [
      inventoryCountRows,
      unreadNotificationRows,
      latestNotificationRows,
      homeGuildRows,
      obsActionCountRows,
      latestObsActionRows,
    ] = await Promise.all([
      pool.query<CountRow[]>(
        `SELECT COUNT(*) AS total
         FROM member_items
         WHERE member_id = ?`,
        [memberId],
      ),
      pool.query<CountRow[]>(
        `SELECT COUNT(*) AS total
         FROM notifications
         WHERE member_id = ? AND read_at IS NULL`,
        [memberId],
      ),
      pool.query<NotificationRow[]>(
        `SELECT id, title, body, type, severity, read_at, created_at
         FROM notifications
         WHERE member_id = ?
         ORDER BY created_at DESC, id DESC
         LIMIT 3`,
        [memberId],
      ),
      pool.query<HomeGuildRow[]>(
        `SELECT m.home_guild_id AS guild_id, g.display_name, g.icon_url
         FROM members AS m
         LEFT JOIN guilds AS g ON g.ds_guild_id = m.home_guild_id
         WHERE m.id = ?
         LIMIT 1`,
        [memberId],
      ),
      pool.query<CountRow[]>(
        `SELECT COUNT(*) AS total
         FROM obs_media_actions
         WHERE buyer_member_id = ?`,
        [memberId],
      ),
      pool.query<ObsActionRow[]>(
        `SELECT
            oma.id,
            oma.product_title,
            oma.product_kind,
            streamer.nickname AS streamer_nickname,
            oma.status,
            oma.price_odm,
            oma.created_at
         FROM obs_media_actions AS oma
         INNER JOIN streamers AS streamer ON streamer.id = oma.streamer_id
         WHERE oma.buyer_member_id = ?
         ORDER BY oma.created_at DESC, oma.id DESC
         LIMIT 1`,
        [memberId],
      ),
    ]);

    const homeGuild = this.mapHomeGuild(homeGuildRows[0][0]);
    const latestObsAction = latestObsActionRows[0][0] ? this.mapObsAction(latestObsActionRows[0][0]) : null;

    return {
      balance: {
        odm: Number(member.data.balance ?? 0),
        ldm: Number(member.data.ldm_balance ?? 0),
      },
      inventoryCount: Number(inventoryCountRows[0][0]?.total ?? 0),
      unreadNotificationsCount: Number(unreadNotificationRows[0][0]?.total ?? 0),
      latestNotifications: latestNotificationRows[0].map(row => this.mapNotification(row)),
      homeGuild,
      obsActions: {
        total: Number(obsActionCountRows[0][0]?.total ?? 0),
        latest: latestObsAction,
      },
    };
  }

  private mapNotification(row: NotificationRow): OverviewLatestNotification {
    return {
      id: Number(row.id),
      title: String(row.title),
      body: String(row.body),
      type: row.type === null ? null : String(row.type),
      severity: row.severity,
      readAt: this.toNullableIsoString(row.read_at),
      createdAt: this.toIsoString(row.created_at),
    };
  }

  private mapHomeGuild(row: HomeGuildRow | undefined): OverviewSummary["homeGuild"] {
    if (!row?.guild_id) {
      return null;
    }

    const guildId = String(row.guild_id);
    return {
      guildId,
      name: row.display_name ? String(row.display_name) : guildId,
      iconUrl: row.icon_url ? String(row.icon_url) : null,
    };
  }

  private mapObsAction(row: ObsActionRow): OverviewLatestObsAction {
    return {
      id: Number(row.id),
      productTitle: String(row.product_title),
      productKind: row.product_kind,
      streamerNickname: String(row.streamer_nickname),
      status: row.status,
      priceOdm: Number(row.price_odm),
      createdAt: this.toIsoString(row.created_at),
    };
  }

  private toNullableIsoString(value: Date | string | null): string | null {
    return value === null ? null : this.toIsoString(value);
  }

  private toIsoString(value: Date | string): string {
    if (value instanceof Date) {
      return value.toISOString();
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
  }
}
