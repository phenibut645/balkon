
import type { DBResponse, DBResponseSuccess } from "./DataBaseHandler.js";

import { memberService } from "./MemberService.js";
import { BotSettingsDB, MembersDB } from "../types/database.types.js";
import { LocalesCodes } from "../types/locales.type.js";
import { normalizeLocale } from "../utils/i18n.js";

import { localePreferenceRepository } from "./LocalePreferenceRepository.js";

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
        return await localePreferenceRepository.hasExplicitLocaleSelection(discordUserId);
    }

    async setMemberLocale(discordUserId: string, locale: string): Promise<DBResponse<LocalesCodes>> {
        try {
            const memberResponse = await this.ensureMember(discordUserId);
            const normalizedLocale = normalizeLocale(locale);
            const updateResponse = await localePreferenceRepository.updateMemberLocale(
                memberResponse.data.id,
                normalizedLocale
            );
            if (!updateResponse.success) {
                return updateResponse;
            }
            await localePreferenceRepository.upsertExplicitLocaleSelection(
                discordUserId,
                normalizedLocale,
                memberResponse.data.id
            );
            return {
                success: true,
                data: normalizedLocale,
            };
        } catch (error) {
            // Use a local error handler to match legacy DBResponseFail shape
            return {
                success: false,
                error: {
                    reason: "unknown",
                    relatedTo: "unknown",
                    message: error instanceof Error ? error.message : String(error),
                }
            };
        }
    }

    private async ensureMember(discordUserId: string): Promise<DBResponseSuccess<{ id: number; locale: string | null }>> {
        let memberId: number;
        try {
            memberId = await memberService.ensureMemberByDiscordId(discordUserId, { createdSource: "unknown" });
        } catch {
            throw new Error("Unable to resolve member.");
        }
        return await localePreferenceRepository.getMemberById(memberId);
    }
}

export const localeService = LocaleService.getInstance();