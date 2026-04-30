import { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../db.js";

export type NotificationSeverity = "info" | "success" | "warning" | "danger";

export type NotificationView = {
  id: number;
  type: string;
  severity: NotificationSeverity;
  title: string;
  body: string;
  imageUrl: string | null;
  linkUrl: string | null;
  readAt: string | null;
  createdAt: string;
};

export type ListNotificationsOptions = {
  page?: number;
  pageSize?: number;
  unreadOnly?: boolean;
  type?: string | null;
};

export type NotificationCreateInput = {
  type?: string;
  severity?: NotificationSeverity;
  title: string;
  body: string;
  imageUrl?: string | null;
  linkUrl?: string | null;
  metadataJson?: Record<string, unknown> | null;
  createdByMemberId?: number | null;
};

interface NotificationRow extends RowDataPacket {
  id: number;
  type: string;
  severity: NotificationSeverity;
  title: string;
  body: string;
  image_url: string | null;
  link_url: string | null;
  read_at: Date | null;
  created_at: Date;
}

interface CountRow extends RowDataPacket {
  total: number;
}

interface MemberIdRow extends RowDataPacket {
  id: number;
}

export class NotificationService {
  private static instance: NotificationService;

  static getInstance(): NotificationService {
    if (!NotificationService.instance) {
      NotificationService.instance = new NotificationService();
    }

    return NotificationService.instance;
  }

  async listForUser(discordId: string, options: ListNotificationsOptions): Promise<{
    items: NotificationView[];
    page: number;
    pageSize: number;
    total: number;
    unreadCount: number;
  }> {
    const memberId = await this.resolveMemberId(discordId);

    const page = Number.isInteger(options.page) && (options.page ?? 0) > 0 ? Number(options.page) : 1;
    const pageSizeRaw = Number.isInteger(options.pageSize) && (options.pageSize ?? 0) > 0 ? Number(options.pageSize) : 10;
    const pageSize = Math.min(50, Math.max(1, pageSizeRaw));
    const offset = (page - 1) * pageSize;
    const unreadOnly = Boolean(options.unreadOnly);
    const normalizedType = options.type && options.type.trim().length ? options.type.trim() : null;

    const filters: string[] = ["member_id = ?"];
    const filterValues: Array<number | string> = [memberId];

    if (unreadOnly) {
      filters.push("read_at IS NULL");
    }

    if (normalizedType) {
      filters.push("type = ?");
      filterValues.push(normalizedType);
    }

    const whereClause = filters.join(" AND ");

    const [itemsRows] = await pool.query<NotificationRow[]>(
      `SELECT id, type, severity, title, body, image_url, link_url, read_at, created_at
       FROM notifications
       WHERE ${whereClause}
       ORDER BY created_at DESC, id DESC
       LIMIT ? OFFSET ?`,
      [...filterValues, pageSize, offset],
    );

    const [totalRows] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) AS total
       FROM notifications
       WHERE ${whereClause}`,
      filterValues,
    );

    const [unreadRows] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) AS total
       FROM notifications
       WHERE member_id = ? AND read_at IS NULL`,
      [memberId],
    );

    return {
      items: itemsRows.map(row => this.mapNotificationRow(row)),
      page,
      pageSize,
      total: Number(totalRows[0]?.total ?? 0),
      unreadCount: Number(unreadRows[0]?.total ?? 0),
    };
  }

  async getUnreadCount(discordId: string): Promise<number> {
    const memberId = await this.resolveMemberId(discordId);
    const [rows] = await pool.query<CountRow[]>(
      `SELECT COUNT(*) AS total
       FROM notifications
       WHERE member_id = ? AND read_at IS NULL`,
      [memberId],
    );

    return Number(rows[0]?.total ?? 0);
  }

  async listLatest(discordId: string, limit = 3): Promise<NotificationView[]> {
    const memberId = await this.resolveMemberId(discordId);
    const safeLimit = Math.max(1, Math.min(10, Math.floor(limit)));
    const [rows] = await pool.query<NotificationRow[]>(
      `SELECT id, type, severity, title, body, image_url, link_url, read_at, created_at
       FROM notifications
       WHERE member_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT ?`,
      [memberId, safeLimit],
    );

    return rows.map(row => this.mapNotificationRow(row));
  }

  async markRead(discordId: string, notificationId: number): Promise<boolean> {
    const memberId = await this.resolveMemberId(discordId);
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE notifications
       SET read_at = COALESCE(read_at, NOW())
       WHERE id = ? AND member_id = ?`,
      [notificationId, memberId],
    );

    return result.affectedRows > 0;
  }

  async markAllRead(discordId: string): Promise<number> {
    const memberId = await this.resolveMemberId(discordId);
    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE notifications
       SET read_at = NOW()
       WHERE member_id = ? AND read_at IS NULL`,
      [memberId],
    );

    return result.affectedRows;
  }

  async createForMember(memberId: number, input: NotificationCreateInput): Promise<number> {
    const payload = this.normalizeInput(input);
    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO notifications (
          member_id,
          type,
          severity,
          title,
          body,
          image_url,
          link_url,
          metadata_json,
          created_by_member_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        memberId,
        payload.type,
        payload.severity,
        payload.title,
        payload.body,
        payload.imageUrl,
        payload.linkUrl,
        payload.metadataJson,
        payload.createdByMemberId,
      ],
    );

    return Number(result.insertId);
  }

  async broadcastToAllMembers(createdByDiscordId: string, input: NotificationCreateInput): Promise<number> {
    const payload = this.normalizeInput(input);
    const createdByMemberId = await this.resolveMemberId(createdByDiscordId);

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [result] = await connection.query<ResultSetHeader>(
        `INSERT INTO notifications (
            member_id,
            type,
            severity,
            title,
            body,
            image_url,
            link_url,
            metadata_json,
            created_by_member_id
         )
         SELECT
            m.id,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?,
            ?
         FROM members AS m`,
        [
          payload.type,
          payload.severity,
          payload.title,
          payload.body,
          payload.imageUrl,
          payload.linkUrl,
          payload.metadataJson,
          createdByMemberId,
        ],
      );

      await connection.commit();
      return result.affectedRows;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  private mapNotificationRow(row: NotificationRow): NotificationView {
    return {
      id: Number(row.id),
      type: String(row.type),
      severity: row.severity,
      title: String(row.title),
      body: String(row.body),
      imageUrl: row.image_url ? String(row.image_url) : null,
      linkUrl: row.link_url ? String(row.link_url) : null,
      readAt: row.read_at ? new Date(row.read_at).toISOString() : null,
      createdAt: new Date(row.created_at).toISOString(),
    };
  }

  private normalizeInput(input: NotificationCreateInput): {
    type: string;
    severity: NotificationSeverity;
    title: string;
    body: string;
    imageUrl: string | null;
    linkUrl: string | null;
    metadataJson: string | null;
    createdByMemberId: number | null;
  } {
    const title = this.normalizeRequiredText(input.title, 160, "title");
    const body = this.normalizeRequiredText(input.body, 2000, "body");
    const type = this.normalizeOptionalText(input.type, 64) || "system";
    const severity: NotificationSeverity = ["info", "success", "warning", "danger"].includes(String(input.severity))
      ? (input.severity as NotificationSeverity)
      : "info";
    const imageUrl = this.normalizeOptionalText(input.imageUrl, 1000);
    const linkUrl = this.normalizeOptionalText(input.linkUrl, 1000);
    const metadataJson = input.metadataJson ? JSON.stringify(input.metadataJson) : null;

    return {
      type,
      severity,
      title,
      body,
      imageUrl,
      linkUrl,
      metadataJson,
      createdByMemberId: input.createdByMemberId ?? null,
    };
  }

  private normalizeRequiredText(value: unknown, maxLength: number, field: string): string {
    if (typeof value !== "string") {
      throw new Error(`${field} is required.`);
    }

    const normalized = value.trim();
    if (!normalized.length) {
      throw new Error(`${field} is required.`);
    }

    if (normalized.length > maxLength) {
      throw new Error(`${field} must be ${maxLength} characters or less.`);
    }

    return normalized;
  }

  private normalizeOptionalText(value: unknown, maxLength: number): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value !== "string") {
      return null;
    }

    const normalized = value.trim();
    if (!normalized.length) {
      return null;
    }

    if (normalized.length > maxLength) {
      throw new Error(`Value must be ${maxLength} characters or less.`);
    }

    return normalized;
  }

  private async resolveMemberId(discordId: string): Promise<number> {
    await this.ensureMember(discordId);
    const [rows] = await pool.query<MemberIdRow[]>(
      `SELECT id FROM members WHERE ds_member_id = ? LIMIT 1`,
      [discordId],
    );

    if (!rows.length) {
      throw new Error("Member not found.");
    }

    return Number(rows[0].id);
  }

  private async ensureMember(discordId: string): Promise<void> {
    await pool.query(
      `INSERT INTO members (ds_member_id, balance, ldm_balance, locale)
       VALUES (?, 0, 0, 'en')
       ON DUPLICATE KEY UPDATE ds_member_id = VALUES(ds_member_id)`,
      [discordId],
    );
  }
}
