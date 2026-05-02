import { RowDataPacket } from "mysql2";
import pool from "../db.js";
import { ObsRelayAgentMetadata } from "../types/obs-agent.types.js";

export type ObsAgentStatusView = {
  agentId: string;
  online: boolean;
  connectedAt: string | null;
  lastSeenAt: string | null;
  disconnectedAt: string | null;
  lastError: string | null;
  agentVersion: string | null;
  relayProtocolVersion: number | null;
  capabilities: string[];
  obsConnected: boolean | null;
  obsVersion: string | null;
  websocketVersion: string | null;
};

type ObsAgentStatusPayload = {
  agentVersion: string | null;
  relayProtocolVersion: number | null;
  capabilities: string[];
  obsConnected: boolean | null;
  obsVersion: string | null;
  websocketVersion: string | null;
};

interface ObsAgentStatusRow extends RowDataPacket {
  agent_id: string;
  online: number;
  connected_at: Date | string | null;
  last_seen_at: Date | string | null;
  disconnected_at: Date | string | null;
  last_error: string | null;
  status_payload_json: unknown;
}

export class ObsAgentStatusService {
  private static instance: ObsAgentStatusService;

  static getInstance(): ObsAgentStatusService {
    if (!ObsAgentStatusService.instance) {
      ObsAgentStatusService.instance = new ObsAgentStatusService();
    }

    return ObsAgentStatusService.instance;
  }

  private readonly defaultPayload: ObsAgentStatusPayload = {
    agentVersion: null,
    relayProtocolVersion: null,
    capabilities: [],
    obsConnected: null,
    obsVersion: null,
    websocketVersion: null,
  };

  async markConnected(agentId: string, metadata?: ObsRelayAgentMetadata): Promise<void> {
    const payloadJson = this.serializePayload(metadata);
    await pool.query(
      `INSERT INTO obs_agent_statuses (
          agent_id,
          online,
          connected_at,
          last_seen_at,
          disconnected_at,
          last_error,
          status_payload_json
       ) VALUES (?, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL, ?)
       ON DUPLICATE KEY UPDATE
         online = TRUE,
         connected_at = CURRENT_TIMESTAMP,
         last_seen_at = CURRENT_TIMESTAMP,
         disconnected_at = NULL,
         last_error = NULL,
         status_payload_json = COALESCE(VALUES(status_payload_json), status_payload_json),
         updated_at = CURRENT_TIMESTAMP`,
      [agentId, payloadJson],
    );
  }

  async markSeen(agentId: string, metadata?: ObsRelayAgentMetadata): Promise<void> {
    const payloadJson = this.serializePayload(metadata);
    await pool.query(
      `INSERT INTO obs_agent_statuses (
          agent_id,
          online,
          connected_at,
          last_seen_at,
          disconnected_at,
          last_error,
          status_payload_json
       ) VALUES (?, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL, ?)
       ON DUPLICATE KEY UPDATE
         online = TRUE,
         last_seen_at = CURRENT_TIMESTAMP,
         disconnected_at = NULL,
         status_payload_json = COALESCE(VALUES(status_payload_json), status_payload_json),
         updated_at = CURRENT_TIMESTAMP`,
      [agentId, payloadJson],
    );
  }

  async markDisconnected(agentId: string, error?: string | null): Promise<void> {
    const errorText = typeof error === "string" && error.trim().length > 0 ? error.trim() : null;

    await pool.query(
      `INSERT INTO obs_agent_statuses (
          agent_id,
          online,
          connected_at,
          last_seen_at,
          disconnected_at,
          last_error
       ) VALUES (?, FALSE, NULL, NULL, CURRENT_TIMESTAMP, ?)
       ON DUPLICATE KEY UPDATE
         online = FALSE,
         disconnected_at = CURRENT_TIMESTAMP,
         last_error = ?,
         updated_at = CURRENT_TIMESTAMP`,
      [agentId, errorText, errorText],
    );
  }

