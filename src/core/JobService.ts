import { ResultSetHeader, RowDataPacket } from "mysql2";
import { PoolConnection } from "mysql2/promise";
import pool from "../db.js";
import { ItemService } from "./ItemService.js";

export type JobView = {
  id: number;
  jobKey: string;
  titleRu: string;
  titleEn: string;
  titleEt: string;
  descriptionRu: string | null;
  descriptionEn: string | null;
  descriptionEt: string | null;
  iconUrl: string | null;
  rewardAmount: number;
  cooldownSeconds: number;
  enabled: boolean;
  rewardItemId: number | null;
  rewardItemName: string | null;
  rewardItemEmoji: string | null;
  rewardItemChancePercent: number | null;
  rewardItemQuantity: number | null;
  createdAt: string;
  updatedAt: string;
};

export type JobRunGrantedItem = {
  itemTemplateId: number;
  name: string;
  emoji: string | null;
  quantity: number;
};

export type JobRunResult = {
  jobId: number;
  rewardAmount: number;
  balanceAfter: number;
  grantedItems: JobRunGrantedItem[];
  nextAvailableAt: string;
};

export type JobMutationInput = {
  actorDiscordId: string;
  jobKey?: unknown;
  titleRu?: unknown;
  titleEn?: unknown;
  titleEt?: unknown;
  descriptionRu?: unknown;
  descriptionEn?: unknown;
  descriptionEt?: unknown;
  iconUrl?: unknown;
  rewardAmount?: unknown;
  cooldownSeconds?: unknown;
  enabled?: unknown;
  rewardItemId?: unknown;
  rewardItemChancePercent?: unknown;
  rewardItemQuantity?: unknown;
};

interface JobRow extends RowDataPacket {
  id: number | string;
  job_key: string;
  title_ru: string;
  title_en: string;
  title_et: string;
  description_ru: string | null;
  description_en: string | null;
  description_et: string | null;
  icon_url: string | null;
  reward_amount: number | string;
  cooldown_seconds: number | string;
  enabled: number | boolean;
  reward_item_id: number | string | null;
  reward_item_name: string | null;
  reward_item_emoji: string | null;
  reward_item_chance_percent: number | string | null;
  reward_item_quantity: number | string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface MemberBalanceRow extends RowDataPacket {
  balance: number | string;
}

interface CooldownRow extends RowDataPacket {
  id: number | string;
  last_run_at: Date | string;
}

interface ItemIdentityRow extends RowDataPacket {
  id: number | string;
  name: string;
  emoji: string | null;
}

type NormalizedJobPayload = {
  jobKey: string;
  titleRu: string;
  titleEn: string;
  titleEt: string;
  descriptionRu: string | null;
  descriptionEn: string | null;
  descriptionEt: string | null;
  iconUrl: string | null;
  rewardAmount: number;
  cooldownSeconds: number;
  enabled: boolean;
  rewardItemId: number | null;
  rewardItemChancePercent: number | null;
  rewardItemQuantity: number | null;
};

const JOB_KEY_RE = /^[a-z0-9_-]{1,64}$/;

class JobServiceError extends Error {
  code: string;
  details?: Record<string, unknown>;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

export class JobService {
  private static instance: JobService;

  static getInstance(): JobService {
    if (!JobService.instance) {
      JobService.instance = new JobService();
    }

    return JobService.instance;
  }

  isJobServiceError(error: unknown): error is JobServiceError {
    return error instanceof JobServiceError;
  }

  async listJobs(): Promise<JobView[]> {
    const [rows] = await pool.query<JobRow[]>(
      `SELECT
          j.id,
          j.job_key,
          j.title_ru,
          j.title_en,
          j.title_et,
          j.description_ru,
          j.description_en,
          j.description_et,
          j.icon_url,
          j.reward_amount,
          j.cooldown_seconds,
          j.enabled,
          j.reward_item_id,
          i.name AS reward_item_name,
          i.emoji AS reward_item_emoji,
          j.reward_item_chance_percent,
          j.reward_item_quantity,
          j.created_at,
          j.updated_at
       FROM jobs AS j
       LEFT JOIN items AS i ON i.id = j.reward_item_id
       WHERE j.enabled = TRUE
       ORDER BY j.updated_at DESC, j.id DESC`,
    );

    return rows.map(row => this.mapJobRow(row));
  }

