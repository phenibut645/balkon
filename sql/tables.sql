DROP DATABASE IF EXISTS test_balkon;
CREATE DATABASE IF NOT EXISTS test_balkon;
USE test_balkon;

CREATE TABLE guilds (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ds_guild_id VARCHAR(255) UNIQUE,
    display_name VARCHAR(255) NULL,
    icon_url TEXT NULL,
    earning_multiply FLOAT DEFAULT 1.0
);

CREATE TABLE log_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name varchar(255) NOT NULL
);

CREATE TABLE logs_channels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id INT NOT NULL,
    log_type_id INT NOT NULL,
    ds_channel_id VARCHAR(255),
    FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
    FOREIGN KEY (log_type_id) REFERENCES log_types(id) ON DELETE CASCADE
);

CREATE TABLE guild_roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id INT NOT NULL,
    ds_role_id VARCHAR(255) NOT NULL,
    FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
);

CREATE TABLE members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ds_member_id VARCHAR(255) NOT NULL UNIQUE,
    balance int DEFAULT 0,
    ldm_balance int DEFAULT 0,
    home_guild_id VARCHAR(32) NULL,
    public_description VARCHAR(500) NULL,
    locale VARCHAR(8) NOT NULL DEFAULT 'en'
);

CREATE INDEX idx_members_home_guild_id ON members(home_guild_id);
CREATE INDEX idx_members_balance ON members(balance);

CREATE TABLE member_roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL,
    guild_role_id INT NOT NULL,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (guild_role_id) REFERENCES guild_roles(id) ON DELETE CASCADE
);

CREATE TABLE guild_member_statuses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL
);

INSERT INTO guild_member_statuses(name) VALUES ("default"), ("guild_owner");

CREATE TABLE guild_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id INT NOT NULL,
    member_id INT NOT NULL,
    member_status_id INT NOT NULL,
    FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (member_status_id) REFERENCES guild_member_statuses(id) ON DELETE CASCADE
);

CREATE TABLE command_access_levels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE
);

INSERT INTO command_access_levels(name) VALUES ("public"), ("private");

CREATE TABLE commands (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tag VARCHAR(255) NOT NULL UNIQUE,
    command_access_level_id INT NOT NULL,
    FOREIGN KEY (command_access_level_id) REFERENCES command_access_levels(id) ON DELETE CASCADE
);

CREATE TABLE member_command_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_member_id INT NOT NULL,
    command_id INT NOT NULL,
    allowed BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (guild_member_id) REFERENCES guild_members(id) ON DELETE CASCADE,
    FOREIGN KEY (command_id) REFERENCES commands(id) ON DELETE CASCADE
);

CREATE TABLE role_command_permissions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_role_id INT NOT NULL,
    command_id INT NOT NULL,
    allowed BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (guild_role_id) REFERENCES guild_roles(id) ON DELETE CASCADE,
    FOREIGN KEY (command_id) REFERENCES commands(id) ON DELETE CASCADE
);

CREATE TABLE item_types (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE
);

INSERT INTO item_types(name)
VALUES 
    ("material"),
    ("role"),
    ("treasure"),
    ("service"),
    ("misc"),
    ("unknown");

CREATE TABLE item_rarities (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    color_hex VARCHAR(7) NULL
);

INSERT INTO item_rarities (name, color_hex)
VALUES
    ("trash", "#777777"),
    ("common", "#ffffff"),
    ("cool", "#2ecc71"),
    ("exclusive", "#f1c40f"),
    ("unknown", "#95a5a6");

CREATE TABLE items(
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_type_id INT DEFAULT 6,
    item_rarity_id INT DEFAULT 5,
    name VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    emoji VARCHAR(64) NULL,
    added_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sellable BOOLEAN DEFAULT FALSE,
    tradeable BOOLEAN DEFAULT FALSE,
    image_url TEXT NULL,
    bot_sell_price DECIMAL(10, 2) NULL,
    created_by_member_id INT NULL,
    FOREIGN KEY (item_type_id) REFERENCES item_types(id) ON DELETE CASCADE,
    FOREIGN KEY (item_rarity_id) REFERENCES item_rarities(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_member_id) REFERENCES members(id) ON DELETE SET NULL
);

