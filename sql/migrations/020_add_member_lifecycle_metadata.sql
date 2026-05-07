/*
KAN-18: additive member lifecycle metadata and deterministic backfill.

Backfill rules:
- created_source = 'legacy' for pre-existing rows when still NULL
- created_at = NULL (preserved as-is)
- updated_at = NULL (preserved as-is)
- last_seen_at = NULL (preserved as-is)
- discord_profile_status =
    * 'complete' when discord_username IS NOT NULL
      AND discord_avatar_url IS NOT NULL
      AND discord_profile_updated_at IS NOT NULL
    * 'partial' when any profile cache field exists but the row is not complete
    * 'minimal' otherwise

Validation queries to run before/after applying this migration:

Sample classification preview before backfill:
SELECT
  id,
  ds_member_id,
  discord_username,
  discord_global_name,
  discord_avatar,
  discord_avatar_url,
  discord_profile_updated_at,
  CASE
    WHEN discord_username IS NOT NULL
      AND discord_avatar_url IS NOT NULL
      AND discord_profile_updated_at IS NOT NULL
      THEN 'complete'
    WHEN discord_username IS NOT NULL
      OR discord_global_name IS NOT NULL
      OR discord_avatar IS NOT NULL
      OR discord_avatar_url IS NOT NULL
      OR discord_profile_updated_at IS NOT NULL
      THEN 'partial'
    ELSE 'minimal'
  END AS planned_backfill_status
FROM members
ORDER BY id ASC
LIMIT 100;

Count members by created_source:
SELECT created_source, COUNT(*) AS member_count
FROM members
GROUP BY created_source
ORDER BY member_count DESC, created_source ASC;

Count members by discord_profile_status:
SELECT discord_profile_status, COUNT(*) AS member_count
FROM members
GROUP BY discord_profile_status
ORDER BY member_count DESC, discord_profile_status ASC;

Count members where created_source IS NULL:
SELECT COUNT(*) AS null_created_source_count
FROM members
WHERE created_source IS NULL;

Count members where discord_profile_status IS NULL:
SELECT COUNT(*) AS null_discord_profile_status_count
FROM members
WHERE discord_profile_status IS NULL;

Aggregate preservation check for balances, locale, and cached profile fields.
Capture before migration and confirm the same result after migration:
SELECT
  COUNT(*) AS member_count,
  COALESCE(SUM(balance), 0) AS total_balance,
  COALESCE(SUM(ldm_balance), 0) AS total_ldm_balance,
  SUM(CASE WHEN locale IS NOT NULL THEN 1 ELSE 0 END) AS locale_count,
  SUM(CASE WHEN discord_username IS NOT NULL THEN 1 ELSE 0 END) AS discord_username_count,
  SUM(CASE WHEN discord_global_name IS NOT NULL THEN 1 ELSE 0 END) AS discord_global_name_count,
  SUM(CASE WHEN discord_avatar IS NOT NULL THEN 1 ELSE 0 END) AS discord_avatar_count,
  SUM(CASE WHEN discord_avatar_url IS NOT NULL THEN 1 ELSE 0 END) AS discord_avatar_url_count,
  SUM(CASE WHEN discord_profile_updated_at IS NOT NULL THEN 1 ELSE 0 END) AS discord_profile_updated_at_count
FROM members;
*/

ALTER TABLE members
  ADD COLUMN created_at TIMESTAMP NULL AFTER ds_member_id,
  ADD COLUMN updated_at TIMESTAMP NULL AFTER created_at,
  ADD COLUMN created_source VARCHAR(32) NULL AFTER updated_at,
  ADD COLUMN discord_profile_status VARCHAR(32) NULL AFTER discord_profile_updated_at,
  ADD COLUMN last_seen_at TIMESTAMP NULL AFTER discord_profile_status;

UPDATE members
SET
  created_source = COALESCE(created_source, 'legacy'),
  discord_profile_status = COALESCE(
    discord_profile_status,
    CASE
      WHEN discord_username IS NOT NULL
        AND discord_avatar_url IS NOT NULL
        AND discord_profile_updated_at IS NOT NULL
        THEN 'complete'
      WHEN discord_username IS NOT NULL
        OR discord_global_name IS NOT NULL
        OR discord_avatar IS NOT NULL
        OR discord_avatar_url IS NOT NULL
        OR discord_profile_updated_at IS NOT NULL
        THEN 'partial'
      ELSE 'minimal'
    END
  );
