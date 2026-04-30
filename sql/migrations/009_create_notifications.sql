CREATE TABLE notifications (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL,
    type VARCHAR(64) NOT NULL DEFAULT 'system',
    severity ENUM('info', 'success', 'warning', 'danger') NOT NULL DEFAULT 'info',
    title VARCHAR(160) NOT NULL,
    body TEXT NOT NULL,
    image_url TEXT NULL,
    link_url TEXT NULL,
    metadata_json JSON NULL,
    read_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_by_member_id INT NULL,
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by_member_id) REFERENCES members(id) ON DELETE SET NULL
);

CREATE INDEX idx_notifications_member_created ON notifications(member_id, created_at DESC);
CREATE INDEX idx_notifications_member_read ON notifications(member_id, read_at);
CREATE INDEX idx_notifications_type ON notifications(type);
