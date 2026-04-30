CREATE TABLE obs_media_actions (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    buyer_member_id INT NOT NULL,
    streamer_id INT NOT NULL,
    agent_id VARCHAR(80) NULL,
    product_id VARCHAR(120) NOT NULL,
    product_kind ENUM('image', 'gif') NOT NULL,
    product_title VARCHAR(160) NOT NULL,
    media_url TEXT NOT NULL,
    price_odm BIGINT NOT NULL,
    duration_ms INT NOT NULL,
    status ENUM('pending', 'sent', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
    command_id VARCHAR(120) NULL,
    error_code VARCHAR(120) NULL,
    error_message TEXT NULL,
    refunded_odm BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    sent_at TIMESTAMP NULL,
    failed_at TIMESTAMP NULL,
    refunded_at TIMESTAMP NULL,
    FOREIGN KEY (buyer_member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (streamer_id) REFERENCES streamers(id) ON DELETE CASCADE
);

CREATE INDEX idx_obs_media_actions_created ON obs_media_actions(created_at DESC);
CREATE INDEX idx_obs_media_actions_buyer ON obs_media_actions(buyer_member_id, created_at DESC);
CREATE INDEX idx_obs_media_actions_streamer ON obs_media_actions(streamer_id, created_at DESC);
CREATE INDEX idx_obs_media_actions_status ON obs_media_actions(status, created_at DESC);
