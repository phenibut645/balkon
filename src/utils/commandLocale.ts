import { localeService } from "../core/LocaleService.js";
import { LocalesCodes } from "../types/locales.type.js";
import { t } from "./i18n.js";

export async function getUserLocale(discordUserId: string): Promise<LocalesCodes> {
    const response = await localeService.getMemberLocale(discordUserId);
    return response.success ? response.data : "en";
}

export function getYesNo(locale: LocalesCodes, value: boolean): string {
    return t(locale, value ? "menu.common.yes" : "menu.common.no");
}

export function getUnknown(locale: LocalesCodes): string {
    return t(locale, "menu.common.unknown");
}

export function getNotAvailable(locale: LocalesCodes): string {
    return t(locale, "menu.common.not_available");
}

export function getVisibleState(locale: LocalesCodes, value: boolean): string {
    return t(locale, value ? "menu.common.visible" : "menu.common.hidden");
}