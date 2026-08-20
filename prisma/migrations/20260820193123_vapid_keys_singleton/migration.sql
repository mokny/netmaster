-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_VapidKeys" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'singleton',
    "publicKey" TEXT NOT NULL,
    "privateKey" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- Bestehendes Schlüsselpaar auf die feste Singleton-ID ummappen (statt neu
-- zu erzeugen), damit bereits registrierte Push-Subscriptions gültig bleiben.
-- Falls durch die frühere Race-Condition doch mehrere Zeilen existieren,
-- gewinnt die älteste (an ihr sind vermutlich die meisten Subscriptions
-- gebunden), die übrigen werden verworfen.
INSERT INTO "new_VapidKeys" ("id", "createdAt", "privateKey", "publicKey", "subject")
SELECT 'singleton', "createdAt", "privateKey", "publicKey", "subject" FROM "VapidKeys" ORDER BY "createdAt" ASC LIMIT 1;
DROP TABLE "VapidKeys";
ALTER TABLE "new_VapidKeys" RENAME TO "VapidKeys";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
