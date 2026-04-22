import pool from "../db.js";
import { DataBaseHandler, DBResponse, DBResponseSuccess } from "./DataBaseHandler.js";
import { BotSettingsDB, MembersDB } from "../types/database.types.js";
import { LocalesCodes } from "../types/locales.type.js";
import { normalizeLocale } from "../utils/i18n.js";

const LOCALE_SELECTED_SETTING_PREFIX = "member_locale_selected:";

export class LocaleService {
    private static instance: LocaleService;

    static getInstance(): LocaleService {
        if (!LocaleService.instance) {
            LocaleService.instance = new LocaleService();
        }

        return LocaleService.instance;
    }

    async getMemberLocale(discordUserId: string): Promise<DBResponseSuccess<LocalesCodes>> {
        const memberResponse = await this.ensureMember(discordUserId);
        return {
            success: true,
            data: normalizeLocale(memberResponse.data.locale),
        };
    }

    async hasExplicitLocaleSelection(discordUserId: string): Promise<boolean> {
        const response = await DataBaseHandler.getInstance().getFromTable<BotSettingsDB>(
            "bot_settings",
            { setting_key: this.getLocaleSelectedSettingKey(discordUserId) },
            ["id"]
        );

        return DataBaseHandler.isSuccess(response) && response.data.length > 0;
    }

    async setMemberLocale(discordUserId: string, locale: string): Promise<DBResponse<LocalesCodes>> {
        try {
            const memberResponse = await this.ensureMember(discordUserId);
            const normalizedLocale = normalizeLocale(locale);
            const updateResponse = await DataBaseHandler.getInstance().updateTable(
                "members",
                "locale",
                normalizedLocale,
                { id: memberResponse.data.id }
            );

            if (DataBaseHandler.isFail(updateResponse)) {
                return updateResponse;
            }

            await pool.query(
                `INSERT INTO bot_settings (setting_key, setting_value, updated_by_member_id)
                 VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value), updated_by_member_id = VALUES(updated_by_member_id), updated_at = CURRENT_TIMESTAMP`,
                [this.getLocaleSelectedSettingKey(discordUserId), normalizedLocale, memberResponse.data.id]
            );

            return {
                success: true,
                data: normalizedLocale,
            };
        } catch (error) {
            return DataBaseHandler.errorHandling(error);
        }
    }

    private async ensureMember(discordUserId: string): Promise<DBResponseSuccess<MembersDB>> {
        const existsResponse = await DataBaseHandler.getInstance().isMemberExists(discordUserId, true);
        if (DataBaseHandler.isFail(existsResponse) || !existsResponse.data.memberId) {
            throw new Error("Unable to resolve member.");
        }

        const memberResponse = await DataBaseHandler.getInstance().getFromTable<MembersDB>("members", { id: existsResponse.data.memberId });
        if (DataBaseHandler.isFail(memberResponse) || !memberResponse.data.length) {
            throw new Error("Member record not found.");
        }

        return {
            success: true,
            data: memberResponse.data[0],
        };
    }

    private getLocaleSelectedSettingKey(discordUserId: string): string {
        return `${LOCALE_SELECTED_SETTING_PREFIX}${discordUserId}`;
    }
}

export const localeService = LocaleService.getInstance();