  async listAdminJobs(): Promise<JobView[]> {
    const [rows] = await pool.query<JobRow[]>(
      `SELECT
          j.id,
          j.job_key,
          j.title_ru,
          j.title_en,
          j.title_et,
          j.description_ru,
          j.description_en,
          j.description_et,
          j.icon_url,
          j.reward_amount,
          j.cooldown_seconds,
          j.enabled,
          j.reward_item_id,
          i.name AS reward_item_name,
          i.emoji AS reward_item_emoji,
          j.reward_item_chance_percent,
          j.reward_item_quantity,
          j.created_at,
          j.updated_at
       FROM jobs AS j
       LEFT JOIN items AS i ON i.id = j.reward_item_id
       ORDER BY j.enabled DESC, j.updated_at DESC, j.id DESC`,
    );

    return rows.map(row => this.mapJobRow(row));
  }

  async createJob(input: JobMutationInput): Promise<JobView> {
    const actor = await ItemService.getInstance().ensureMemberByDiscordId(input.actorDiscordId);
    const payload = await this.normalizePayload(input, false);

    try {
      const [result] = await pool.query<ResultSetHeader>(
        `INSERT INTO jobs (
           job_key,
           title_ru,
           title_en,
           title_et,
           description_ru,
           description_en,
           description_et,
           icon_url,
           reward_amount,
           cooldown_seconds,
           enabled,
           reward_item_id,
           reward_item_chance_percent,
           reward_item_quantity,
           created_by_member_id,
           updated_by_member_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          payload.jobKey,
          payload.titleRu,
          payload.titleEn,
          payload.titleEt,
          payload.descriptionRu,
          payload.descriptionEn,
          payload.descriptionEt,
          payload.iconUrl,
          payload.rewardAmount,
          payload.cooldownSeconds,
          payload.enabled,
          payload.rewardItemId,
          payload.rewardItemChancePercent,
          payload.rewardItemQuantity ?? 1,
          actor.data.id,
          actor.data.id,
        ],
      );

      const created = await this.getJobById(Number(result.insertId));
      if (!created) {
        throw new JobServiceError("JOB_CREATE_FAILED", "Failed to load created job.");
      }

      return created;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new JobServiceError("JOB_KEY_ALREADY_EXISTS", "Job key already exists.");
      }

      throw this.wrapError("JOB_CREATE_FAILED", "Failed to create job.", error);
    }
  }

  async updateJob(jobId: number, input: JobMutationInput): Promise<JobView> {
    const actor = await ItemService.getInstance().ensureMemberByDiscordId(input.actorDiscordId);
    const existing = await this.getJobById(jobId);
    if (!existing) {
      throw new JobServiceError("JOB_NOT_FOUND", "Job not found.");
    }

    const payload = await this.normalizePayload({
      jobKey: input.jobKey ?? existing.jobKey,
      titleRu: input.titleRu ?? existing.titleRu,
      titleEn: input.titleEn ?? existing.titleEn,
      titleEt: input.titleEt ?? existing.titleEt,
      descriptionRu: input.descriptionRu ?? existing.descriptionRu,
      descriptionEn: input.descriptionEn ?? existing.descriptionEn,
      descriptionEt: input.descriptionEt ?? existing.descriptionEt,
      iconUrl: input.iconUrl ?? existing.iconUrl,
      rewardAmount: input.rewardAmount ?? existing.rewardAmount,
      cooldownSeconds: input.cooldownSeconds ?? existing.cooldownSeconds,
      enabled: input.enabled ?? existing.enabled,
      rewardItemId: input.rewardItemId ?? existing.rewardItemId,
      rewardItemChancePercent: input.rewardItemChancePercent ?? existing.rewardItemChancePercent,
      rewardItemQuantity: input.rewardItemQuantity ?? existing.rewardItemQuantity,
      actorDiscordId: input.actorDiscordId,
    }, true);

    try {
      const [result] = await pool.query<ResultSetHeader>(
        `UPDATE jobs
         SET job_key = ?,
             title_ru = ?,
             title_en = ?,
             title_et = ?,
             description_ru = ?,
             description_en = ?,
             description_et = ?,
             icon_url = ?,
             reward_amount = ?,
             cooldown_seconds = ?,
             enabled = ?,
             reward_item_id = ?,
             reward_item_chance_percent = ?,
             reward_item_quantity = ?,
             updated_by_member_id = ?
         WHERE id = ?`,
        [
          payload.jobKey,
          payload.titleRu,
          payload.titleEn,
          payload.titleEt,
          payload.descriptionRu,
          payload.descriptionEn,
          payload.descriptionEt,
          payload.iconUrl,
          payload.rewardAmount,
          payload.cooldownSeconds,
          payload.enabled,
          payload.rewardItemId,
          payload.rewardItemChancePercent,
          payload.rewardItemQuantity ?? 1,
          actor.data.id,
          jobId,
        ],
      );

      if (result.affectedRows !== 1) {
        throw new JobServiceError("JOB_NOT_FOUND", "Job not found.");
      }

      const updated = await this.getJobById(jobId);
      if (!updated) {
        throw new JobServiceError("JOB_UPDATE_FAILED", "Failed to load updated job.");
      }

      return updated;
    } catch (error) {
      if (this.isDuplicateKeyError(error)) {
        throw new JobServiceError("JOB_KEY_ALREADY_EXISTS", "Job key already exists.");
      }

      if (error instanceof JobServiceError) {
        throw error;
      }

      throw this.wrapError("JOB_UPDATE_FAILED", "Failed to update job.", error);
    }
  }

  async disableJob(jobId: number, actorDiscordId: string): Promise<{ jobId: number; disabled: true }> {
    const actor = await ItemService.getInstance().ensureMemberByDiscordId(actorDiscordId);

    const [result] = await pool.query<ResultSetHeader>(
      `UPDATE jobs
       SET enabled = FALSE,
           updated_by_member_id = ?
       WHERE id = ?`,
      [actor.data.id, jobId],
    );

    if (result.affectedRows !== 1) {
      throw new JobServiceError("JOB_NOT_FOUND", "Job not found.");
    }

    return {
      jobId,
      disabled: true,
    };
  }

  async runJob(discordUserId: string, jobId: number): Promise<JobRunResult> {
    const member = await ItemService.getInstance().ensureMemberByDiscordId(discordUserId);
    let connection: PoolConnection | null = null;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [jobRows] = await connection.query<JobRow[]>(
        `SELECT
            j.id,
            j.job_key,
            j.title_ru,
            j.title_en,
            j.title_et,
            j.description_ru,
            j.description_en,
            j.description_et,
            j.icon_url,
            j.reward_amount,
            j.cooldown_seconds,
            j.enabled,
            j.reward_item_id,
            i.name AS reward_item_name,
            i.emoji AS reward_item_emoji,
            j.reward_item_chance_percent,
            j.reward_item_quantity,
            j.created_at,
            j.updated_at
         FROM jobs AS j
         LEFT JOIN items AS i ON i.id = j.reward_item_id
         WHERE j.id = ?
         LIMIT 1
         FOR UPDATE`,
        [jobId],
      );

      const jobRow = jobRows[0];
      if (!jobRow) {
        await connection.rollback();
        throw new JobServiceError("JOB_NOT_FOUND", "Job not found.");
      }

      const job = this.mapJobRow(jobRow);
      if (!job.enabled) {
        await connection.rollback();
        throw new JobServiceError("JOB_DISABLED", "Job is disabled.");
      }

      const [cooldownRows] = await connection.query<CooldownRow[]>(
        `SELECT id, last_run_at
         FROM member_job_cooldowns
         WHERE member_id = ? AND job_id = ?
         LIMIT 1
         FOR UPDATE`,
        [member.data.id, jobId],
      );

      const now = new Date();
      if (cooldownRows.length) {
        const lastRunAt = new Date(cooldownRows[0].last_run_at);
        const nextAvailableAt = new Date(lastRunAt.getTime() + (job.cooldownSeconds * 1000));
        const remainingMs = nextAvailableAt.getTime() - now.getTime();
        if (remainingMs > 0) {
          await connection.rollback();
          throw new JobServiceError("JOB_COOLDOWN_ACTIVE", "Job cooldown is still active.", {
            remainingSeconds: Math.ceil(remainingMs / 1000),
            nextAvailableAt: nextAvailableAt.toISOString(),
          });
        }
      }

      await connection.query<ResultSetHeader>(
        `UPDATE members
         SET balance = balance + ?
         WHERE id = ?`,
        [job.rewardAmount, member.data.id],
      );

      const grantedItems: JobRunGrantedItem[] = [];
      if (
        job.rewardItemId !== null
        && job.rewardItemChancePercent !== null
        && job.rewardItemChancePercent > 0
        && (job.rewardItemQuantity ?? 0) > 0
      ) {
        const roll = Math.random() * 100;
        if (roll < job.rewardItemChancePercent) {
          const quantity = job.rewardItemQuantity ?? 1;
          const values = Array.from({ length: quantity }, () => [
            member.data.id,
            job.rewardItemId,
            1,
            now,
            member.data.id,
          ]);

          await connection.query<ResultSetHeader>(
            `INSERT INTO member_items (member_id, item_id, tier, obtained_at, original_owner_member_id) VALUES ?`,
            [values],
          );

          grantedItems.push({
            itemTemplateId: job.rewardItemId,
            name: job.rewardItemName ?? `#${job.rewardItemId}`,
            emoji: job.rewardItemEmoji,
            quantity,
          });
        }
      }

