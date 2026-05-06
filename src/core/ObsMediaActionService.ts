import { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../db.js";

export type ObsMediaActionStatus = "pending" | "sent" | "failed" | "refunded";
export type ObsMediaProductKind = "image" | "gif";

export interface ObsMediaActionView {
  id: number;
  buyerDiscordId: string;
  buyerDisplayName: string | null;
  streamerId: number;
  streamerNickname: string;
  agentId: string | null;
  productId: string;
  productKind: ObsMediaProductKind;
  productTitle: string;
  mediaUrl: string;
  priceOdm: number;
  durationMs: number;
  status: ObsMediaActionStatus;
  commandId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  refundedOdm: number;
  createdAt: string;
  sentAt: string | null;
  failedAt: string | null;
  refundedAt: string | null;
}

export interface ObsMediaActionListResult {
  actions: ObsMediaActionView[];
  page: number;
  pageSize: number;
  total: number;
}

interface ObsMediaActionRow extends RowDataPacket {
  id: number | string;
  buyer_discord_id: string;
  buyer_display_name: string | null;
  streamer_id: number;
  streamer_nickname: string;
  agent_id: string | null;
  product_id: string;
  product_kind: ObsMediaProductKind;
  product_title: string;
  media_url: string;
  price_odm: number | string;
  duration_ms: number;
  status: ObsMediaActionStatus;
  command_id: string | null;
  error_code: string | null;
  error_message: string | null;
  refunded_odm: number | string;
  created_at: Date | string;
  sent_at: Date | string | null;
  failed_at: Date | string | null;
  refunded_at: Date | string | null;
}

interface CountRow extends RowDataPacket {
  total: number | string;
}

export class ObsMediaActionService {
  private static instance: ObsMediaActionService;

  static getInstance(): ObsMediaActionService {
    if (!ObsMediaActionService.instance) {
      ObsMediaActionService.instance = new ObsMediaActionService();
    }

    return ObsMediaActionService.instance;
  }

  async createPending(input: {
    buyerMemberId: number;
    streamerId: number;
    agentId: string | null;
    productId: string;
    productKind: ObsMediaProductKind;
    productTitle: string;
    mediaUrl: string;
    priceOdm: number;
    durationMs: number;
  }): Promise<number> {
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO obs_media_actions (
          buyer_member_id,
          streamer_id,
          agent_id,
          product_id,
          product_kind,
          product_title,
          media_url,
          price_odm,
          duration_ms
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.buyerMemberId,
        input.streamerId,
        input.agentId,
        input.productId,
        input.productKind,
        input.productTitle,
        input.mediaUrl,
        input.priceOdm,
        input.durationMs,
      ],
    );

    return result.insertId;
  }

  async markSent(actionId: number, commandId?: string | number | null): Promise<void> {
    await pool.query(
      `UPDATE obs_media_actions
       SET status = 'sent',
           command_id = COALESCE(?, command_id),
           sent_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [commandId === undefined || commandId === null ? null : String(commandId), actionId],
    );
  }

  async markFailed(actionId: number, errorCode: string, errorMessage: string): Promise<void> {
    await pool.query(
      `UPDATE obs_media_actions
       SET status = 'failed',
           error_code = ?,
           error_message = ?,
           failed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [errorCode, errorMessage, actionId],
    );
  }

  async markRefunded(
    actionId: number,
    refundedOdm: number,
    errorCode?: string | null,
    errorMessage?: string | null,
  ): Promise<void> {
    await pool.query(
      `UPDATE obs_media_actions
       SET status = 'refunded',
           refunded_odm = ?,
           error_code = COALESCE(?, error_code),
           error_message = COALESCE(?, error_message),
           refunded_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [refundedOdm, errorCode ?? null, errorMessage ?? null, actionId],
    );
  }

  async listForCurrentUser(discordId: string, options: { page: number; pageSize: number }): Promise<ObsMediaActionListResult> {
    const page = Math.max(1, options.page);
    const pageSize = Math.max(1, Math.min(50, options.pageSize));
    const offset = (page - 1) * pageSize;

    const [countRows] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) AS total
       FROM obs_media_actions AS oma
       INNER JOIN members AS buyer ON buyer.id = oma.buyer_member_id
       WHERE buyer.ds_member_id = ?`,
      [discordId],
    );

    const [rows] = await pool.query<ObsMediaActionRow[]>(
      `${this.baseSelectSql()}
       WHERE buyer.ds_member_id = ?
       ORDER BY oma.created_at DESC, oma.id DESC
       LIMIT ? OFFSET ?`,
      [discordId, pageSize, offset],
    );

    return {
      actions: rows.map(row => this.toView(row)),
      page,
      pageSize,
      total: Number(countRows[0]?.total ?? 0),
    };
  }

  async listAdmin(options: { page: number; pageSize: number; status?: ObsMediaActionStatus | null }): Promise<ObsMediaActionListResult> {
    const page = Math.max(1, options.page);
    const pageSize = Math.max(1, Math.min(50, options.pageSize));
    const offset = (page - 1) * pageSize;
    const whereSql = options.status ? "WHERE oma.status = ?" : "";
    const queryParams = options.status ? [options.status] : [];

    const [countRows] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) AS total
       FROM obs_media_actions AS oma
       ${whereSql}`,
      queryParams,
    );

    const [rows] = await pool.query<ObsMediaActionRow[]>(
      `${this.baseSelectSql()}
       ${whereSql}
       ORDER BY oma.created_at DESC, oma.id DESC
       LIMIT ? OFFSET ?`,
      [...queryParams, pageSize, offset],
    );

    return {
      actions: rows.map(row => this.toView(row)),
      page,
      pageSize,
      total: Number(countRows[0]?.total ?? 0),
    };
  }

  private baseSelectSql(): string {
    return `SELECT
        oma.id,
        buyer.ds_member_id AS buyer_discord_id,
        COALESCE(NULLIF(buyer.discord_global_name, ''), NULLIF(buyer.discord_username, ''), 'Unknown Discord user') AS buyer_display_name,
        oma.streamer_id,
        streamer.nickname AS streamer_nickname,
        oma.agent_id,
        oma.product_id,
        oma.product_kind,
        oma.product_title,
        oma.media_url,
        oma.price_odm,
        oma.duration_ms,
        oma.status,
        oma.command_id,
        oma.error_code,
        oma.error_message,
        oma.refunded_odm,
        oma.created_at,
        oma.sent_at,
        oma.failed_at,
        oma.refunded_at
      FROM obs_media_actions AS oma
      INNER JOIN members AS buyer ON buyer.id = oma.buyer_member_id
      INNER JOIN streamers AS streamer ON streamer.id = oma.streamer_id`;
  }

  private toView(row: ObsMediaActionRow): ObsMediaActionView {
    return {
      id: Number(row.id),
      buyerDiscordId: String(row.buyer_discord_id),
      buyerDisplayName: row.buyer_display_name || "Unknown Discord user",
      streamerId: Number(row.streamer_id),
      streamerNickname: String(row.streamer_nickname),
      agentId: row.agent_id,
      productId: String(row.product_id),
      productKind: row.product_kind,
      productTitle: String(row.product_title),
      mediaUrl: String(row.media_url),
      priceOdm: Number(row.price_odm),
      durationMs: Number(row.duration_ms),
      status: row.status,
      commandId: row.command_id,
      errorCode: row.error_code,
      errorMessage: row.error_message,
      refundedOdm: Number(row.refunded_odm),
      createdAt: this.toIsoString(row.created_at),
      sentAt: this.toNullableIsoString(row.sent_at),
      failedAt: this.toNullableIsoString(row.failed_at),
      refundedAt: this.toNullableIsoString(row.refunded_at),
    };
  }

  private toNullableIsoString(value: Date | string | null): string | null {
    if (value === null) {
      return null;
    }

    return this.toIsoString(value);
  }

  private toIsoString(value: Date | string): string {
    if (value instanceof Date) {
      return value.toISOString();
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
  }
}
