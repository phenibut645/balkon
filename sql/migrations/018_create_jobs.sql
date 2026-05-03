CREATE TABLE IF NOT EXISTS jobs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    job_key VARCHAR(64) NOT NULL UNIQUE,
    title_ru VARCHAR(120) NOT NULL,
    title_en VARCHAR(120) NULL,
    title_et VARCHAR(120) NULL,
    description_ru TEXT NULL,
    description_en TEXT NULL,
    description_et TEXT NULL,
    icon_url VARCHAR(500) NULL,
    reward_amount INT NOT NULL DEFAULT 0,
    cooldown_seconds INT NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    reward_item_id BIGINT NULL,
    reward_item_chance_percent DECIMAL(5, 2) NULL,
    reward_item_quantity INT NOT NULL DEFAULT 1,
    created_by_member_id BIGINT NULL,
    updated_by_member_id BIGINT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_jobs_reward_item
        FOREIGN KEY (reward_item_id) REFERENCES items(id) ON DELETE SET NULL,
    CONSTRAINT fk_jobs_created_by_member
        FOREIGN KEY (created_by_member_id) REFERENCES members(id) ON DELETE SET NULL,
    CONSTRAINT fk_jobs_updated_by_member
        FOREIGN KEY (updated_by_member_id) REFERENCES members(id) ON DELETE SET NULL,
    CHECK (reward_amount >= 0),
    CHECK (cooldown_seconds >= 0),
    CHECK (reward_item_quantity >= 1),
    CHECK (reward_item_chance_percent IS NULL OR (reward_item_chance_percent >= 0 AND reward_item_chance_percent <= 100))
);

CREATE INDEX idx_jobs_enabled_updated_at ON jobs(enabled, updated_at DESC);

CREATE TABLE IF NOT EXISTS member_job_cooldowns (
    member_id BIGINT NOT NULL,
    job_id BIGINT NOT NULL,
    last_run_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (member_id, job_id),
    CONSTRAINT fk_member_job_cooldowns_member
        FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE,
    CONSTRAINT fk_member_job_cooldowns_job
        FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
);

CREATE INDEX idx_member_job_cooldowns_job ON member_job_cooldowns(job_id, last_run_at DESC);
