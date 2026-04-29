import { FastifyReply, FastifyRequest } from "fastify";
import { ApiAuthUser, ApiRole } from "../types/auth.js";

const DEV_USER_HEADER = "x-dev-discord-id";
const DEV_ROLES_HEADER = "x-dev-roles";

function isDevHeaderAuthEnabled(): boolean {
  const isProd = process.env.NODE_ENV === "prod";
  const envFlagEnabled = process.env.API_DEV_AUTH_ENABLED === "true";
  return !isProd && envFlagEnabled;
}

function parseRoles(rawRoles: unknown): ApiRole[] {
  if (typeof rawRoles !== "string") {
    return [];
  }

  const acceptedRoles = new Set<ApiRole>(["bot_admin", "bot_contributor", "guild_founder"]);
  const roles = rawRoles
    .split(",")
    .map(role => role.trim().toLowerCase())
    .filter((role): role is ApiRole => acceptedRoles.has(role as ApiRole));

  return Array.from(new Set(roles));
}

export function resolveAuthUser(request: FastifyRequest): ApiAuthUser | null {
  if (!isDevHeaderAuthEnabled()) {
    return null;
  }

  const rawDiscordId = request.headers[DEV_USER_HEADER] as string | undefined;
  if (!rawDiscordId || !rawDiscordId.trim()) {
    return null;
  }

  const roles = parseRoles(request.headers[DEV_ROLES_HEADER]);
  return {
    discordId: rawDiscordId.trim(),
    roles,
  };
}

export async function attachDevSession(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
  // TODO: Replace with real Discord OAuth session handling.
  // Security boundary:
  // - production: never trust x-dev-* headers
  // - non-production: only allow x-dev-* when API_DEV_AUTH_ENABLED=true
  request.authUser = resolveAuthUser(request);
}
