import { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../db.js";
import { itemService } from "./ItemService.js";
import { streamerService } from "./StreamerService.js";

export type StreamerApplicationStatus = "pending" | "approved" | "rejected";
export type StreamerApplicationListStatus = StreamerApplicationStatus | "all";

export interface CreateStreamerApplicationInput {
  discordGuildId: string;
  requestedNickname: string;
  twitchUrl?: string | null;
  description?: string | null;
}

export interface RejectStreamerApplicationInput {
  reason?: string | null;
}

export interface StreamerApplicationView {
  id: number;
  discordGuildId: string;
  requestedNickname: string;
  twitchUrl: string | null;
  description: string | null;
  status: StreamerApplicationStatus;
  streamerId: number | null;
  streamerActive: boolean | null;
  streamerArchivedAt: string | null;
  rejectionReason: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  applicant?: {
    memberId: number;
    discordId: string;
    username: string | null;
    globalName: string | null;
    avatarUrl: string | null;
    displayName: string;
  };
}

interface StreamerApplicationRow extends RowDataPacket {
  id: number;
  applicant_member_id: number;
  applicant_discord_id?: string | null;
  applicant_username?: string | null;
  applicant_global_name?: string | null;
  applicant_avatar_url?: string | null;
  discord_guild_id: string;
  requested_nickname: string;
  twitch_url: string | null;
  description: string | null;
  status: StreamerApplicationStatus;
  reviewed_by_member_id: number | null;
  streamer_id: number | null;
  streamer_active: number | boolean | null;
  streamer_archived_at: Date | string | null;
  reviewed_at: Date | string | null;
  rejection_reason: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface NormalizedStreamerApplicationInput {
  discordGuildId: string;
  requestedNickname: string;
  twitchUrl: string | null;
  description: string | null;
}

export class StreamerApplicationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export class StreamerApplicationService {
  private static instance: StreamerApplicationService;

  static getInstance(): StreamerApplicationService {
    if (!StreamerApplicationService.instance) {
      StreamerApplicationService.instance = new StreamerApplicationService();
    }

    return StreamerApplicationService.instance;
  }

  async getMyApplications(applicantDiscordId: string): Promise<StreamerApplicationView[]> {
    const applicant = await itemService.ensureMemberByDiscordId(applicantDiscordId);
    const [rows] = await pool.query<StreamerApplicationRow[]>(
      `${this.baseSelectSql()}
       WHERE sa.applicant_member_id = ?
       ORDER BY sa.created_at DESC`,
      [applicant.data.id],
    );

    return rows.map(row => this.mapApplication(row, true));
  }

  async submitApplication(applicantDiscordId: string, payload: CreateStreamerApplicationInput): Promise<StreamerApplicationView> {
    const applicant = await itemService.ensureMemberByDiscordId(applicantDiscordId);
    const input = this.normalizeSubmitInput(payload);

    const [duplicates] = await pool.query<RowDataPacket[]>(
      `SELECT id
       FROM streamer_applications
       WHERE applicant_member_id = ?
         AND discord_guild_id = ?
         AND status = 'pending'
       LIMIT 1`,
      [applicant.data.id, input.discordGuildId],
    );

    if (duplicates.length > 0) {
      throw new StreamerApplicationError(
        "STREAMER_APPLICATION_DUPLICATE_PENDING",
        "You already have a pending streamer application for this Discord server.",
      );
    }

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO streamer_applications (
          applicant_member_id,
          discord_guild_id,
          requested_nickname,
          twitch_url,
          description,
          status
       ) VALUES (?, ?, ?, ?, ?, 'pending')`,
      [
        applicant.data.id,
        input.discordGuildId,
        input.requestedNickname,
        input.twitchUrl,
        input.description,
      ],
    );

    return await this.getApplicationView(result.insertId, true);
  }

  async listApplicationsForAdmin(status: StreamerApplicationListStatus = "pending"): Promise<StreamerApplicationView[]> {
    const values: unknown[] = [];
    const statusCondition = status === "all" ? "" : "WHERE sa.status = ?";
    if (status !== "all") {
      values.push(status);
    }

    const [rows] = await pool.query<StreamerApplicationRow[]>(
      `${this.baseSelectSql()}
       ${statusCondition}
       ORDER BY sa.created_at DESC`,
      values,
    );

    return rows.map(row => this.mapApplication(row, true));
  }

  async approveApplication(adminDiscordId: string, applicationId: number): Promise<{ application: StreamerApplicationView; streamerId: number | null }> {
    const admin = await itemService.ensureMemberByDiscordId(adminDiscordId);
    const application = await this.getApplicationRow(applicationId);

    if (application.status === "approved") {
      return {
        application: this.mapApplication(application, true),
        streamerId: application.streamer_id,
      };
    }

    if (application.status !== "pending") {
      throw new StreamerApplicationError("STREAMER_APPLICATION_APPROVE_FAILED", "Only pending applications can be approved.");
    }

    const applicantDiscordId = application.applicant_discord_id;
    if (!applicantDiscordId) {
      throw new StreamerApplicationError("STREAMER_APPLICATION_APPROVE_FAILED", "Applicant member is missing.");
    }

    const registerResponse = await streamerService.registerGuildStreamer({
      discordGuildId: application.discord_guild_id,
      nickname: application.requested_nickname,
      twitchUrl: application.twitch_url,
      createdByDiscordId: applicantDiscordId,
    });

    if (!registerResponse.success) {
      throw new StreamerApplicationError(
        "STREAMER_APPLICATION_APPROVE_FAILED",
        registerResponse.error.message ?? "Failed to create streamer access.",
      );
    }

    await pool.query(
      `UPDATE streamer_applications
       SET status = 'approved',
           reviewed_by_member_id = ?,
           reviewed_at = CURRENT_TIMESTAMP,
           streamer_id = ?,
           rejection_reason = NULL
       WHERE id = ?`,
      [admin.data.id, registerResponse.data.streamerId, applicationId],
    );

    return {
      application: await this.getApplicationView(applicationId, true),
      streamerId: registerResponse.data.streamerId,
    };
  }

  async rejectApplication(adminDiscordId: string, applicationId: number, input: RejectStreamerApplicationInput = {}): Promise<StreamerApplicationView> {
    const admin = await itemService.ensureMemberByDiscordId(adminDiscordId);
    const application = await this.getApplicationRow(applicationId);

    if (application.status === "rejected") {
      return this.mapApplication(application, true);
    }

    if (application.status !== "pending") {
      throw new StreamerApplicationError("STREAMER_APPLICATION_REJECT_FAILED", "Only pending applications can be rejected.");
    }

    const reason = this.normalizeOptionalText(input.reason, 500, "Rejection reason");
    await pool.query(
      `UPDATE streamer_applications
       SET status = 'rejected',
           reviewed_by_member_id = ?,
           reviewed_at = CURRENT_TIMESTAMP,
           rejection_reason = ?
       WHERE id = ?`,
      [admin.data.id, reason, applicationId],
    );

    return await this.getApplicationView(applicationId, true);
  }

  isApplicationError(error: unknown): error is StreamerApplicationError {
    return error instanceof StreamerApplicationError;
  }

  private async getApplicationView(applicationId: number, includeApplicant: boolean): Promise<StreamerApplicationView> {
    const row = await this.getApplicationRow(applicationId);
    return this.mapApplication(row, includeApplicant);
  }

  private async getApplicationRow(applicationId: number): Promise<StreamerApplicationRow> {
    const [rows] = await pool.query<StreamerApplicationRow[]>(
      `${this.baseSelectSql()}
       WHERE sa.id = ?
       LIMIT 1`,
      [applicationId],
    );

    if (!rows.length) {
      throw new StreamerApplicationError("STREAMER_APPLICATION_NOT_FOUND", "Streamer application not found.");
    }

    return rows[0];
  }

  private baseSelectSql(): string {
    return `SELECT
        sa.id,
        sa.applicant_member_id,
        applicant.ds_member_id AS applicant_discord_id,
        applicant.discord_username AS applicant_username,
        applicant.discord_global_name AS applicant_global_name,
        applicant.discord_avatar_url AS applicant_avatar_url,
        sa.discord_guild_id,
        sa.requested_nickname,
        sa.twitch_url,
        sa.description,
        sa.status,
        sa.reviewed_by_member_id,
        sa.streamer_id,
        CASE
          WHEN sa.streamer_id IS NULL THEN NULL
          WHEN s.id IS NULL THEN 0
          WHEN s.archived_at IS NULL THEN 1
          ELSE 0
        END AS streamer_active,
        s.archived_at AS streamer_archived_at,
        sa.reviewed_at,
        sa.rejection_reason,
        sa.created_at,
        sa.updated_at
      FROM streamer_applications AS sa
      INNER JOIN members AS applicant ON applicant.id = sa.applicant_member_id
      LEFT JOIN streamers AS s ON s.id = sa.streamer_id`;
  }

  private normalizeSubmitInput(payload: CreateStreamerApplicationInput): NormalizedStreamerApplicationInput {
    return {
      discordGuildId: this.normalizeDiscordGuildId(payload.discordGuildId),
      requestedNickname: this.normalizeRequiredText(payload.requestedNickname, 100, "Streamer nickname"),
      twitchUrl: this.normalizeTwitchUrl(payload.twitchUrl),
      description: this.normalizeOptionalText(payload.description, 1000, "Description"),
    };
  }

  private normalizeDiscordGuildId(value: unknown): string {
    if (typeof value !== "string") {
      throw new StreamerApplicationError("STREAMER_APPLICATION_INVALID", "Discord server id is required.");
    }

    const normalized = value.trim();
    if (!/^\d{5,32}$/.test(normalized)) {
      throw new StreamerApplicationError("STREAMER_APPLICATION_INVALID", "Discord server id must be a valid Discord snowflake.");
    }

    return normalized;
  }

  private normalizeRequiredText(value: unknown, maxLength: number, fieldName: string): string {
    if (typeof value !== "string") {
      throw new StreamerApplicationError("STREAMER_APPLICATION_INVALID", `${fieldName} is required.`);
    }

    const normalized = value.trim();
    if (!normalized) {
      throw new StreamerApplicationError("STREAMER_APPLICATION_INVALID", `${fieldName} is required.`);
    }

    if (normalized.length > maxLength) {
      throw new StreamerApplicationError("STREAMER_APPLICATION_INVALID", `${fieldName} must be ${maxLength} characters or less.`);
    }

    return normalized;
  }

  private normalizeOptionalText(value: unknown, maxLength: number, fieldName: string): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value !== "string") {
      throw new StreamerApplicationError("STREAMER_APPLICATION_INVALID", `${fieldName} must be a string.`);
    }

    const normalized = value.trim();
    if (!normalized) {
      return null;
    }

    if (normalized.length > maxLength) {
      throw new StreamerApplicationError("STREAMER_APPLICATION_INVALID", `${fieldName} must be ${maxLength} characters or less.`);
    }

    return normalized;
  }

  private normalizeTwitchUrl(value: unknown): string | null {
    const normalized = this.normalizeOptionalText(value, 255, "Twitch URL");
    if (!normalized) {
      return null;
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(normalized);
    } catch {
      throw new StreamerApplicationError("STREAMER_APPLICATION_INVALID", "Twitch URL must be a valid absolute URL.");
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new StreamerApplicationError("STREAMER_APPLICATION_INVALID", "Twitch URL must start with http:// or https://.");
    }

    return parsedUrl.toString();
  }

  private mapApplication(row: StreamerApplicationRow, includeApplicant: boolean): StreamerApplicationView {
    const applicantDiscordId = row.applicant_discord_id ?? "";
    const applicantGlobalName = row.applicant_global_name ?? null;
    const applicantUsername = row.applicant_username ?? null;
    const streamerActive = row.streamer_active === null || row.streamer_active === undefined
      ? null
      : Boolean(Number(row.streamer_active));

    return {
      id: Number(row.id),
      discordGuildId: row.discord_guild_id,
      requestedNickname: row.requested_nickname,
      twitchUrl: row.twitch_url,
      description: row.description,
      status: row.status,
      streamerId: row.streamer_id === null ? null : Number(row.streamer_id),
      streamerActive,
      streamerArchivedAt: this.formatDate(row.streamer_archived_at),
      rejectionReason: row.rejection_reason,
      reviewedAt: this.formatDate(row.reviewed_at),
      createdAt: this.formatDate(row.created_at) ?? new Date(0).toISOString(),
      updatedAt: this.formatDate(row.updated_at) ?? new Date(0).toISOString(),
      applicant: includeApplicant
        ? {
            memberId: Number(row.applicant_member_id),
            discordId: applicantDiscordId,
            username: applicantUsername,
            globalName: applicantGlobalName,
            avatarUrl: row.applicant_avatar_url ?? null,
            displayName: applicantGlobalName || applicantUsername || applicantDiscordId,
          }
        : undefined,
    };
  }

  private formatDate(value: Date | string | null): string | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return date.toISOString();
  }
}

export const streamerApplicationService = StreamerApplicationService.getInstance();
