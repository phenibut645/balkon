import { FastifyInstance } from "fastify";
import { UserProfileService } from "../../../core/UserProfileService.js";
import { requireAuth } from "../../middleware/requireAuth.js";

function parseOptionalText(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized.length ? normalized : null;
}

function parseOptionalHomeGuildId(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  if (!normalized) {
    return null;
  }

  if (!/^\d{1,32}$/.test(normalized)) {
    return null;
  }

  return normalized;
}

export async function registerProfileRoutes(app: FastifyInstance): Promise<void> {
  app.get("/profile/me", { preHandler: requireAuth }, async request => {
    try {
      const profileService = UserProfileService.getInstance();
      const profile = await profileService.getCurrentUserProfile(request.authUser!.discordId);
      const availableGuilds = await profileService.listAvailableHomeGuilds(request.authUser!.discordId);

      return {
        ok: true,
        profile,
        availableGuilds,
      };
    } catch {
      return {
        ok: false,
        error: "PROFILE_LOAD_FAILED",
        message: "Failed to load profile.",
      };
    }
  });

  app.patch("/profile/me", { preHandler: requireAuth }, async request => {
    try {
      const body = (request.body ?? {}) as Record<string, unknown>;
      const profileService = UserProfileService.getInstance();

      const homeGuildId = parseOptionalHomeGuildId(body.homeGuildId);
      if (body.homeGuildId !== undefined && homeGuildId === null && body.homeGuildId !== null && String(body.homeGuildId).trim() !== "") {
        return {
          ok: false,
          error: "INVALID_HOME_GUILD",
          message: "homeGuildId must be digits only and max length 32.",
        };
      }

      if (homeGuildId) {
        const knownGuild = await profileService.isKnownGuild(homeGuildId);
        if (!knownGuild) {
          return {
            ok: false,
            error: "INVALID_HOME_GUILD",
            message: "Selected home guild is not known by the bot.",
          };
        }
      }

      let publicDescription = parseOptionalText(body.publicDescription);
      if (publicDescription !== undefined && publicDescription !== null && publicDescription.length > 500) {
        return {
          ok: false,
          error: "INVALID_DESCRIPTION",
          message: "publicDescription must be 500 characters or less.",
        };
      }

      if (publicDescription === "") {
        publicDescription = null;
      }

      const profile = await profileService.updateCurrentUserProfile(request.authUser!.discordId, {
        homeGuildId,
        publicDescription,
      });

      return {
        ok: true,
        profile,
      };
    } catch (error) {
      console.error("[profile/me PATCH] Failed to update profile", error);
      return {
        ok: false,
        error: "PROFILE_UPDATE_FAILED",
        message: "Failed to update profile.",
      };
    }
  });
}