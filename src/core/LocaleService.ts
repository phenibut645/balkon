import { DataBaseHandler, DBResponse, DBResponseSuccess } from "./DataBaseHandler.js";
import { MembersDB } from "../types/database.types.js";
import { LocalesCodes } from "../types/locales.type.js";
import { normalizeLocale } from "../utils/i18n.js";

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
}

export const localeService = LocaleService.getInstance();