CREATE TABLE schema_migrations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    migration_name VARCHAR(255) NOT NULL UNIQUE,
    applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE member_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL,
    item_id INT NOT NULL,
    tier INT NOT NULL,
    obtained_at TIMESTAMP NOT NULL,
    original_owner_member_id INT NULL,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (original_owner_member_id) REFERENCES members(id) ON DELETE SET NULL
);

CREATE INDEX idx_items_name ON items(name);
CREATE INDEX idx_member_items_member_id ON member_items(member_id);
CREATE INDEX idx_member_items_item_id ON member_items(item_id);

CREATE TABLE item_public_market (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_item_id INT NOT NULL,
    price FLOAT NOT NULL,
    UNIQUE KEY uniq_public_market_member_item (member_item_id),
    FOREIGN KEY (member_item_id) REFERENCES member_items(id) ON DELETE CASCADE
);

CREATE TABLE item_general_store (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    price FLOAT NOT NULL,
    UNIQUE KEY uniq_general_store_item (item_id),
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE item_treasures (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE treasure_contents (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_treasure_id INT NOT NULL,
    item_id INT NOT NULL,
    FOREIGN KEY (item_treasure_id) REFERENCES item_treasures(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE item_roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL,
    color VARCHAR(255) NOT NULL,
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
);

CREATE TABLE guild_item_roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_role_id INT NOT NULL,
    guild_id INT NOT NULL,
    guild_role_id INT NOT NULL,
    FOREIGN KEY (item_role_id) REFERENCES item_roles(id) ON DELETE CASCADE,
    FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
    FOREIGN KEY (guild_role_id) REFERENCES guild_roles(id) ON DELETE CASCADE
);

CREATE TABLE craft_recipes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT NULL,
    result_item_id INT NOT NULL,
    result_amount INT NOT NULL DEFAULT 1,
    created_by_member_id INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (result_item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_member_id) REFERENCES members(id) ON DELETE SET NULL
);

CREATE TABLE craft_recipe_ingredients (
    id INT AUTO_INCREMENT PRIMARY KEY,
    craft_recipe_id INT NOT NULL,
    item_id INT NOT NULL,
    amount INT NOT NULL,
    FOREIGN KEY (craft_recipe_id) REFERENCES craft_recipes(id) ON DELETE CASCADE,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    UNIQUE KEY uniq_craft_recipe_ingredient (craft_recipe_id, item_id)
);

CREATE INDEX idx_craft_recipes_name ON craft_recipes(name);
CREATE INDEX idx_craft_recipe_ingredients_recipe_id ON craft_recipe_ingredients(craft_recipe_id);

CREATE TABLE bot_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(255) NOT NULL UNIQUE,
    setting_value TEXT NULL,
    updated_by_member_id INT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (updated_by_member_id) REFERENCES members(id) ON DELETE SET NULL
);

CREATE TABLE bot_commands (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    type VARCHAR(64) NOT NULL,
    guild_id VARCHAR(32) NULL,
    requested_by_discord_id VARCHAR(32) NOT NULL,
    payload_json JSON NOT NULL,
    status ENUM('pending', 'processing', 'completed', 'failed') NOT NULL DEFAULT 'pending',
    result_json JSON NULL,
    error_message TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP NULL,
    completed_at TIMESTAMP NULL
);

CREATE INDEX idx_bot_commands_status_id ON bot_commands(status, id);
CREATE INDEX idx_bot_commands_requested_by ON bot_commands(requested_by_discord_id);
CREATE INDEX idx_bot_commands_guild_id ON bot_commands(guild_id);

CREATE TABLE api_sessions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    session_token_hash CHAR(64) NOT NULL UNIQUE,
    discord_id VARCHAR(32) NOT NULL,
    username VARCHAR(255) NULL,
    global_name VARCHAR(255) NULL,
    avatar VARCHAR(255) NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NULL,
    token_expires_at TIMESTAMP NULL,
    scopes VARCHAR(255) NOT NULL,
    user_json JSON NULL,
    guilds_json JSON NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    revoked_at TIMESTAMP NULL
);

CREATE INDEX idx_api_sessions_discord_id ON api_sessions(discord_id);
CREATE INDEX idx_api_sessions_expires_at ON api_sessions(expires_at);

