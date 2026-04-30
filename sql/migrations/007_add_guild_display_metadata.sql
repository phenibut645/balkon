ALTER TABLE guilds
  ADD COLUMN display_name VARCHAR(255) NULL AFTER ds_guild_id,
  ADD COLUMN icon_url TEXT NULL AFTER display_name;
