export type ApiRole = "bot_admin" | "bot_contributor" | "guild_founder";

export interface ApiAuthUser {
  discordId: string;
  roles: ApiRole[];
}
