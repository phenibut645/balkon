import pool from "../db.js";
import { ResultSetHeader, RowDataPacket } from "mysql2";
import type { DBResponse, DBResponseSuccess, DBResponseFail } from "./DataBaseHandler.js";

export class LocalePreferenceRepository {
    private static instance: LocalePreferenceRepository;
    static getInstance(): LocalePreferenceRepository {
        if (!LocalePreferenceRepository.instance) {
            LocalePreferenceRepository.instance = new LocalePreferenceRepository();
        }
        return LocalePreferenceRepository.instance;
    }

    // Load member row by id (for locale)
    async getMemberById(memberId: number): Promise<DBResponseSuccess<{ id: number; locale: string | null }>> {
        const [rows] = await pool.query<RowDataPacket[]>(
            `SELECT id, locale FROM members WHERE id = ? LIMIT 1`,
            [memberId]
        );
        if (!rows.length) {
            throw new Error("Member record not found.");
        }
        return { success: true, data: { id: rows[0].id, locale: rows[0].locale } };
    }

    // Update members.locale by member id
    async updateMemberLocale(memberId: number, locale: string): Promise<DBResponse<null>> {
        try {
            const [result] = await pool.query<ResultSetHeader>(
                `UPDATE members SET locale = ? WHERE id = ?`,
                [locale, memberId]
            );
            if (result.affectedRows !== 1) {
                return {
                    success: false,
                    error: {
                        reason: "record_not_found",
                        relatedTo: "members",
                        message: "Member not found or locale not updated."
                    }
                };
            }
            return { success: true, data: null };
        } catch (error) {
            return this.errorHandling(error, "members");
        }
    }

    // Check if explicit locale selection exists in bot_settings
    async hasExplicitLocaleSelection(discordUserId: string): Promise<boolean> {
        try {
            const settingKey = this.getLocaleSelectedSettingKey(discordUserId);
            const [rows] = await pool.query<RowDataPacket[]>(
                `SELECT id FROM bot_settings WHERE setting_key = ? LIMIT 1`,
                [settingKey]
            );
            return rows.length > 0;
        } catch {
            return false;
        }
    }

    // Upsert explicit locale selection marker in bot_settings
    async upsertExplicitLocaleSelection(discordUserId: string, locale: string, updatedByMemberId: number): Promise<void> {
        const settingKey = this.getLocaleSelectedSettingKey(discordUserId);
        await pool.query(
            `INSERT INTO bot_settings (setting_key, setting_value, updated_by_member_id)
             VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by_member_id = VALUES(updated_by_member_id), updated_at = CURRENT_TIMESTAMP`,
            [settingKey, locale, updatedByMemberId]
        );
    }

    private getLocaleSelectedSettingKey(discordUserId: string): string {
        return `member_locale_selected:${discordUserId}`;
    }

    private errorHandling(error: unknown, relatedTo: string): DBResponseFail {
        return {
            success: false,
            error: {
                reason: "mysql_error",
                relatedTo: relatedTo as any,
                message: error instanceof Error ? error.message : String(error),
            }
        };
    }
}

export const localePreferenceRepository = LocalePreferenceRepository.getInstance();
