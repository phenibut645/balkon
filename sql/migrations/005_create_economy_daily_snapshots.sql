CREATE TABLE IF NOT EXISTS economy_daily_snapshots (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    snapshot_date DATE NOT NULL UNIQUE,
    total_odm BIGINT NOT NULL DEFAULT 0,
    total_ldm BIGINT NOT NULL DEFAULT 0,
    members_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_economy_daily_snapshots_date
    ON economy_daily_snapshots(snapshot_date);
