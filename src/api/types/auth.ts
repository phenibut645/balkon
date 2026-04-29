export type ApiRole = "bot_admin" | "bot_contributor" | "guild_founder";

export interface ApiAuthUser {
  discordId: string;
  roles: ApiRole[];
  username?: string | null;
  globalName?: string | null;
  avatar?: string | null;
  avatarUrl?: string | null;
}