CREATE TABLE economy_daily_snapshots (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    snapshot_date DATE NOT NULL UNIQUE,
    total_odm BIGINT NOT NULL DEFAULT 0,
    total_ldm BIGINT NOT NULL DEFAULT 0,
    members_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_economy_daily_snapshots_date ON economy_daily_snapshots(snapshot_date);

CREATE TABLE streamers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nickname VARCHAR(255) UNIQUE NOT NULL,
    twitch_url VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE guild_streamers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_id INT NOT NULL,
    streamer_id INT NOT NULL,
    is_primary BOOLEAN NOT NULL DEFAULT FALSE,
    created_by_member_id INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_guild_streamer (guild_id, streamer_id),
    FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE,
    FOREIGN KEY (streamer_id) REFERENCES streamers(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_member_id) REFERENCES members(id) ON DELETE SET NULL
);

CREATE TABLE item_service_actions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    item_id INT NOT NULL UNIQUE,
    action_type VARCHAR(64) NOT NULL,
    scene_name VARCHAR(255) NULL,
    source_name VARCHAR(255) NULL,
    text_template TEXT NULL,
    media_action VARCHAR(128) NULL,
    visible BOOLEAN NULL,
    consume_on_use BOOLEAN NOT NULL DEFAULT TRUE,
    updated_by_member_id INT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
    FOREIGN KEY (updated_by_member_id) REFERENCES members(id) ON DELETE SET NULL
);

CREATE INDEX idx_guild_streamers_guild_id ON guild_streamers(guild_id);
CREATE INDEX idx_guild_streamers_streamer_id ON guild_streamers(streamer_id);

CREATE TABLE mute_roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_role_id INT NOT NULL,
    FOREIGN KEY (guild_role_id) REFERENCES guild_roles(id) ON DELETE CASCADE
);

CREATE TABLE banned_members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_member_id INT NOT NULL,
    reason TEXT,
    banned_at TIMESTAMP NOT NULL,
    ban_time INT,
    FOREIGN KEY (guild_member_id) REFERENCES guild_members(id) ON DELETE CASCADE
);

CREATE TABLE muted_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    guild_member_id INT NOT NULL,
    reason TEXT NOT NULL,
    muted_at TIMESTAMP NOT NULL,
    mute_time INT NOT NULL,
    FOREIGN KEY (guild_member_id) REFERENCES guild_members(id) ON DELETE CASCADE
);

CREATE TABLE general_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    start_balance INT NOT NULL,
    default_earning_multiply FLOAT NOT NULL
);

INSERT INTO general_settings(start_balance, default_earning_multiply) VALUES (20, 1.0);

CREATE TABLE role_statuses (
    id int AUTO_INCREMENT PRIMARY KEY,
    name varchar(255) NOT NULL
);

INSERT INTO role_statuses(name) VALUES ("default_role_for_new_member"), ("guild_admin"), ("mute_role"), ("economical");

CREATE TABLE guild_role_statuses(
    id int AUTO_INCREMENT PRIMARY KEY,
    guild_role_id int NOT NULL,
    role_status_id int NOT NULL,
    FOREIGN KEY (guild_role_id) REFERENCES guild_roles(id) ON DELETE CASCADE,
    FOREIGN KEY (role_status_id) REFERENCES role_statuses(id) ON DELETE CASCADE
);

CREATE TABLE guild_channels (
    id int AUTO_INCREMENT PRIMARY KEY,
    guild_id int NOT NULL,
    ds_channel_id TEXT NOT NULL,
    FOREIGN KEY (guild_id) REFERENCES guilds(id) ON DELETE CASCADE
); 

CREATE TABLE channel_tags_statuses (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE
);

INSERT INTO channel_tags_statuses(name) VALUES ("public"), ("private");

CREATE TABLE channel_tags (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    channel_tags_status_id INT NOT NULL,
    FOREIGN KEY (channel_tags_status_id) REFERENCES channel_tags_statuses(id) ON DELETE CASCADE
);

INSERT INTO channel_tags(name, channel_tags_status_id) VALUES ("bot_notifications", 1), ("bot_notifications_developer", 2), ("ban_logs", 1), ("mute_logs", 1);

CREATE TABLE twitch_notification_channels (
    id INT AUTO_INCREMENT PRIMARY KEY,
    streamer_id INT NOT NULL,
    guild_channel_id INT NOT NULL,
    FOREIGN KEY (streamer_id) REFERENCES streamers(id) ON DELETE CASCADE,
    FOREIGN KEY (guild_channel_id) REFERENCES guild_channels(id) ON DELETE CASCADE
);

# 34 tables