      await connection.query<ResultSetHeader>(
        `INSERT INTO member_job_cooldowns (member_id, job_id, last_run_at)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE last_run_at = VALUES(last_run_at)`,
        [member.data.id, jobId, now],
      );

      const [balanceRows] = await connection.query<MemberBalanceRow[]>(
        `SELECT balance FROM members WHERE id = ? LIMIT 1`,
        [member.data.id],
      );

      const nextAvailableAt = new Date(now.getTime() + (job.cooldownSeconds * 1000));
      await connection.commit();

      return {
        jobId,
        rewardAmount: job.rewardAmount,
        balanceAfter: Number(balanceRows[0]?.balance ?? 0),
        grantedItems,
        nextAvailableAt: nextAvailableAt.toISOString(),
      };
    } catch (error) {
      if (connection) {
        await connection.rollback();
      }

      if (error instanceof JobServiceError) {
        throw error;
      }

      throw this.wrapError("JOB_RUN_FAILED", "Failed to run job.", error);
    } finally {
      connection?.release();
    }
  }

  async getJobById(jobId: number): Promise<JobView | null> {
    const [rows] = await pool.query<JobRow[]>(
      `SELECT
          j.id,
          j.job_key,
          j.title_ru,
          j.title_en,
          j.title_et,
          j.description_ru,
          j.description_en,
          j.description_et,
          j.icon_url,
          j.reward_amount,
          j.cooldown_seconds,
          j.enabled,
          j.reward_item_id,
          i.name AS reward_item_name,
          i.emoji AS reward_item_emoji,
          j.reward_item_chance_percent,
          j.reward_item_quantity,
          j.created_at,
          j.updated_at
       FROM jobs AS j
       LEFT JOIN items AS i ON i.id = j.reward_item_id
       WHERE j.id = ?
       LIMIT 1`,
      [jobId],
    );

    return rows[0] ? this.mapJobRow(rows[0]) : null;
  }

  private async normalizePayload(input: JobMutationInput, isUpdate: boolean): Promise<NormalizedJobPayload> {
    const jobKey = this.normalizeJobKey(input.jobKey, isUpdate ? "Job key" : "jobKey");
    const titleRu = this.normalizeRequiredText(input.titleRu, "titleRu", 120);
    const titleEn = this.normalizeRequiredText(input.titleEn, "titleEn", 120);
    const titleEt = this.normalizeRequiredText(input.titleEt, "titleEt", 120);
    const descriptionRu = this.normalizeOptionalText(input.descriptionRu, 1000);
    const descriptionEn = this.normalizeOptionalText(input.descriptionEn, 1000);
    const descriptionEt = this.normalizeOptionalText(input.descriptionEt, 1000);
    const iconUrl = this.normalizeOptionalUrl(input.iconUrl);
    const rewardAmount = this.normalizeNonNegativeInteger(input.rewardAmount, "rewardAmount");
    const cooldownSeconds = this.normalizeNonNegativeInteger(input.cooldownSeconds, "cooldownSeconds");
    const enabled = this.normalizeBoolean(input.enabled, true);
    const rewardItemId = this.normalizeOptionalPositiveInteger(input.rewardItemId, "rewardItemId");
    const rewardItemChancePercent = this.normalizeOptionalPercent(input.rewardItemChancePercent);
    const rewardItemQuantity = this.normalizeOptionalPositiveInteger(input.rewardItemQuantity, "rewardItemQuantity");

    if (rewardItemId !== null) {
      const item = await this.requireItem(rewardItemId);
      if (!item) {
        throw new JobServiceError("ITEM_NOT_FOUND", "Reward item not found.");
      }

      if (rewardItemChancePercent === null || rewardItemChancePercent <= 0) {
        throw new JobServiceError("JOB_REWARD_INVALID", "Reward item chance must be greater than 0 when reward item is configured.");
      }

      if (rewardItemQuantity === null) {
        throw new JobServiceError("JOB_REWARD_INVALID", "Reward item quantity is required when reward item is configured.");
      }
    } else if (rewardItemChancePercent !== null || rewardItemQuantity !== null) {
      throw new JobServiceError("JOB_REWARD_INVALID", "Reward item must be selected before configuring chance or quantity.");
    }

    return {
      jobKey,
      titleRu,
      titleEn,
      titleEt,
      descriptionRu,
      descriptionEn,
      descriptionEt,
      iconUrl,
      rewardAmount,
      cooldownSeconds,
      enabled,
      rewardItemId,
      rewardItemChancePercent,
      rewardItemQuantity,
    };
  }

  private mapJobRow(row: JobRow): JobView {
    return {
      id: Number(row.id),
      jobKey: String(row.job_key),
      titleRu: String(row.title_ru),
      titleEn: String(row.title_en),
      titleEt: String(row.title_et),
      descriptionRu: row.description_ru === null ? null : String(row.description_ru),
      descriptionEn: row.description_en === null ? null : String(row.description_en),
      descriptionEt: row.description_et === null ? null : String(row.description_et),
      iconUrl: row.icon_url === null ? null : String(row.icon_url),
      rewardAmount: Number(row.reward_amount),
      cooldownSeconds: Number(row.cooldown_seconds),
      enabled: Boolean(row.enabled),
      rewardItemId: row.reward_item_id === null ? null : Number(row.reward_item_id),
      rewardItemName: row.reward_item_name === null ? null : String(row.reward_item_name),
      rewardItemEmoji: row.reward_item_emoji === null ? null : String(row.reward_item_emoji),
      rewardItemChancePercent: row.reward_item_chance_percent === null ? null : Number(row.reward_item_chance_percent),
      rewardItemQuantity: row.reward_item_quantity === null ? null : Number(row.reward_item_quantity),
      createdAt: this.toIsoString(row.created_at),
      updatedAt: this.toIsoString(row.updated_at),
    };
  }

  private async requireItem(itemId: number): Promise<ItemIdentityRow | null> {
    const [rows] = await pool.query<ItemIdentityRow[]>(
      `SELECT id, name, emoji FROM items WHERE id = ? LIMIT 1`,
      [itemId],
    );

    return rows[0] ?? null;
  }

  private normalizeJobKey(value: unknown, fieldName: string): string {
    if (typeof value !== "string") {
      throw new JobServiceError("JOB_INVALID", `${fieldName} is required.`);
    }

    const normalized = value.trim().toLowerCase();
    if (!JOB_KEY_RE.test(normalized)) {
      throw new JobServiceError("JOB_INVALID", `${fieldName} must be 1-64 chars and use a-z, 0-9, _ or -.`);
    }

    return normalized;
  }

  private normalizeRequiredText(value: unknown, fieldName: string, maxLength: number): string {
    if (typeof value !== "string") {
      throw new JobServiceError("JOB_INVALID", `${fieldName} is required.`);
    }

    const normalized = value.trim();
    if (!normalized.length || normalized.length > maxLength) {
      throw new JobServiceError("JOB_INVALID", `${fieldName} must be between 1 and ${maxLength} characters.`);
    }

    return normalized;
  }

  private normalizeOptionalText(value: unknown, maxLength: number): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value !== "string") {
      throw new JobServiceError("JOB_INVALID", `Text value must be a string.`);
    }

    const normalized = value.trim();
    if (!normalized.length) {
      return null;
    }

    if (normalized.length > maxLength) {
      throw new JobServiceError("JOB_INVALID", `Text value must be ${maxLength} characters or less.`);
    }

    return normalized;
  }

  private normalizeOptionalUrl(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }

    if (typeof value !== "string") {
      throw new JobServiceError("JOB_INVALID", "iconUrl must be a string.");
    }

    const normalized = value.trim();
    if (!normalized.length) {
      return null;
    }

    try {
      const parsed = new URL(normalized);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error();
      }
      return normalized;
    } catch {
      throw new JobServiceError("JOB_INVALID", "iconUrl must be a valid http/https URL.");
    }
  }

  private normalizeNonNegativeInteger(value: unknown, fieldName: string): number {
    const parsed = typeof value === "string" && value.trim().length ? Number(value) : value;
    if (!Number.isInteger(parsed) || Number(parsed) < 0) {
      throw new JobServiceError("JOB_INVALID", `${fieldName} must be a non-negative integer.`);
    }

    return Number(parsed);
  }

  private normalizeOptionalPositiveInteger(value: unknown, fieldName: string): number | null {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    const parsed = typeof value === "string" && value.trim().length ? Number(value) : value;
    if (!Number.isInteger(parsed) || Number(parsed) <= 0) {
      throw new JobServiceError("JOB_INVALID", `${fieldName} must be a positive integer.`);
    }

    return Number(parsed);
  }

  private normalizeOptionalPercent(value: unknown): number | null {
    if (value === undefined || value === null || value === "") {
      return null;
    }

    const parsed = typeof value === "string" && value.trim().length ? Number(value) : value;
    if (!Number.isFinite(parsed) || Number(parsed) < 0 || Number(parsed) > 100) {
      throw new JobServiceError("JOB_INVALID", "rewardItemChancePercent must be between 0 and 100.");
    }

    return Number(Number(parsed).toFixed(2));
  }

  private normalizeBoolean(value: unknown, fallback: boolean): boolean {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true") {
        return true;
      }
      if (normalized === "false") {
        return false;
      }
    }

    if (value === undefined) {
      return fallback;
    }

    throw new JobServiceError("JOB_INVALID", "enabled must be boolean.");
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "ER_DUP_ENTRY");
  }

  private wrapError(code: string, fallbackMessage: string, error: unknown): JobServiceError {
    if (error instanceof JobServiceError) {
      return error;
    }

    if (error instanceof Error) {
      return new JobServiceError(code, error.message || fallbackMessage);
    }

    return new JobServiceError(code, fallbackMessage);
  }

  private toIsoString(value: Date | string): string {
    if (value instanceof Date) {
      return value.toISOString();
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
  }
}
