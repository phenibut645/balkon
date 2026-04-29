CREATE TABLE IF NOT EXISTS bot_commands (
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
    completed_at TIMESTAMP NULL,
    INDEX idx_bot_commands_status_id (status, id),
    INDEX idx_bot_commands_requested_by (requested_by_discord_id),
    INDEX idx_bot_commands_guild_id (guild_id)
);
