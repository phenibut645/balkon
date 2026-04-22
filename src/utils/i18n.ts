import fs from "fs";
import path from "path";
import { Locales, LocalesCodes, supportedLocales } from "../types/locales.type.js";

const candidateLocalesPaths = [
    path.resolve(import.meta.dirname, "../locales"),
    path.resolve(import.meta.dirname, "../../src/locales"),
];

const localesPath = candidateLocalesPaths.find(candidatePath => fs.existsSync(candidatePath) && fs.statSync(candidatePath).isDirectory());

if (!localesPath) {
    throw new Error(`Locales directory not found. Checked: ${candidateLocalesPaths.join(", ")}`);
}

const files = fs.readdirSync(localesPath).filter(f => f.endsWith(".json"));

const translations: Record<string, any> = {};

for (const file of files) {
    const lang = file.replace(".json", "");
    translations[lang] = JSON.parse(fs.readFileSync(path.join(localesPath, file), "utf-8"));
}

export function t(lang: LocalesCodes, key: string, variables?: Record<string, string>) {
    let text = key.split(".").reduce((obj, k) => obj?.[k], translations[lang] || translations["en"]);
    if (!text) text = key;

    if (variables) {
        for (const [k, v] of Object.entries(variables)) {
            text = text.replace(`{${k}}`, v);
        }
    }
    return text;
}

export function normalizeLocale(value?: string | null): LocalesCodes {
    const normalizedValue = value?.trim().toLowerCase();
    if (!normalizedValue) {
        return Locales.EN;
    }

    if (normalizedValue.startsWith("ru")) {
        return Locales.RU;
    }

    if (normalizedValue.startsWith("en")) {
        return Locales.EN;
    }

    if (normalizedValue === "et" || normalizedValue.startsWith("et-") || normalizedValue.startsWith("est")) {
        return Locales.EST;
    }

    return supportedLocales.includes(normalizedValue as LocalesCodes)
        ? normalizedValue as LocalesCodes
        : Locales.EN;
}
