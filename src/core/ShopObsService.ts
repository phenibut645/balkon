import { RowDataPacket } from "mysql2";
import pool from "../db.js";
import { obsRelayService } from "./ObsRelayService.js";

interface ObsShopStreamerRow extends RowDataPacket {
  streamer_id: number;
  ds_guild_id: string;
  guild_display_name: string | null;
  nickname: string;
  twitch_url: string | null;
  is_primary: number;
}

interface BotSettingRow extends RowDataPacket {
  setting_key: string;
  setting_value: string | null;
}

export type ObsStreamingStatus = "live" | "offline" | "unknown";

export type ObsShopStreamerView = {
  streamerId: number;
  discordGuildId: string;
  guildDisplayName: string | null;
  nickname: string;
  twitchUrl: string | null;
  isPrimary: boolean;
  obsAgentId: string | null;
  obsAgentOnline: boolean;
  streamingStatus: ObsStreamingStatus;
  lastSeenAt: string | null;
};

export type ObsMediaProductView = {
  id: string;
  kind: "image" | "gif";
  title: string;
  description: string;
  priceOdm: number;
  durationSeconds: number;
  previewUrl: string | null;
  enabled: boolean;
};

const OBS_AGENT_BINDING_PREFIX = "obs_agent_binding:";

export class ShopObsService {
  private static instance: ShopObsService;

  static getInstance(): ShopObsService {
    if (!ShopObsService.instance) {
      ShopObsService.instance = new ShopObsService();
    }

    return ShopObsService.instance;
  }

  async listObsShopStreamers(): Promise<ObsShopStreamerView[]> {
    const [rows] = await pool.query<ObsShopStreamerRow[]>(
      `SELECT
          s.id AS streamer_id,
          g.ds_guild_id,
          g.display_name AS guild_display_name,
          s.nickname,
          s.twitch_url,
          gs.is_primary
       FROM guild_streamers AS gs
       INNER JOIN guilds AS g ON g.id = gs.guild_id
       INNER JOIN streamers AS s ON s.id = gs.streamer_id
       WHERE g.ds_guild_id IS NOT NULL AND g.ds_guild_id <> ''
       ORDER BY gs.is_primary DESC, s.nickname ASC`
    );

    const agentBindings = await this.loadStreamerAgentBindings(rows.map(row => row.streamer_id));

    return rows.map(row => {
      const agentId = agentBindings.get(row.streamer_id) ?? null;
      return {
        streamerId: row.streamer_id,
        discordGuildId: row.ds_guild_id,
        guildDisplayName: row.guild_display_name || row.ds_guild_id,
        nickname: row.nickname,
        twitchUrl: row.twitch_url,
        isPrimary: Boolean(row.is_primary),
        obsAgentId: agentId,
        obsAgentOnline: Boolean(agentId && obsRelayService.isAgentConnected(agentId)),
        streamingStatus: "unknown",
        lastSeenAt: null,
      };
    });
  }

  async getObsShopStreamerDetails(streamerId: number): Promise<ObsShopStreamerView | null> {
    const streamers = await this.listObsShopStreamers();
    const streamer = streamers.find(item => item.streamerId === streamerId);
    return streamer || null;
  }

  getObsMediaProducts(): ObsMediaProductView[] {
    return [
      {
        id: "image_5s_default",
        kind: "image",
        title: "Show image",
        description: "Display a static image in OBS for 5 seconds.",
        priceOdm: 50,
        durationSeconds: 5,
        previewUrl: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=640&q=80&auto=format&fit=crop",
        enabled: false,
      },
      {
        id: "gif_5s_cat",
        kind: "gif",
        title: "Show GIF",
        description: "Display an animated GIF in OBS for 5 seconds.",
        priceOdm: 100,
        durationSeconds: 5,
        previewUrl: "https://media.tenor.com/SxzG9vFWtTcAAAAM/zxc-cat.gif",
        enabled: false,
      },
    ];
  }

  private async loadStreamerAgentBindings(streamerIds: number[]): Promise<Map<number, string>> {
    const bindings = new Map<number, string>();
    if (!streamerIds.length) {
      return bindings;
    }

    const [rows] = await pool.query<BotSettingRow[]>(
      `SELECT setting_key, setting_value FROM bot_settings WHERE setting_key LIKE ?`,
      [`${OBS_AGENT_BINDING_PREFIX}%`]
    );

    for (const row of rows) {
      const settingKey = String(row.setting_key ?? "");
      const idPart = settingKey.replace(OBS_AGENT_BINDING_PREFIX, "");
      const streamerId = Number(idPart);
      if (!Number.isInteger(streamerId) || !streamerIds.includes(streamerId) || !row.setting_value) {
        continue;
      }

      try {
        const parsed = JSON.parse(String(row.setting_value)) as { agentId?: string };
        const agentId = typeof parsed.agentId === "string" ? parsed.agentId.trim() : "";
        if (!agentId.length) {
          continue;
        }

        bindings.set(streamerId, agentId);
      } catch {
        continue;
      }
    }

    return bindings;
  }
}
