ALTER TABLE members
  ADD COLUMN home_guild_id VARCHAR(32) NULL,
  ADD COLUMN public_description VARCHAR(500) NULL;

CREATE INDEX idx_members_home_guild_id ON members(home_guild_id);
CREATE INDEX idx_members_balance ON members(balance);
