ALTER TABLE obs_agent_statuses
    ADD COLUMN IF NOT EXISTS status_payload_json JSON NULL AFTER last_error;
