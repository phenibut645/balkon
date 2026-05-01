import { ResultSetHeader, RowDataPacket } from "mysql2";
import pool from "../db.js";
import { GeneralSettingsDB } from "../types/database.types.js";

type GeneralSettingsRow = RowDataPacket & GeneralSettingsDB;

const DEFAULT_START_BALANCE = 20;
const DEFAULT_EARNING_MULTIPLY = 1;

export class SettingsService {
  private static instance: SettingsService;

  static getInstance(): SettingsService {
    if (!SettingsService.instance) {
      SettingsService.instance = new SettingsService();
    }

    return SettingsService.instance;
  }

  async getGeneralSettings(): Promise<GeneralSettingsDB | null> {
    const [rows] = await pool.query<GeneralSettingsRow[]>(
      `SELECT *
       FROM general_settings
       ORDER BY id ASC
       LIMIT 1`,
    );

    return rows[0] ?? null;
  }

  async ensureGeneralSettings(): Promise<GeneralSettingsDB> {
    const existing = await this.getGeneralSettings();
    if (existing) {
      return existing;
    }

    const [result] = await pool.query<ResultSetHeader>(
      `INSERT INTO general_settings (start_balance, default_earning_multiply)
       VALUES (?, ?)`,
      [DEFAULT_START_BALANCE, DEFAULT_EARNING_MULTIPLY],
    );

    const [rows] = await pool.query<GeneralSettingsRow[]>(
      `SELECT *
       FROM general_settings
       WHERE id = ?
       LIMIT 1`,
      [result.insertId],
    );

    if (!rows[0]) {
      throw new Error("Failed to create default general_settings row.");
    }

    console.log(
      `Created default general_settings row with start balance ${rows[0].start_balance} and earning multiply ${rows[0].default_earning_multiply}.`,
    );

    return rows[0];
  }

  async dedupeGeneralSettingsDryRun(): Promise<{ rows: GeneralSettingsDB[]; duplicates: GeneralSettingsDB[] }> {
    const [rows] = await pool.query<GeneralSettingsRow[]>(
      `SELECT *
       FROM general_settings
       ORDER BY id ASC`,
    );

    return {
      rows,
      duplicates: rows.slice(1),
    };
  }

  async dedupeGeneralSettingsApply(): Promise<{ kept: GeneralSettingsDB | null; deleted: GeneralSettingsDB[] }> {
    const { rows, duplicates } = await this.dedupeGeneralSettingsDryRun();
    const kept = rows[0] ?? null;

    if (!kept) {
      const created = await this.ensureGeneralSettings();
      return {
        kept: created,
        deleted: [],
      };
    }

    if (duplicates.length) {
      await pool.query(
        `DELETE FROM general_settings
         WHERE id > ?`,
        [kept.id],
      );
    }

    return {
      kept,
      deleted: duplicates,
    };
  }
}

export const settingsService = SettingsService.getInstance();
