// Locale selection and message formatting. Diagnostics and error codes stay English; only user-facing text is localised.

import { en, type Messages } from "./en.ts";
import { es } from "./es.ts";

export const CATALOGS = { en, es } satisfies Record<string, Messages>;

export type Locale = keyof typeof CATALOGS;

/**
 * Picks the locale from the standard environment variables (LC_ALL, LC_MESSAGES, LANG).
 *
 * @param env - Environment.
 * @returns Supported locale, English by default.
 */
export function detectLocale(env: NodeJS.ProcessEnv = process.env): Locale {
	const raw = env["LC_ALL"] || env["LC_MESSAGES"] || env["LANG"] || "";

	return raw.toLowerCase().startsWith("es") ? "es" : "en";
}

/**
 * A message with plural forms; "one" and "other" cover English and Spanish.
 */
export interface PluralForms {
	one: string;
	other: string;
}

/**
 * Picks the plural form for a count.
 *
 * @param locale - Locale.
 * @param forms - Message per plural category.
 * @param count - The count.
 * @returns Formatted text.
 */
export function plural(locale: Locale, forms: PluralForms, count: number): string {
	const category = new Intl.PluralRules(locale).select(count);

	return format(category === "one" ? forms.one : forms.other, { count });
}

/**
 * Replaces `{name}` placeholders.
 *
 * @param template - Message template.
 * @param params - Values.
 * @returns Formatted text.
 */
export function format(template: string, params: Record<string, string | number> = {}): string {
	return template.replace(/\{(\w+)\}/gu, function value(match, key: string) {
		return key in params ? String(params[key]) : match;
	});
}
