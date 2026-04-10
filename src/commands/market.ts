import { AutocompleteInteraction, ChatInputCommandInteraction, EmbedBuilder, SlashCommandBuilder } from "discord.js";
import { itemService } from "../core/ItemService.js";
import { Command } from "../core/commands/Command.js";
import { CommandAccessLevels } from "../types/database.types.js";
import { CommandName } from "../types/command.type.js";
import { getUserLocale } from "../utils/commandLocale.js";
import { t } from "../utils/i18n.js";

export default class MarketCommand extends Command {
    commandName: CommandName = "market";
    commandAccessLevel = CommandAccessLevels.Public;
    data = new SlashCommandBuilder()
        .setName(this.commandName)
        .setDescription("Global player market.")
        .addSubcommand(subcommand =>
            subcommand
                .setName("list")
                .setDescription("Show public market listings.")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("sell")
                .setDescription("List one inventory item on the market.")
                .addIntegerOption(option =>
                    option.setName("inventory_item_id")
                        .setDescription("Your inventory item id")
                        .setAutocomplete(true)
                        .setRequired(true)
                )
                .addNumberOption(option =>
                    option.setName("price")
                        .setDescription("ODM price")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("my")
                .setDescription("Show your own active market listings.")
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("edit")
                .setDescription("Update the price of your own market listing.")
                .addIntegerOption(option =>
                    option.setName("listing_id")
                        .setDescription("Your market listing id")
                        .setAutocomplete(true)
                        .setRequired(true)
                )
                .addNumberOption(option =>
                    option.setName("price")
                        .setDescription("New ODM price")
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("cancel")
                .setDescription("Cancel your own market listing.")
                .addIntegerOption(option =>
                    option.setName("listing_id")
                        .setDescription("Your market listing id")
                        .setAutocomplete(true)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName("buy")
                .setDescription("Buy one public market listing.")
                .addIntegerOption(option =>
                    option.setName("listing_id")
                        .setDescription("Market listing id")
                        .setAutocomplete(true)
                        .setRequired(true)
                )
        );

    async execute(interaction: ChatInputCommandInteraction): Promise<void> {
        const locale = await getUserLocale(interaction.user.id);
        const subcommand = interaction.options.getSubcommand();

        if (subcommand === "list") {
            const response = await itemService.listPublicMarket();
            if (!response.success) {
                await interaction.reply({ content: response.error.message ?? t(locale, "commands.market.load_failed"), flags: ["Ephemeral"] });
                return;
            }

            if (!response.data.length) {
                await interaction.reply({ content: t(locale, "commands.market.empty"), flags: ["Ephemeral"] });
                return;
            }

            const text = response.data.slice(0, 20).map(listing =>
                t(locale, "commands.market.line", {
                    id: String(listing.listingId),
                    emoji: listing.emoji ?? "📦",
                    name: listing.name,
                    rarity: listing.rarityName,
                    price: String(listing.price),
                    seller: `<@${listing.sellerDiscordId}>`,
                })
            ).join("\n");

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(t(locale, "commands.market.title"))
                        .setDescription(text)
                        .addFields(
                            { name: t(locale, "commands.market.summary_label"), value: t(locale, "commands.market.summary_value", { count: String(response.data.length) }) },
                            { name: t(locale, "commands.market.actions_label"), value: t(locale, "commands.market.actions_value") },
                        )
                ],
                flags: ["Ephemeral"],
            });
            return;
        }

        if (subcommand === "my") {
            const response = await itemService.listUserPublicMarket(interaction.user.id);
            if (!response.success) {
                await interaction.reply({ content: response.error.message ?? t(locale, "commands.market.load_failed"), flags: ["Ephemeral"] });
                return;
            }

            if (!response.data.length) {
                await interaction.reply({ content: t(locale, "commands.market.own_empty"), flags: ["Ephemeral"] });
                return;
            }

            const text = response.data.slice(0, 20).map(listing =>
                t(locale, "commands.market.line", {
                    id: String(listing.listingId),
                    emoji: listing.emoji ?? "📦",
                    name: listing.name,
                    rarity: listing.rarityName,
                    price: String(listing.price),
                    seller: `<@${listing.sellerDiscordId}>`,
                })
            ).join("\n");

            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setTitle(t(locale, "commands.market.own_title"))
                        .setDescription(text)
                        .addFields(
                            { name: t(locale, "commands.market.summary_label"), value: t(locale, "commands.market.own_summary_value", { count: String(response.data.length) }) },
                            { name: t(locale, "commands.market.actions_label"), value: t(locale, "commands.market.manage_actions_value") },
                        )
                ],
                flags: ["Ephemeral"],
            });
            return;
        }

        if (subcommand === "sell") {
            const inventoryItemId = interaction.options.getInteger("inventory_item_id", true);
            const price = interaction.options.getNumber("price", true);

            if (price <= 0) {
                await interaction.reply({ content: t(locale, "commands.market.price_positive"), flags: ["Ephemeral"] });
                return;
            }

            const response = await itemService.createPublicListing(interaction.user.id, inventoryItemId, price);
            if (!response.success) {
                await interaction.reply({ content: response.error.message ?? t(locale, "commands.market.create_failed"), flags: ["Ephemeral"] });
                return;
            }

            await interaction.reply({
                content: t(locale, "commands.market.sell_created", {
                    listingId: String(response.data.listingId),
                    inventoryItemId: String(inventoryItemId),
                    price: String(Number(price.toFixed(2))),
                }),
                flags: ["Ephemeral"],
            });
            return;
        }

        if (subcommand === "edit") {
            const listingId = interaction.options.getInteger("listing_id", true);
            const price = interaction.options.getNumber("price", true);

            if (price <= 0) {
                await interaction.reply({ content: t(locale, "commands.market.price_positive"), flags: ["Ephemeral"] });
                return;
            }

            const response = await itemService.updatePublicListingPrice(interaction.user.id, listingId, price);
            if (!response.success) {
                await interaction.reply({ content: response.error.message ?? t(locale, "commands.market.update_failed"), flags: ["Ephemeral"] });
                return;
            }

            await interaction.reply({
                content: t(locale, "commands.market.update_success", {
                    listingId: String(listingId),
                    price: String(Number(price.toFixed(2))),
                }),
                flags: ["Ephemeral"],
            });
            return;
        }

        if (subcommand === "cancel") {
            const listingId = interaction.options.getInteger("listing_id", true);
            const response = await itemService.cancelPublicListing(interaction.user.id, listingId);

            if (!response.success) {
                await interaction.reply({ content: response.error.message ?? t(locale, "commands.market.cancel_failed"), flags: ["Ephemeral"] });
                return;
            }

            await interaction.reply({
                content: t(locale, "commands.market.cancel_success", {
                    listingId: String(listingId),
                    inventoryItemId: String(response.data.inventoryItemId),
                }),
                flags: ["Ephemeral"],
            });
            return;
        }

        if (subcommand === "buy") {
            const listingId = interaction.options.getInteger("listing_id", true);
            const response = await itemService.buyPublicListing(interaction.user.id, listingId);

            if (!response.success) {
                await interaction.reply({ content: response.error.message ?? t(locale, "commands.market.buy_failed"), flags: ["Ephemeral"] });
                return;
            }

            await interaction.reply({
                content: t(locale, "commands.market.buy_success", {
                    listingId: String(listingId),
                    inventoryItemId: String(response.data.inventoryItemId),
                }),
                flags: ["Ephemeral"],
            });
        }
    }

    autocomplete = async (interaction: AutocompleteInteraction): Promise<void> => {
        const focused = interaction.options.getFocused(true);
        const subcommand = interaction.options.getSubcommand();
        if (focused.name === "inventory_item_id") {
            const response = await itemService.searchUserInventory(interaction.user.id, String(focused.value ?? ""));
            await interaction.respond(response.success ? response.data : []);
            return;
        }

        if (focused.name === "listing_id") {
            const response = subcommand === "buy"
                ? await itemService.searchPublicListings(String(focused.value ?? ""))
                : await itemService.searchUserPublicListings(interaction.user.id, String(focused.value ?? ""));
            await interaction.respond(response.success ? response.data : []);
            return;
        }

        await interaction.respond([]);
    };
}
