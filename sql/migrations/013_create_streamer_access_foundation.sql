CREATE TABLE streamer_owners (
    id INT AUTO_INCREMENT PRIMARY KEY,
    streamer_id INT NOT NULL,
    member_id INT NOT NULL,
    role ENUM('owner','manager') NOT NULL DEFAULT 'owner',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_streamer_owner_member (streamer_id, member_id),
    INDEX idx_streamer_owners_member (member_id),
    FOREIGN KEY (streamer_id) REFERENCES streamers(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE streamer_trusted_users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    streamer_id INT NOT NULL,
    member_id INT NOT NULL,
    role ENUM('moderator','manager') NOT NULL DEFAULT 'moderator',
    created_by_member_id INT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uniq_streamer_trusted_member (streamer_id, member_id),
    INDEX idx_streamer_trusted_users_member (member_id),
    FOREIGN KEY (streamer_id) REFERENCES streamers(id) ON DELETE CASCADE,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_member_id) REFERENCES members(id) ON DELETE SET NULL
);
