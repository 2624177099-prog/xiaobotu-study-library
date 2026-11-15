ALTER TABLE resource ADD COLUMN saleCents INTEGER NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE erratum(id TEXT PRIMARY KEY,vid TEXT NOT NULL REFERENCES version(id),location TEXT NOT NULL,original TEXT NOT NULL,correction TEXT NOT NULL,basis TEXT NOT NULL,created TEXT NOT NULL,visible INTEGER NOT NULL DEFAULT 1);
--> statement-breakpoint
CREATE TABLE topic_poll(id INTEGER PRIMARY KEY CHECK(id=1),round TEXT NOT NULL,options TEXT NOT NULL);
--> statement-breakpoint
CREATE TABLE ballot(round TEXT NOT NULL,voter TEXT NOT NULL,optionId INTEGER NOT NULL,PRIMARY KEY(round,voter));
--> statement-breakpoint
CREATE TABLE rating(vid TEXT NOT NULL REFERENCES version(id),voter TEXT NOT NULL,score INTEGER NOT NULL CHECK(score BETWEEN 1 AND 5),PRIMARY KEY(vid,voter));
