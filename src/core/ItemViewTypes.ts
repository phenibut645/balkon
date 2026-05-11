import type { RowDataPacket } from "mysql2";

export interface ItemTemplateRow extends RowDataPacket {
    id: number;
    name: string;
    description: string;
    name_ru: string | null;
    name_en: string | null;
    name_et: string | null;
    description_ru: string | null;
    description_en: string | null;
    description_et: string | null;
    emoji: string | null;
    image_url: string | null;
    tradeable: number;
    sellable: number;
    bot_sell_price: number | null;
    item_type_name: string;
    rarity_name: string;
    rarity_color_hex: string | null;
}

export interface ItemRarityView {
    id: number;
    name: string;
    colorHex: string | null;
}

export interface InventoryItemView {
    inventoryItemId: number;
    ownerDiscordId: string;
    ownerDisplayName: string;
    ownerAvatarUrl: string | null;
    originalOwnerDiscordId: string | null;
    originalOwnerDisplayName: string | null;
    originalOwnerAvatarUrl: string | null;
    obtainedAt: Date;
    tier: number;
    itemTemplateId: number;
    name: string;
    description: string;
    nameRu: string | null;
    nameEn: string | null;
    nameEt: string | null;
    descriptionRu: string | null;
    descriptionEn: string | null;
    descriptionEt: string | null;
    emoji: string | null;
    imageUrl: string | null;
    tradeable: boolean;
    sellable: boolean;
    botSellPrice: number | null;
    itemType: string;
    rarityName: string;
    rarityColorHex: string | null;
}

export interface PublicMarketListingView extends InventoryItemView {
    listingId: number;
    sellerDiscordId: string;
    sellerDisplayName: string;
    sellerAvatarUrl: string | null;
    price: number;
}

export interface BotShopListingView {
    listingId: number;
    price: number;
    itemTemplateId: number;
    name: string;
    description: string;
    nameRu: string | null;
    nameEn: string | null;
    nameEt: string | null;
    descriptionRu: string | null;
    descriptionEn: string | null;
    descriptionEt: string | null;
    emoji: string | null;
    imageUrl: string | null;
    tradeable: boolean;
    sellable: boolean;
    botSellPrice: number | null;
    itemType: string;
    rarityName: string;
    rarityColorHex: string | null;
}

export interface AutocompleteOption {
    name: string;
    value: string | number;
}

export interface ItemTemplateView {
    id: number;
    name: string;
    description: string;
    nameRu: string | null;
    nameEn: string | null;
    nameEt: string | null;
    descriptionRu: string | null;
    descriptionEn: string | null;
    descriptionEt: string | null;
    emoji: string | null;
    imageUrl: string | null;
    tradeable: boolean;
    sellable: boolean;
    botSellPrice: number | null;
    itemType: string;
    rarityName: string;
    rarityColorHex: string | null;
}

export interface CraftRecipeIngredientView {
    itemTemplateId: number;
    name: string;
    nameRu: string | null;
    nameEn: string | null;
    nameEt: string | null;
    description: string;
    descriptionRu: string | null;
    descriptionEn: string | null;
    descriptionEt: string | null;
    emoji: string | null;
    amount: number;
}

export interface CraftRecipeView {
    recipeId: number;
    name: string;
    description: string | null;
    resultAmount: number;
    resultItemTemplateId: number;
    resultName: string;
    resultNameRu: string | null;
    resultNameEn: string | null;
    resultNameEt: string | null;
    resultDescription: string;
    resultDescriptionRu: string | null;
    resultDescriptionEn: string | null;
    resultDescriptionEt: string | null;
    resultEmoji: string | null;
    resultRarityName: string;
    ingredients: CraftRecipeIngredientView[];
}