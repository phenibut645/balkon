import { ResultSetHeader, RowDataPacket } from "mysql2";
import { PoolConnection } from "mysql2/promise";
import pool from "../db.js";

export type BotCommandType =
  | "KICK_MEMBER"
  | "BAN_MEMBER"
  | "UNBAN_MEMBER"
  | "ADD_ROLE"
  | "REMOVE_ROLE"
  | "SEND_CHANNEL_MESSAGE";

export type BotCommandStatus = "pending" | "processing" | "completed" | "failed";

export interface CreateBotCommandInput {
  type: BotCommandType;
  guildId: string | null;
  requestedByDiscordId: string;
  payload: Record<string, unknown>;
}

export interface BotCommandRecord {
  id: number;
  type: BotCommandType;
  guildId: string | null;
  requestedByDiscordId: string;
  payload: Record<string, unknown>;
  status: BotCommandStatus;
  result: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface BotCommandQueue {
  enqueue(input: CreateBotCommandInput): Promise<{ commandId: number }>;
  claimNextPending(): Promise<BotCommandRecord | null>;
  markCompleted(commandId: number, result?: Record<string, unknown>): Promise<void>;
  markFailed(commandId: number, errorMessage: string): Promise<void>;
}

interface BotCommandRow extends RowDataPacket {
  id: number;
  type: BotCommandType;
  guild_id: string | null;
  requested_by_discord_id: string;
  payload_json: string;
  status: BotCommandStatus;
  result_json: string | null;
  error_message: string | null;
  created_at: Date;
  started_at: Date | null;
  completed_at: Date | null;
}

function safeJsonObjectParse(jsonText: string | null): Record<string, unknown> | null {
  if (!jsonText) {
    return null;
  }

  try {
    const parsed = JSON.parse(jsonText);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }

    return null;
  } catch {
    return null;
  }
}

function mapRow(row: BotCommandRow): BotCommandRecord {
  return {
    id: Number(row.id),
    type: row.type,
    guildId: row.guild_id,
    requestedByDiscordId: row.requested_by_discord_id,
    payload: safeJsonObjectParse(row.payload_json) ?? {},
    status: row.status,
    result: safeJsonObjectParse(row.result_json),
    errorMessage: row.error_message,
    createdAt: new Date(row.created_at),
    startedAt: row.started_at ? new Date(row.started_at) : null,
    completedAt: row.completed_at ? new Date(row.completed_at) : null,
  };
}

class DbBotCommandQueue implements BotCommandQueue {
  async enqueue(input: CreateBotCommandInput): Promise<{ commandId: number }> {
    const payloadJson = JSON.stringify(input.payload ?? {});

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO bot_commands (type, guild_id, requested_by_discord_id, payload_json, status)
       VALUES (?, ?, ?, ?, 'pending')`,
      [input.type, input.guildId, input.requestedByDiscordId, payloadJson],
    );

    return { commandId: Number(result.insertId) };
  }

  async claimNextPending(): Promise<BotCommandRecord | null> {
    let connection: PoolConnection | null = null;

    try {
      connection = await pool.getConnection();
      await connection.beginTransaction();

      const [rows] = await connection.query<BotCommandRow[]>(
        `SELECT id, type, guild_id, requested_by_discord_id, payload_json, status, result_json, error_message,
                created_at, started_at, completed_at
         FROM bot_commands
         WHERE status = 'pending'
         ORDER BY id ASC
         LIMIT 1
         FOR UPDATE`,
      );

      if (!rows.length) {
        await connection.rollback();
        return null;
      }

      const row = rows[0];
      const [updateResult] = await connection.query<ResultSetHeader>(
        `UPDATE bot_commands
         SET status = 'processing', started_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending'`,
        [row.id],
      );

      if (updateResult.affectedRows !== 1) {
        await connection.rollback();
        return null;
      }

      await connection.commit();
      row.status = "processing";
      row.started_at = new Date();
      return mapRow(row);
    } catch {
      if (connection) {
        await connection.rollback();
      }

      return null;
    } finally {
      connection?.release();
    }
  }

  async markCompleted(commandId: number, result?: Record<string, unknown>): Promise<void> {
    await pool.query(
      `UPDATE bot_commands
       SET status = 'completed', result_json = ?, error_message = NULL, completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [result ? JSON.stringify(result) : null, commandId],
    );
  }

  async markFailed(commandId: number, errorMessage: string): Promise<void> {
    await pool.query(
      `UPDATE bot_commands
       SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [errorMessage.slice(0, 4000), commandId],
    );
  }
}

let queueInstance: BotCommandQueue | null = null;

export function getBotCommandQueue(): BotCommandQueue {
  if (!queueInstance) {
    queueInstance = new DbBotCommandQueue();
  }

  return queueInstance;
}
