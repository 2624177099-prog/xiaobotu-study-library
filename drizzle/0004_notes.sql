CREATE TABLE note (
 id TEXT PRIMARY KEY, kind TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL,
 requestId TEXT NOT NULL UNIQUE, receipt TEXT NOT NULL UNIQUE,
 visible INTEGER NOT NULL DEFAULT 0, tip INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE INDEX note_public_order ON note(kind,visible,(tip>0) DESC,created DESC,id);
--> statement-breakpoint
CREATE TABLE note_like (noteId TEXT NOT NULL REFERENCES note(id), fingerprint TEXT NOT NULL, PRIMARY KEY(noteId,fingerprint));
