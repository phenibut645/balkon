CREATE TABLE obs_agent_statuses (
    agent_id VARCHAR(80) NOT NULL PRIMARY KEY,
    online BOOLEAN NOT NULL DEFAULT FALSE,
    connected_at TIMESTAMP NULL,
    last_seen_at TIMESTAMP NULL,
    disconnected_at TIMESTAMP NULL,
    last_error TEXT NULL,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE INDEX idx_obs_agent_statuses_online ON obs_agent_statuses(online);
CREATE INDEX idx_obs_agent_statuses_last_seen ON obs_agent_statuses(last_seen_at);
