CREATE TABLE IF NOT EXISTS "Setting" (
    "key"       TEXT NOT NULL,
    "value"     TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

INSERT INTO "Setting" ("key", "value", "updatedAt")
VALUES ('data_mode', 'cache-aside', NOW())
ON CONFLICT ("key") DO NOTHING;
