CREATE TABLE admin_economy_adjustments (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    admin_member_id INT NOT NULL,
    target_member_id INT NOT NULL,
    currency ENUM('ODM','LDM') NOT NULL,
    amount BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    reason VARCHAR(300) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (admin_member_id) REFERENCES members(id) ON DELETE CASCADE,
    FOREIGN KEY (target_member_id) REFERENCES members(id) ON DELETE CASCADE
);

CREATE INDEX idx_admin_economy_adjustments_target_created
    ON admin_economy_adjustments(target_member_id, created_at DESC);
CREATE INDEX idx_admin_economy_adjustments_admin_created
    ON admin_economy_adjustments(admin_member_id, created_at DESC);
