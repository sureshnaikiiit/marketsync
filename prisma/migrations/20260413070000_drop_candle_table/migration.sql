-- Candle data is now stored exclusively in TimescaleDB.
-- Remove the table from Prisma Postgres.
DROP TABLE IF EXISTS "Candle";
