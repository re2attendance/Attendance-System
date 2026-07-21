-- 0001 — Extensions
--
-- postgis     : the campus geofence. ST_DWithin on a geography column gets the
--               great-circle distance right and runs server-side, which is the only
--               place a distance check counts (DECISIONS.md D-004, D-010).
-- btree_gist  : lets exclusion constraints mix equality (class_id) with overlap
--               (tstzrange), which is how "one class cannot be in two overlapping
--               sessions" is enforced declaratively.
-- citext      : case-insensitive email, so Kofi@… and kofi@… cannot both register.
-- pgcrypto    : gen_random_uuid(), and digest() for device-fingerprint hashing.

create extension if not exists postgis with schema extensions;
create extension if not exists btree_gist with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists pgcrypto with schema extensions;
