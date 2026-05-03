import { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../db.js";
import { ItemService } from "./ItemService.js";
import { ShopObsService } from "./ShopObsService.js";
import { StreamerAccessService } from "./StreamerAccessService.js";
import { streamerService } from "./StreamerService.js";
import { DataBaseHandler } from "./DataBaseHandler.js";

export type StreamerManagedServiceType = "obs_media";
export type StreamerManagedServiceMediaKind = "image" | "gif" | "video" | "browser";

export type StreamerManagedServiceView = {
  id: number;
  streamerId: number;
  serviceKey: string;
  title: string;
  description: string | null;
  serviceType: StreamerManagedServiceType;
  mediaKind: StreamerManagedServiceMediaKind | null;
  mediaUrl: string | null;
  durationMs: number | null;
  price: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type StreamerServiceCatalogView = {
  id: number;
  streamerId: number;
  serviceKey: string;
  title: string;
  description: string | null;
  serviceType: StreamerManagedServiceType;
  mediaKind: StreamerManagedServiceMediaKind | null;
  mediaUrl: string | null;
  durationMs: number | null;
  price: number;
};

export type StreamerServicePurchaseResult = {
  streamerId: number;
  serviceId: number;
  serviceKey: string;
  priceOdm: number;
  balanceAfter: number;
  commandId?: string;
};

type CreateStreamerServiceInput = {
  actorDiscordId: string;
  streamerId: number;
  serviceKey: unknown;
  title: unknown;
  description?: unknown;
  serviceType: unknown;
  mediaKind?: unknown;
  mediaUrl?: unknown;
  durationMs?: unknown;
  price: unknown;
  enabled?: unknown;
};

type UpdateStreamerServiceInput = {
  actorDiscordId: string;
  streamerId: number;
  serviceId: number;
  serviceKey?: unknown;
  title?: unknown;
  description?: unknown;
  serviceType?: unknown;
  mediaKind?: unknown;
  mediaUrl?: unknown;
  durationMs?: unknown;
  price?: unknown;
  enabled?: unknown;
};

interface StreamerServiceRow extends RowDataPacket {
  id: number | string;
  streamer_id: number | string;
  service_key: string;
  title: string;
  description: string | null;
  service_type: StreamerManagedServiceType;
  media_kind: StreamerManagedServiceMediaKind | null;
  media_url: string | null;
  duration_ms: number | null;
  price: number | string;
  enabled: number | boolean;
  created_at: Date | string;
  updated_at: Date | string;
}

type NormalizedStreamerServicePayload = {
  serviceKey: string;
  title: string;
  description: string | null;
  serviceType: StreamerManagedServiceType;
  mediaKind: StreamerManagedServiceMediaKind | null;
  mediaUrl: string | null;
  durationMs: number | null;
  price: number;
  enabled: boolean;
};

const MIN_OBS_MEDIA_DURATION_MS = 1000;
const MAX_OBS_MEDIA_DURATION_MS = 15000;
const STREAMER_SERVICE_KEY_RE = /^[a-z0-9_-]{1,64}$/;
const SUPPORTED_SERVICE_TYPES = new Set<StreamerManagedServiceType>(["obs_media"]);
const SUPPORTED_OBS_MEDIA_KINDS = new Set<StreamerManagedServiceMediaKind>(["image", "gif"]);
const shopObsService = ShopObsService.getInstance();

export class StreamerServicesService {
  private static instance: StreamerServicesService;

  static getInstance(): StreamerServicesService {
    if (!StreamerServicesService.instance) {
      StreamerServicesService.instance = new StreamerServicesService();
    }

    return StreamerServicesService.instance;
  }

  async listEnabledStreamerServiceCatalog(streamerId: number): Promise<StreamerServiceCatalogView[]> {
    await streamerService.ensureStreamerExistsById(streamerId);

    try {
      const [rows] = await pool.query<StreamerServiceRow[]>(
        `SELECT
            id,
            streamer_id,
            service_key,
            title,
            description,
            service_type,
            media_kind,
            media_url,
            duration_ms,
            price,
            enabled,
            created_at,
            updated_at
         FROM streamer_services
         WHERE streamer_id = ? AND enabled = TRUE
         ORDER BY updated_at DESC, id DESC`,
        [streamerId],
      );

      return rows.map(row => this.toCatalogView(row));
    } catch (error) {
      throw this.wrapError("STREAMER_SERVICE_LOAD_FAILED", "Failed to load streamer service catalog.", error);
    }
  }

  async purchaseStreamerService(input: { buyerDiscordId: string; streamerId: number; serviceId: number }): Promise<StreamerServicePurchaseResult> {
    await streamerService.ensureStreamerExistsById(input.streamerId);

    const row = await this.requireServiceRow(input.streamerId, input.serviceId);
    if (!Boolean(row.enabled)) {
      throw Object.assign(new Error("Streamer service is disabled."), { code: "STREAMER_SERVICE_DISABLED" });
    }

    let normalized: NormalizedStreamerServicePayload;
    try {
      normalized = this.normalizePayload({
        serviceKey: row.service_key,
        title: row.title,
        description: row.description,
        serviceType: row.service_type,
        mediaKind: row.media_kind,
        mediaUrl: row.media_url,
        durationMs: row.duration_ms,
        price: row.price,
        enabled: Boolean(row.enabled),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Stored streamer service payload is invalid.";
      throw Object.assign(new Error(message), { code: "STREAMER_SERVICE_PURCHASE_INVALID" });
    }

    if (normalized.serviceType !== "obs_media") {
      throw Object.assign(new Error("Streamer service type is not supported for purchase."), { code: "STREAMER_SERVICE_UNSUPPORTED" });
    }

    if (!normalized.mediaKind || !normalized.mediaUrl || normalized.durationMs === null) {
      throw Object.assign(new Error("Stored streamer service payload is incomplete."), { code: "STREAMER_SERVICE_PURCHASE_INVALID" });
    }

    const mediaKind = normalized.mediaKind as "image" | "gif";

    try {
      const result = await shopObsService.purchaseConfiguredObsMedia({
        discordId: input.buyerDiscordId,
        streamerId: input.streamerId,
        serviceKey: normalized.serviceKey,
        title: normalized.title,
        mediaKind,
        mediaUrl: normalized.mediaUrl,
        durationMs: normalized.durationMs,
        priceOdm: normalized.price,
      });

      return {
        streamerId: result.streamerId,
        serviceId: Number(row.id),
        serviceKey: normalized.serviceKey,
        priceOdm: result.priceOdm,
        balanceAfter: result.balanceAfter,
        commandId: result.commandId,
      };
    } catch (error) {
      if (shopObsService.isPurchaseError(error)) {
        switch (error.code) {
          case "OBS_STREAMER_NOT_FOUND":
            throw Object.assign(new Error("Streamer not found."), { code: "STREAMER_NOT_FOUND" });
          case "OBS_AGENT_NOT_CONFIGURED":
            throw Object.assign(new Error("Streamer OBS Agent is not configured."), { code: "STREAMER_SERVICE_AGENT_NOT_CONFIGURED" });
          case "OBS_AGENT_OFFLINE":
            throw Object.assign(new Error("Streamer OBS Agent is offline."), { code: "STREAMER_SERVICE_AGENT_OFFLINE" });
          case "NOT_ENOUGH_ODM":
            throw Object.assign(new Error("Not enough ODM."), { code: "STREAMER_SERVICE_NOT_ENOUGH_ODM" });
          case "OBS_MEDIA_COMMAND_FAILED":
          case "OBS_MEDIA_REFUND_FAILED":
            throw Object.assign(new Error(error.message || "Streamer service command failed."), { code: "STREAMER_SERVICE_COMMAND_FAILED" });
          case "OBS_MEDIA_PURCHASE_FAILED":
            throw Object.assign(new Error(error.message || "Streamer service purchase failed."), { code: "STREAMER_SERVICE_PURCHASE_FAILED" });
          default:
            throw Object.assign(new Error(error.message || "Streamer service purchase failed."), { code: "STREAMER_SERVICE_PURCHASE_FAILED" });
        }
      }

      throw this.wrapError("STREAMER_SERVICE_PURCHASE_FAILED", "Failed to purchase streamer service.", error);
    }
  }

  async listStreamerServices(actorDiscordId: string, streamerId: number): Promise<StreamerManagedServiceView[]> {
    await this.ensureManageAccess(actorDiscordId, streamerId);

    try {
      const [rows] = await pool.query<StreamerServiceRow[]>(
        `SELECT
            id,
            streamer_id,
            service_key,
            title,
            description,
            service_type,
            media_kind,
            media_url,
            duration_ms,
            price,
            enabled,
            created_at,
            updated_at
         FROM streamer_services
         WHERE streamer_id = ?
         ORDER BY enabled DESC, updated_at DESC, id DESC`,
        [streamerId],
      );

      return rows.map(row => this.toView(row));
    } catch (error) {
      throw this.wrapError("STREAMER_SERVICE_LOAD_FAILED", "Failed to load streamer services.", error);
    }
  }

  async getStreamerService(actorDiscordId: string, streamerId: number, serviceId: number): Promise<StreamerManagedServiceView> {
    await this.ensureManageAccess(actorDiscordId, streamerId);

    try {
      const row = await this.requireServiceRow(streamerId, serviceId);
      return this.toView(row);
    } catch (error) {
      if (this.hasCode(error, "STREAMER_SERVICE_NOT_FOUND")) {
        throw error;
      }
      throw this.wrapError("STREAMER_SERVICE_LOAD_FAILED", "Failed to load streamer service.", error);
    }
  }

  async createStreamerService(input: CreateStreamerServiceInput): Promise<StreamerManagedServiceView> {
    await this.ensureManageAccess(input.actorDiscordId, input.streamerId);

    const actorMemberId = await this.ensureActorMemberId(input.actorDiscordId);
    const normalized = this.normalizeCreatePayload(input);

    try {
      const [result] = await pool.query<ResultSetHeader>(
        `INSERT INTO streamer_services (
            streamer_id,
            service_key,
            title,
            description,
            service_type,
            media_kind,
            media_url,
            duration_ms,
            price,
            enabled,
            created_by_member_id,
            updated_by_member_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          input.streamerId,
          normalized.serviceKey,
          normalized.title,
          normalized.description,
          normalized.serviceType,
          normalized.mediaKind,
          normalized.mediaUrl,
          normalized.durationMs,
          normalized.price,
          normalized.enabled,
          actorMemberId,
          actorMemberId,
        ],
      );

      const row = await this.requireServiceRow(input.streamerId, result.insertId);
      return this.toView(row);
    } catch (error) {
      throw this.mapMutationError(error, "STREAMER_SERVICE_CREATE_FAILED", "Failed to create streamer service.");
    }
  }

  async updateStreamerService(input: UpdateStreamerServiceInput): Promise<StreamerManagedServiceView> {
    await this.ensureManageAccess(input.actorDiscordId, input.streamerId);

    const actorMemberId = await this.ensureActorMemberId(input.actorDiscordId);
    const existingRow = await this.requireServiceRow(input.streamerId, input.serviceId);
    const normalized = this.normalizeUpdatePayload(existingRow, input);

    try {
      await pool.query(
        `UPDATE streamer_services
         SET service_key = ?,
             title = ?,
             description = ?,
             service_type = ?,
             media_kind = ?,
             media_url = ?,
             duration_ms = ?,
             price = ?,
             enabled = ?,
             updated_by_member_id = ?
         WHERE id = ? AND streamer_id = ?`,
        [
          normalized.serviceKey,
          normalized.title,
          normalized.description,
          normalized.serviceType,
          normalized.mediaKind,
          normalized.mediaUrl,
          normalized.durationMs,
          normalized.price,
          normalized.enabled,
          actorMemberId,
          input.serviceId,
          input.streamerId,
        ],
      );

      const row = await this.requireServiceRow(input.streamerId, input.serviceId);
      return this.toView(row);
    } catch (error) {
      throw this.mapMutationError(error, "STREAMER_SERVICE_UPDATE_FAILED", "Failed to update streamer service.");
    }
  }

  async disableStreamerService(input: { actorDiscordId: string; streamerId: number; serviceId: number }): Promise<{ serviceId: number; disabled: true }> {
    await this.ensureManageAccess(input.actorDiscordId, input.streamerId);

    const actorMemberId = await this.ensureActorMemberId(input.actorDiscordId);
    await this.requireServiceRow(input.streamerId, input.serviceId);

    try {
      await pool.query(
        `UPDATE streamer_services
         SET enabled = FALSE,
             updated_by_member_id = ?
         WHERE id = ? AND streamer_id = ?`,
        [actorMemberId, input.serviceId, input.streamerId],
      );

      return {
        serviceId: input.serviceId,
        disabled: true,
      };
    } catch (error) {
      throw this.mapMutationError(error, "STREAMER_SERVICE_DELETE_FAILED", "Failed to disable streamer service.");
    }
  }

  private async ensureManageAccess(actorDiscordId: string, streamerId: number): Promise<void> {
    await streamerService.ensureStreamerExistsById(streamerId);
    const canManage = await StreamerAccessService.getInstance().canManageStreamer(actorDiscordId, streamerId);
    if (!canManage) {
      throw Object.assign(new Error("You do not have access to manage this streamer."), { code: "STREAMER_STUDIO_FORBIDDEN" });
    }
  }

  private async ensureActorMemberId(actorDiscordId: string): Promise<number> {
    const member = await ItemService.getInstance().ensureMemberByDiscordId(actorDiscordId);
    if (DataBaseHandler.isFail(member)) {
      throw new Error("Unable to resolve actor member.");
    }
    return member.data.id;
  }

  private normalizeCreatePayload(input: CreateStreamerServiceInput): NormalizedStreamerServicePayload {
    return this.normalizePayload({
      serviceKey: input.serviceKey,
      title: input.title,
      description: input.description,
      serviceType: input.serviceType,
      mediaKind: input.mediaKind,
      mediaUrl: input.mediaUrl,
      durationMs: input.durationMs,
      price: input.price,
      enabled: input.enabled,
    });
  }

  private normalizeUpdatePayload(existingRow: StreamerServiceRow, input: UpdateStreamerServiceInput): NormalizedStreamerServicePayload {
    const hasUpdate = (
      input.serviceKey !== undefined
      || input.title !== undefined
      || input.description !== undefined
      || input.serviceType !== undefined
      || input.mediaKind !== undefined
      || input.mediaUrl !== undefined
      || input.durationMs !== undefined
      || input.price !== undefined
      || input.enabled !== undefined
    );

    if (!hasUpdate) {
      throw this.invalidError("At least one service field must be provided.");
    }

    return this.normalizePayload({
      serviceKey: input.serviceKey ?? existingRow.service_key,
      title: input.title ?? existingRow.title,
      description: input.description === undefined ? existingRow.description : input.description,
      serviceType: input.serviceType ?? existingRow.service_type,
      mediaKind: input.mediaKind === undefined ? existingRow.media_kind : input.mediaKind,
      mediaUrl: input.mediaUrl === undefined ? existingRow.media_url : input.mediaUrl,
      durationMs: input.durationMs === undefined ? existingRow.duration_ms : input.durationMs,
      price: input.price ?? existingRow.price,
      enabled: input.enabled ?? existingRow.enabled,
    });
  }

  private normalizePayload(input: {
    serviceKey: unknown;
    title: unknown;
    description?: unknown;
    serviceType: unknown;
    mediaKind?: unknown;
    mediaUrl?: unknown;
    durationMs?: unknown;
    price: unknown;
    enabled?: unknown;
  }): NormalizedStreamerServicePayload {
    const serviceType = this.normalizeServiceType(input.serviceType);
    return {
      serviceKey: this.normalizeServiceKey(input.serviceKey),
      title: this.normalizeTitle(input.title),
      description: this.normalizeDescription(input.description),
      serviceType,
      mediaKind: this.normalizeMediaKind(input.mediaKind, serviceType),
      mediaUrl: this.normalizeMediaUrl(input.mediaUrl, serviceType),
      durationMs: this.normalizeDurationMs(input.durationMs, serviceType),
      price: this.normalizePrice(input.price),
      enabled: this.normalizeEnabled(input.enabled),
    };
  }

  private normalizeServiceKey(value: unknown): string {
    if (typeof value !== "string") {
      throw this.invalidError("serviceKey is required.");
    }

    const normalized = value.trim().toLowerCase().replace(/\s+/g, "-");
    if (!STREAMER_SERVICE_KEY_RE.test(normalized)) {
      throw this.invalidError("serviceKey must be lowercase slug-like text up to 64 chars using letters, numbers, dash, or underscore.");
    }

    return normalized;
  }

  private normalizeTitle(value: unknown): string {
    if (typeof value !== "string") {
      throw this.invalidError("title is required.");
    }

    const normalized = value.trim();
    if (!normalized.length || normalized.length > 120) {
      throw this.invalidError("title must be between 1 and 120 characters.");
    }

    return normalized;
  }

  private normalizeDescription(value: unknown): string | null {
    if (value === undefined || value === null) {
      return null;
    }
    if (typeof value !== "string") {
      throw this.invalidError("description must be a string or null.");
    }

    const normalized = value.trim();
    if (!normalized.length) {
      return null;
    }
    if (normalized.length > 4000) {
      throw this.invalidError("description must be at most 4000 characters.");
    }

    return normalized;
  }

  private normalizeServiceType(value: unknown): StreamerManagedServiceType {
    if (typeof value !== "string") {
      throw this.invalidError("serviceType is required.");
    }

    const normalized = value.trim().toLowerCase() as StreamerManagedServiceType;
    if (!SUPPORTED_SERVICE_TYPES.has(normalized)) {
      throw this.invalidError("serviceType must be obs_media.");
    }

    return normalized;
  }

  private normalizeMediaKind(value: unknown, serviceType: StreamerManagedServiceType): StreamerManagedServiceMediaKind | null {
    if (serviceType !== "obs_media") {
      return null;
    }

    if (typeof value !== "string") {
      throw this.invalidError("mediaKind is required for obs_media services.");
    }

    const normalized = value.trim().toLowerCase() as StreamerManagedServiceMediaKind;
    if (!SUPPORTED_OBS_MEDIA_KINDS.has(normalized)) {
      throw this.invalidError("mediaKind must be image or gif for obs_media services.");
    }

    return normalized;
  }

  private normalizeMediaUrl(value: unknown, serviceType: StreamerManagedServiceType): string | null {
    if (serviceType !== "obs_media") {
      return null;
    }

    if (typeof value !== "string") {
      throw this.invalidError("mediaUrl is required for obs_media services.");
    }

    const normalized = value.trim();
    if (!normalized.length) {
      throw this.invalidError("mediaUrl is required for obs_media services.");
    }

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(normalized);
    } catch {
      throw this.invalidError("mediaUrl must be a valid http or https URL.");
    }

    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw this.invalidError("mediaUrl must use http or https.");
    }

    return parsedUrl.toString();
  }

  private normalizeDurationMs(value: unknown, serviceType: StreamerManagedServiceType): number | null {
    if (serviceType !== "obs_media") {
      return null;
    }

    const normalized = this.parseInteger(value);
    if (normalized === null) {
      throw this.invalidError("durationMs is required for obs_media services.");
    }
    if (normalized < MIN_OBS_MEDIA_DURATION_MS || normalized > MAX_OBS_MEDIA_DURATION_MS) {
      throw this.invalidError(`durationMs must be between ${MIN_OBS_MEDIA_DURATION_MS} and ${MAX_OBS_MEDIA_DURATION_MS}.`);
    }

    return normalized;
  }

  private normalizePrice(value: unknown): number {
    const normalized = this.parseInteger(value);
    if (normalized === null || normalized < 0) {
      throw this.invalidError("price must be an integer greater than or equal to 0.");
    }

    return normalized;
  }

  private normalizeEnabled(value: unknown): boolean {
    if (value === undefined) {
      return true;
    }
    if (typeof value !== "boolean") {
      throw this.invalidError("enabled must be a boolean when provided.");
    }

    return value;
  }

  private parseInteger(value: unknown): number | null {
    if (typeof value === "number" && Number.isInteger(value)) {
      return value;
    }
    if (typeof value === "string" && value.trim().length) {
      const parsed = Number(value);
      if (Number.isInteger(parsed)) {
        return parsed;
      }
    }
    return null;
  }

  private async requireServiceRow(streamerId: number, serviceId: number): Promise<StreamerServiceRow> {
    const [rows] = await pool.query<StreamerServiceRow[]>(
      `SELECT
          id,
          streamer_id,
          service_key,
          title,
          description,
          service_type,
          media_kind,
          media_url,
          duration_ms,
          price,
          enabled,
          created_at,
          updated_at
       FROM streamer_services
       WHERE streamer_id = ? AND id = ?
       LIMIT 1`,
      [streamerId, serviceId],
    );

    const row = rows[0];
    if (!row) {
      throw Object.assign(new Error("Streamer service not found."), { code: "STREAMER_SERVICE_NOT_FOUND" });
    }

    return row;
  }

  private toView(row: StreamerServiceRow): StreamerManagedServiceView {
    return {
      id: Number(row.id),
      streamerId: Number(row.streamer_id),
      serviceKey: String(row.service_key),
      title: String(row.title),
      description: row.description ?? null,
      serviceType: row.service_type,
      mediaKind: row.media_kind ?? null,
      mediaUrl: row.media_url ?? null,
      durationMs: row.duration_ms === null ? null : Number(row.duration_ms),
      price: Number(row.price),
      enabled: Boolean(row.enabled),
      createdAt: this.toIsoTimestamp(row.created_at),
      updatedAt: this.toIsoTimestamp(row.updated_at),
    };
  }

  private toCatalogView(row: StreamerServiceRow): StreamerServiceCatalogView {
    const view = this.toView(row);
    return {
      id: view.id,
      streamerId: view.streamerId,
      serviceKey: view.serviceKey,
      title: view.title,
      description: view.description,
      serviceType: view.serviceType,
      mediaKind: view.mediaKind,
      mediaUrl: view.mediaUrl,
      durationMs: view.durationMs,
      price: view.price,
    };
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

  private invalidError(message: string): Error & { code: string } {
    return Object.assign(new Error(message), { code: "STREAMER_SERVICE_INVALID" });
  }

  private wrapError(code: string, message: string, error: unknown): Error & { code: string } {
    const wrapped = error instanceof Error ? error : new Error(message);
    return Object.assign(wrapped, { code, message: wrapped.message || message });
  }

  private hasCode(error: unknown, code: string): boolean {
    return typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === code;
  }

  private mapMutationError(error: unknown, fallbackCode: string, fallbackMessage: string): Error & { code: string } {
    if (this.hasCode(error, "STREAMER_SERVICE_INVALID") || this.hasCode(error, "STREAMER_SERVICE_NOT_FOUND")) {
      return error as Error & { code: string };
    }

    const e = error as { code?: string; message?: string };
    if (e?.code === "ER_DUP_ENTRY") {
      return Object.assign(new Error("serviceKey already exists for this streamer."), { code: "STREAMER_SERVICE_INVALID" });
    }

    const wrapped = error instanceof Error ? error : new Error(fallbackMessage);
    return Object.assign(wrapped, { code: fallbackCode, message: wrapped.message || fallbackMessage });
  }
}

export const streamerServicesService = StreamerServicesService.getInstance();
