import { FastifyInstance } from "fastify";
import { ItemService } from "../../core/ItemService.js";
import { getBotAdminDashboardStats } from "../../core/BotAdmin.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { requireBotContributor } from "../middleware/requireBotContributor.js";
import { requireBotAdmin } from "../middleware/requireBotAdmin.js";

export async function registerDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get("/me", { preHandler: requireAuth }, async request => ({
    ok: true,
    me: {
      discordId: request.authUser!.discordId,
      roles: request.authUser!.roles,
      username: request.authUser!.username ?? null,
      globalName: request.authUser!.globalName ?? null,
      avatar: request.authUser!.avatar ?? null,
      avatarUrl: request.authUser!.avatarUrl ?? null,
    },
  }));

  app.get("/inventory", { preHandler: requireAuth }, async request => {
    const response = await ItemService.getInstance().getInventory(request.authUser!.discordId);
    if (!response.success) {
      return {
        ok: false,
        error: "INVENTORY_LOAD_FAILED",
      };
    }

    return {
      ok: true,
      items: response.data,
    };
  });

  app.get("/market", { preHandler: requireAuth }, async () => {
    const response = await ItemService.getInstance().listPublicMarket();
    if (!response.success) {
      return {
        ok: false,
        error: "MARKET_LOAD_FAILED",
      };
    }

    return {
      ok: true,
      listings: response.data,
    };
  });

  app.get("/botshop", { preHandler: requireAuth }, async () => {
    const response = await ItemService.getInstance().listBotShop();
    if (!response.success) {
      return {
        ok: false,
        error: "BOTSHOP_LOAD_FAILED",
      };
    }

    return {
      ok: true,
      listings: response.data,
    };
  });

  app.get("/craft/recipes", { preHandler: requireAuth }, async () => {
    const response = await ItemService.getInstance().listCraftRecipes();
    if (!response.success) {
      return {
        ok: false,
        error: "RECIPES_LOAD_FAILED",
      };
    }

    return {
      ok: true,
      recipes: response.data,
    };
  });

  app.get("/admin/stats", { preHandler: [requireAuth, requireBotContributor] }, async () => {
    const stats = await getBotAdminDashboardStats();
    return {
      ok: true,
      stats,
    };
  });

  app.get("/admin/items", { preHandler: [requireAuth, requireBotAdmin] }, async () => {
    // TODO: Replace with paged admin item list endpoint.
    return {
      ok: true,
      message: "Admin items route placeholder.",
    };
  });
}
