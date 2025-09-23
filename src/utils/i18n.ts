import fs from "fs";
import path from "path";
import { Locales } from "../types/locales.type.js";

const localesPath = path.join(process.cwd(), "locales");
const files = fs.readdirSync(localesPath).filter(f => f.endsWith(".json"));

const translations: Record<string, any> = {};

for (const file of files) {
    const lang = file.replace(".json", "");
    translations[lang] = JSON.parse(fs.readFileSync(path.join(localesPath, file), "utf-8"));
}

export function t(lang: Locales, key: string, variables?: Record<string, string>) {
    let text = key.split(".").reduce((obj, k) => obj?.[k], translations[lang] || translations["en"]);
    if (!text) text = key;

    if (variables) {
        for (const [k, v] of Object.entries(variables)) {
            text = text.replace(`{${k}}`, v);
        }
    }
    return text;
}
