ALTER TABLE members
  ADD COLUMN discord_username VARCHAR(255) NULL AFTER ds_member_id,
  ADD COLUMN discord_global_name VARCHAR(255) NULL AFTER discord_username,
  ADD COLUMN discord_avatar VARCHAR(255) NULL AFTER discord_global_name,
  ADD COLUMN discord_avatar_url TEXT NULL AFTER discord_avatar,
  ADD COLUMN discord_profile_updated_at TIMESTAMP NULL AFTER discord_avatar_url;
