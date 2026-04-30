import { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../db.js";
import { obsAgentStatusService, ObsAgentStatusView } from "./ObsAgentStatusService.js";
import { getBotCommandQueue } from "./BotCommandQueue.js";
import { NotificationService } from "./NotificationService.js";
import { ObsMediaActionService } from "./ObsMediaActionService.js";
import { ObsRelayMediaShowPayload } from "../types/obs-agent.types.js";

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

interface MemberBalanceRow extends RowDataPacket {
  id: number;
  balance: number;
  ds_member_id: string;
  discord_username: string | null;
  discord_global_name: string | null;
}

interface BotCommandStatusRow extends RowDataPacket {
  id: number;
  status: "pending" | "processing" | "completed" | "failed";
  result_json: string | null;
  error_message: string | null;
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
  obsAgentLastSeenAt: string | null;
  obsAgentConnectedAt: string | null;
  obsAgentDisconnectedAt: string | null;
  obsAgentLastError: string | null;
  obsAgentStatusSource: "database";
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

type ObsMediaProductConfig = ObsMediaProductView & {
  mediaUrl: string;
};

export type ObsMediaPurchaseResult = {
  streamerId: number;
  productId: string;
  priceOdm: number;
  balanceAfter: number;
  commandId?: string;
};

const OBS_AGENT_BINDING_PREFIX = "obs_agent_binding:";
const OBS_AGENT_STALE_MS = 120_000;
const OBS_MEDIA_COMMAND_TIMEOUT_MS = 20_000;
const OBS_MEDIA_COMMAND_POLL_MS = 400;

class ShopObsServiceError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "ShopObsServiceError";
  }
}

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
    const agentIds = Array.from(new Set(Array.from(agentBindings.values())));
    const statuses = await obsAgentStatusService.getStatuses(agentIds);

    return rows.map(row => {
      const agentId = agentBindings.get(row.streamer_id) ?? null;
      const status = agentId ? statuses.get(agentId) ?? null : null;
      const lastSeenAt = status?.lastSeenAt ?? null;

      return {
        streamerId: row.streamer_id,
        discordGuildId: row.ds_guild_id,
        guildDisplayName: row.guild_display_name || row.ds_guild_id,
        nickname: row.nickname,
        twitchUrl: row.twitch_url,
        isPrimary: Boolean(row.is_primary),
        obsAgentId: agentId,
        obsAgentOnline: this.isAgentStatusOnline(status),
        obsAgentLastSeenAt: lastSeenAt,
        obsAgentConnectedAt: status?.connectedAt ?? null,
        obsAgentDisconnectedAt: status?.disconnectedAt ?? null,
        obsAgentLastError: status?.lastError ?? null,
        obsAgentStatusSource: "database",
        streamingStatus: "unknown",
        lastSeenAt,
      };
    });
  }

  async getObsShopStreamerDetails(streamerId: number): Promise<ObsShopStreamerView | null> {
    const streamers = await this.listObsShopStreamers();
    const streamer = streamers.find(item => item.streamerId === streamerId);
    return streamer || null;
  }

  getObsMediaProducts(): ObsMediaProductView[] {
    return this.getObsMediaProductCatalog().map(product => ({
      id: product.id,
      kind: product.kind,
      title: product.title,
      description: product.description,
      priceOdm: product.priceOdm,
      durationSeconds: product.durationSeconds,
      previewUrl: product.previewUrl,
      enabled: product.enabled,
    }));
  }

  async purchaseObsMedia(input: {
    discordId: string;
    streamerId: number;
    productId: string;
    amount?: number;
  }): Promise<ObsMediaPurchaseResult> {
    const amount = input.amount ?? 1;
    if (amount !== 1) {
      throw new ShopObsServiceError("OBS_MEDIA_PURCHASE_FAILED", "Only amount=1 is supported for OBS media purchases.");
    }

    const product = this.findObsMediaProduct(input.productId);
    if (!product) {
      throw new ShopObsServiceError("OBS_MEDIA_PRODUCT_NOT_FOUND", "OBS media product was not found.");
    }

    if (!product.enabled) {
      throw new ShopObsServiceError("OBS_MEDIA_PRODUCT_DISABLED", "OBS media product is disabled.");
    }

    const streamer = await this.getObsShopStreamerDetails(input.streamerId);
    if (!streamer) {
      throw new ShopObsServiceError("OBS_STREAMER_NOT_FOUND", "Streamer was not found.");
    }

    if (!streamer.obsAgentId) {
      throw new ShopObsServiceError("OBS_AGENT_NOT_CONFIGURED", "Streamer OBS Agent is not configured.");
    }

    if (!streamer.obsAgentOnline) {
      throw new ShopObsServiceError("OBS_AGENT_OFFLINE", "Streamer OBS Agent is offline.");
    }

    const buyer = await this.resolveMemberBalance(input.discordId);
    const charged = await this.tryChargeMember(buyer.id, product.priceOdm);
    if (!charged) {
      throw new ShopObsServiceError("NOT_ENOUGH_ODM", "Not enough ODM.");
    }

    const obsMediaActionService = ObsMediaActionService.getInstance();
    const queue = getBotCommandQueue();
    const mediaPayload: ObsRelayMediaShowPayload = {
      kind: product.kind,
      url: product.mediaUrl,
      durationMs: product.durationSeconds * 1000,
      title: product.title,
    };

    let commandId: number | null = null;
    let actionId: number | null = null;

    try {
      actionId = await obsMediaActionService.createPending({
        buyerMemberId: buyer.id,
        streamerId: streamer.streamerId,
        agentId: streamer.obsAgentId,
        productId: product.id,
        productKind: product.kind,
        productTitle: product.title,
        mediaUrl: product.mediaUrl,
        priceOdm: product.priceOdm,
        durationMs: mediaPayload.durationMs,
      });

      const queued = await queue.enqueue({
        type: "OBS_MEDIA_SHOW",
        guildId: streamer.discordGuildId,
        requestedByDiscordId: input.discordId,
        payload: {
          agentId: streamer.obsAgentId,
          streamerId: streamer.streamerId,
          streamerNickname: streamer.nickname,
          productId: product.id,
          media: mediaPayload,
          source: "shop_obs_media_purchase",
        },
      });

      commandId = queued.commandId;
      await this.waitForBotCommandCompletion(commandId, OBS_MEDIA_COMMAND_TIMEOUT_MS);
    } catch (error) {
      const errorCode = error instanceof ShopObsServiceError ? error.code : "OBS_MEDIA_COMMAND_FAILED";
      const message = error instanceof Error ? error.message : "OBS media command failed.";
      if (error instanceof ShopObsServiceError) {
        await this.refundFailedMediaPurchase({
          actionId,
          buyerMemberId: buyer.id,
          priceOdm: product.priceOdm,
          errorCode,
          errorMessage: message,
        });
        throw error;
      }

      await this.refundFailedMediaPurchase({
        actionId,
        buyerMemberId: buyer.id,
        priceOdm: product.priceOdm,
        errorCode,
        errorMessage: message,
      });
      throw new ShopObsServiceError("OBS_MEDIA_COMMAND_FAILED", message);
    }

    if (actionId !== null) {
      try {
        await obsMediaActionService.markSent(actionId, commandId);
      } catch (error) {
        console.error("Failed to mark OBS media action as sent", error);
      }
    }

    const balanceAfter = await this.getMemberBalanceById(buyer.id);

    void this.createBuyerSuccessNotification({
      memberId: buyer.id,
      streamerNickname: streamer.nickname,
      productTitle: product.title,
    });

    return {
      streamerId: streamer.streamerId,
      productId: product.id,
      priceOdm: product.priceOdm,
      balanceAfter,
      commandId: commandId === null ? undefined : String(commandId),
    };
  }

  isPurchaseError(error: unknown): error is { code: string; message: string } {
    return error instanceof ShopObsServiceError;
  }

  private getObsMediaProductCatalog(): ObsMediaProductConfig[] {
    return [
      {
        id: "image_5s_default",
        kind: "image",
        title: "Show image",
        description: "Display a static image in OBS for 5 seconds.",
        priceOdm: 50,
        durationSeconds: 5,
        mediaUrl: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1280&q=80&auto=format&fit=crop",
        previewUrl: "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=640&q=80&auto=format&fit=crop",
        enabled: true,
      },
      {
        id: "gif_5s_default",
        kind: "gif",
        title: "Show GIF",
        description: "Display an animated GIF in OBS for 5 seconds.",
        priceOdm: 100,
        durationSeconds: 5,
        mediaUrl: "https://media.tenor.com/SxzG9vFWtTcAAAAM/zxc-cat.gif",
        previewUrl: "https://media.tenor.com/SxzG9vFWtTcAAAAM/zxc-cat.gif",
        enabled: true,
      },
    ];
  }

  private findObsMediaProduct(productId: string): ObsMediaProductConfig | null {
    const normalizedProductId = productId.trim();
    if (!normalizedProductId.length) {
      return null;
    }

    return this.getObsMediaProductCatalog().find(product => product.id === normalizedProductId) ?? null;
  }

  private async loadStreamerAgentBindings(streamerIds: number[]): Promise<Map<number, string>> {
    const bindings = new Map<number, string>();
    if (!streamerIds.length) {
      return bindings;
    }

    const streamerIdsSet = new Set(streamerIds);

    const [rows] = await pool.query<BotSettingRow[]>(
      `SELECT setting_key, setting_value FROM bot_settings WHERE setting_key LIKE ?`,
      [`${OBS_AGENT_BINDING_PREFIX}%`]
    );

    for (const row of rows) {
      const settingKey = String(row.setting_key ?? "");
      const idPart = settingKey.replace(OBS_AGENT_BINDING_PREFIX, "");
      const streamerId = Number(idPart);
      if (!Number.isInteger(streamerId) || !streamerIdsSet.has(streamerId) || !row.setting_value) {
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

  private isAgentStatusOnline(status: ObsAgentStatusView | null): boolean {
    if (!status || !status.online || !status.lastSeenAt) {
      return false;
    }

    const lastSeenAtMs = Date.parse(status.lastSeenAt);
    if (Number.isNaN(lastSeenAtMs)) {
      return false;
    }

    return Date.now() - lastSeenAtMs <= OBS_AGENT_STALE_MS;
  }

  private async resolveMemberBalance(discordId: string): Promise<MemberBalanceRow> {
    const normalizedDiscordId = discordId.trim();
    if (!normalizedDiscordId.length) {
      throw new ShopObsServiceError("OBS_MEDIA_PURCHASE_FAILED", "Authenticated user is missing discord id.");
    }

    const [rows] = await pool.query<MemberBalanceRow[]>(
      `SELECT id, balance, ds_member_id, discord_username, discord_global_name
       FROM members
       WHERE ds_member_id = ?
       LIMIT 1`,
      [normalizedDiscordId],
    );

    const row = rows[0];
    if (row) {
      return row;
    }

    await pool.query(
      `INSERT INTO members (ds_member_id) VALUES (?)
       ON DUPLICATE KEY UPDATE ds_member_id = VALUES(ds_member_id)`,
      [normalizedDiscordId],
    );

    const [retryRows] = await pool.query<MemberBalanceRow[]>(
      `SELECT id, balance, ds_member_id, discord_username, discord_global_name
       FROM members
       WHERE ds_member_id = ?
       LIMIT 1`,
      [normalizedDiscordId],
    );

    if (!retryRows[0]) {
      throw new ShopObsServiceError("OBS_MEDIA_PURCHASE_FAILED", "Failed to resolve buyer member.");
    }

    return retryRows[0];
  }

  private async tryChargeMember(memberId: number, priceOdm: number): Promise<boolean> {
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE members
       SET balance = balance - ?
       WHERE id = ? AND balance >= ?`,
      [priceOdm, memberId, priceOdm],
    );

    return result.affectedRows === 1;
  }

  private async refundMember(memberId: number, priceOdm: number): Promise<void> {
    await pool.query(
      `UPDATE members SET balance = balance + ? WHERE id = ?`,
      [priceOdm, memberId],
    );
  }

  private async refundFailedMediaPurchase(input: {
    actionId: number | null;
    buyerMemberId: number;
    priceOdm: number;
    errorCode: string;
    errorMessage: string;
  }): Promise<void> {
    try {
      await this.refundMember(input.buyerMemberId, input.priceOdm);
    } catch (refundError) {
      const refundMessage = refundError instanceof Error ? refundError.message : "Unknown refund failure.";
      const combinedMessage = `${input.errorMessage} Refund failed: ${refundMessage}`;
      if (input.actionId !== null) {
        try {
          await ObsMediaActionService.getInstance().markFailed(
            input.actionId,
            "OBS_MEDIA_REFUND_FAILED",
            combinedMessage,
          );
        } catch (markError) {
          console.error("Failed to mark OBS media action refund failure", markError);
        }
      }

      throw new ShopObsServiceError("OBS_MEDIA_REFUND_FAILED", combinedMessage);
    }

    if (input.actionId !== null) {
      try {
        await ObsMediaActionService.getInstance().markRefunded(
          input.actionId,
          input.priceOdm,
          input.errorCode,
          input.errorMessage,
        );
      } catch (markError) {
        console.error("Failed to mark OBS media action as refunded", markError);
      }
    }
  }

  private async getMemberBalanceById(memberId: number): Promise<number> {
    const [rows] = await pool.query<Array<RowDataPacket & { balance: number }>>(
      `SELECT balance FROM members WHERE id = ? LIMIT 1`,
      [memberId],
    );

    return Number(rows[0]?.balance ?? 0);
  }

  private async waitForBotCommandCompletion(commandId: number, timeoutMs: number): Promise<void> {
    const startedAt = Date.now();

    while (Date.now() - startedAt <= timeoutMs) {
      const [rows] = await pool.query<BotCommandStatusRow[]>(
        `SELECT id, status, result_json, error_message
         FROM bot_commands
         WHERE id = ?
         LIMIT 1`,
        [commandId],
      );

      const row = rows[0];
      if (!row) {
        throw new ShopObsServiceError("OBS_MEDIA_COMMAND_FAILED", "OBS media command record disappeared.");
      }

      if (row.status === "completed") {
        return;
      }

      if (row.status === "failed") {
        throw new ShopObsServiceError("OBS_MEDIA_COMMAND_FAILED", row.error_message || "OBS media command failed.");
      }

      await new Promise(resolve => setTimeout(resolve, OBS_MEDIA_COMMAND_POLL_MS));
    }

    throw new ShopObsServiceError("OBS_MEDIA_COMMAND_FAILED", "OBS media command timed out.");
  }

  private async createBuyerSuccessNotification(input: {
    memberId: number;
    streamerNickname: string;
    productTitle: string;
  }): Promise<void> {
    try {
      await NotificationService.getInstance().createForMember(input.memberId, {
        type: "obs_media",
        severity: "success",
        title: "OBS effect sent",
        body: `Your media effect '${input.productTitle}' was sent to ${input.streamerNickname}.`,
        metadataJson: {
          streamerNickname: input.streamerNickname,
          productTitle: input.productTitle,
        },
      });
    } catch (error) {
      console.error("Failed to create OBS media purchase notification", error);
    }
  }
}
