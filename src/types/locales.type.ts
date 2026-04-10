export enum Locales {
    RU = "ru",
    EN = "en",
    EST = "est"
}

export type LocalesCodes = "ru" | "en" | "est"

export const supportedLocales: LocalesCodes[] = [Locales.RU, Locales.EN, Locales.EST];

export const localeToDateFormat: Record<LocalesCodes, string> = {
    ru: "ru-RU",
    en: "en-US",
    est: "et-EE",
};