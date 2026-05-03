CREATE TABLE streamer_applications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    applicant_member_id INT NOT NULL,
    discord_guild_id VARCHAR(255) NOT NULL,
    requested_nickname VARCHAR(100) NOT NULL,
    twitch_url VARCHAR(255) NULL,
    description TEXT NULL,
    status ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
    reviewed_by_member_id INT NULL,
    streamer_id INT NULL,
    reviewed_at TIMESTAMP NULL,
    rejection_reason TEXT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (applicant_member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by_member_id) REFERENCES members(id) ON DELETE SET NULL,
    FOREIGN KEY (streamer_id) REFERENCES streamers(id) ON DELETE SET NULL
);

CREATE INDEX idx_streamer_applications_status ON streamer_applications(status, created_at DESC);
CREATE INDEX idx_streamer_applications_applicant ON streamer_applications(applicant_member_id, created_at DESC);
CREATE INDEX idx_streamer_applications_applicant_guild_status
    ON streamer_applications(applicant_member_id, discord_guild_id, status);
