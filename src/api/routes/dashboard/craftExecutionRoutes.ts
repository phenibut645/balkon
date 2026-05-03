import { FastifyInstance } from "fastify";
import { ItemService } from "../../../core/ItemService.js";
import { requireAuth } from "../../middleware/requireAuth.js";

type ItemMutationError = {
  reason?: string;
  relatedTo?: string;
  message?: string;
};

function parsePositiveInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    if (Number.isInteger(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return null;
}

function craftErrorResponse(defaultMessage: string, error?: ItemMutationError) {
  if (error?.reason === "record_not_found" && error.relatedTo === "craft_recipes") {
    return {
      ok: false,
      error: "CRAFT_RECIPE_NOT_FOUND",
      message: error.message || defaultMessage,
    };
  }

  if (error?.relatedTo === "member_items") {
    return {
      ok: false,
      error: "CRAFT_REQUIREMENTS_MISSING",
      message: error.message || defaultMessage,
    };
  }

  return {
    ok: false,
    error: "CRAFT_EXECUTION_FAILED",
    message: error?.message || defaultMessage,
  };
}

export async function registerCraftExecutionRoutes(app: FastifyInstance): Promise<void> {
  app.post("/craft/:recipeId/craft", { preHandler: requireAuth }, async request => {
    const recipeId = parsePositiveInteger((request.params as { recipeId?: string }).recipeId);
    if (!recipeId) {
      return {
        ok: false,
        error: "INVALID_RECIPE_ID",
        message: "recipeId must be a positive integer.",
      };
    }

    const body = (request.body ?? {}) as { amount?: unknown; craftCount?: unknown };
    const craftCount = parsePositiveInteger(body.craftCount ?? body.amount ?? 1);
    if (!craftCount) {
      return {
        ok: false,
        error: "CRAFT_EXECUTION_FAILED",
        message: "craftCount must be a positive integer.",
      };
    }

    const itemService = ItemService.getInstance();
    const recipeResponse = await itemService.getCraftRecipeById(recipeId);
    if (!recipeResponse.success) {
      return craftErrorResponse("Failed to load craft recipe.", recipeResponse.error);
    }

    if (!recipeResponse.data) {
      return {
        ok: false,
        error: "CRAFT_RECIPE_NOT_FOUND",
        message: "Craft recipe not found.",
      };
    }

    const response = await itemService.craftForMember(request.authUser!.discordId, recipeId, craftCount);
    if (!response.success) {
      return craftErrorResponse("Failed to craft recipe.", response.error);
    }

    return {
      ok: true,
      data: {
        recipeId,
        crafted: response.data.crafted,
        resultItemTemplateId: response.data.resultItemTemplateId,
        resultAmount: response.data.resultAmount,
        consumedIngredients: recipeResponse.data.ingredients.map(ingredient => ({
          itemTemplateId: ingredient.itemTemplateId,
          name: ingredient.name,
          emoji: ingredient.emoji,
          amount: ingredient.amount * response.data.crafted,
        })),
      },
    };
  });
}