  async getStatus(agentId: string): Promise<ObsAgentStatusView | null> {
    const [rows] = await pool.query<ObsAgentStatusRow[]>(
      `SELECT
          agent_id,
          online,
          connected_at,
          last_seen_at,
          disconnected_at,
          last_error,
          status_payload_json
       FROM obs_agent_statuses
       WHERE agent_id = ?
       LIMIT 1`,
      [agentId],
    );

    const row = rows[0];
    return row ? this.mapRow(row) : null;
  }

  async getStatuses(agentIds: string[]): Promise<Map<string, ObsAgentStatusView>> {
    const uniqueAgentIds = Array.from(new Set(agentIds.map(id => id.trim()).filter(Boolean)));
    if (!uniqueAgentIds.length) {
      return new Map();
    }

    const placeholders = uniqueAgentIds.map(() => "?").join(",");
    const [rows] = await pool.query<ObsAgentStatusRow[]>(
      `SELECT
          agent_id,
          online,
          connected_at,
          last_seen_at,
          disconnected_at,
          last_error,
          status_payload_json
       FROM obs_agent_statuses
       WHERE agent_id IN (${placeholders})`,
      uniqueAgentIds,
    );

    const result = new Map<string, ObsAgentStatusView>();
    for (const row of rows) {
      result.set(row.agent_id, this.mapRow(row));
    }

    return result;
  }

  private mapRow(row: ObsAgentStatusRow): ObsAgentStatusView {
    const payload = this.parsePayload(row.status_payload_json);
    return {
      agentId: row.agent_id,
      online: Boolean(row.online),
      connectedAt: this.toIsoTimestamp(row.connected_at),
      lastSeenAt: this.toIsoTimestamp(row.last_seen_at),
      disconnectedAt: this.toIsoTimestamp(row.disconnected_at),
      lastError: row.last_error,
      agentVersion: payload.agentVersion,
      relayProtocolVersion: payload.relayProtocolVersion,
      capabilities: payload.capabilities,
      obsConnected: payload.obsConnected,
      obsVersion: payload.obsVersion,
      websocketVersion: payload.websocketVersion,
    };
  }

  private serializePayload(metadata?: ObsRelayAgentMetadata): string | null {
    if (!metadata) {
      return null;
    }

    return JSON.stringify(this.normalizePayload(metadata));
  }

  private parsePayload(raw: unknown): ObsAgentStatusPayload {
    if (!raw) {
      return { ...this.defaultPayload };
    }

    if (typeof raw === "string") {
      try {
        return this.normalizePayload(JSON.parse(raw));
      } catch {
        return { ...this.defaultPayload };
      }
    }

    return this.normalizePayload(raw);
  }

  private normalizePayload(raw: unknown): ObsAgentStatusPayload {
    if (!this.isRecord(raw)) {
      return { ...this.defaultPayload };
    }

    const capabilities = Array.isArray(raw.capabilities)
      ? raw.capabilities.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
      : [];

    return {
      agentVersion: typeof raw.agentVersion === "string" && raw.agentVersion.trim().length > 0 ? raw.agentVersion.trim() : null,
      relayProtocolVersion: typeof raw.relayProtocolVersion === "number" && Number.isFinite(raw.relayProtocolVersion)
        ? Math.trunc(raw.relayProtocolVersion)
        : null,
      capabilities,
      obsConnected: typeof raw.obsConnected === "boolean" ? raw.obsConnected : null,
      obsVersion: typeof raw.obsVersion === "string" && raw.obsVersion.trim().length > 0 ? raw.obsVersion.trim() : null,
      websocketVersion: typeof raw.websocketVersion === "string" && raw.websocketVersion.trim().length > 0 ? raw.websocketVersion.trim() : null,
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
  }

  private toIsoTimestamp(value: Date | string | null): string | null {
    if (!value) {
      return null;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
}

export const obsAgentStatusService = ObsAgentStatusService.getInstance();
