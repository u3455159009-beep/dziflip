-- Runs once, automatically, the first time the postgres-data volume is
-- created. Adds a second database (dziflip_test) alongside the main
-- POSTGRES_DB (dziflip) so `npm test` has its own throwaway database and
-- never touches local dev data.
CREATE DATABASE dziflip_test;
