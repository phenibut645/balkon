import { RowDataPacket } from "mysql2";
import pool from "../db.js";

export type ObsAgentStatusView = {
  agentId: string;
  online: boolean;
  connectedAt: string | null;
  lastSeenAt: string | null;
  disconnectedAt: string | null;
  lastError: string | null;
};

interface ObsAgentStatusRow extends RowDataPacket {
  agent_id: string;
  online: number;
  connected_at: Date | string | null;
  last_seen_at: Date | string | null;
  disconnected_at: Date | string | null;
  last_error: string | null;
}

export class ObsAgentStatusService {
  private static instance: ObsAgentStatusService;

  static getInstance(): ObsAgentStatusService {
    if (!ObsAgentStatusService.instance) {
      ObsAgentStatusService.instance = new ObsAgentStatusService();
    }

    return ObsAgentStatusService.instance;
  }

  async markConnected(agentId: string): Promise<void> {
    await pool.query(
      `INSERT INTO obs_agent_statuses (
          agent_id,
          online,
          connected_at,
          last_seen_at,
          disconnected_at,
          last_error
       ) VALUES (?, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL)
       ON DUPLICATE KEY UPDATE
         online = TRUE,
         connected_at = CURRENT_TIMESTAMP,
         last_seen_at = CURRENT_TIMESTAMP,
         disconnected_at = NULL,
         last_error = NULL,
         updated_at = CURRENT_TIMESTAMP`,
      [agentId],
    );
  }

  async markSeen(agentId: string): Promise<void> {
    await pool.query(
      `INSERT INTO obs_agent_statuses (
          agent_id,
          online,
          connected_at,
          last_seen_at,
          disconnected_at,
          last_error
       ) VALUES (?, TRUE, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, NULL, NULL)
       ON DUPLICATE KEY UPDATE
         online = TRUE,
         last_seen_at = CURRENT_TIMESTAMP,
         disconnected_at = NULL,
         updated_at = CURRENT_TIMESTAMP`,
      [agentId],
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
          last_error
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
          last_error
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
    return {
      agentId: row.agent_id,
      online: Boolean(row.online),
      connectedAt: this.toIsoTimestamp(row.connected_at),
      lastSeenAt: this.toIsoTimestamp(row.last_seen_at),
      disconnectedAt: this.toIsoTimestamp(row.disconnected_at),
      lastError: row.last_error,
    };
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
