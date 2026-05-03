ALTER TABLE streamers
    ADD COLUMN archived_at TIMESTAMP NULL AFTER twitch_url,
    ADD COLUMN archived_by_member_id INT NULL AFTER archived_at,
    ADD CONSTRAINT fk_streamers_archived_by_member
        FOREIGN KEY (archived_by_member_id) REFERENCES members(id) ON DELETE SET NULL;

CREATE INDEX idx_streamers_archived_at ON streamers(archived_at);
