CREATE TABLE resource(id TEXT PRIMARY KEY,title TEXT NOT NULL,subject TEXT,year TEXT,kind TEXT,tags TEXT,summary TEXT,author TEXT,textbook TEXT,grade TEXT,status TEXT NOT NULL,current TEXT NOT NULL,created TEXT,updated TEXT);
--> statement-breakpoint
CREATE TABLE version(id TEXT PRIMARY KEY,rid TEXT NOT NULL REFERENCES resource(id),label TEXT,ai TEXT,checkStatus TEXT,scope TEXT,checked TEXT,issues TEXT,source TEXT,revision TEXT,created TEXT,oldAllowed INTEGER NOT NULL DEFAULT 0,UNIQUE(rid,label));
--> statement-breakpoint
CREATE TABLE attachment(id TEXT PRIMARY KEY,vid TEXT NOT NULL REFERENCES version(id),name TEXT NOT NULL,ext TEXT NOT NULL,size INTEGER NOT NULL,obj TEXT NOT NULL UNIQUE,enabled INTEGER NOT NULL DEFAULT 1);
--> statement-breakpoint
CREATE TABLE submission(id TEXT PRIMARY KEY,rid TEXT NOT NULL REFERENCES resource(id),contact TEXT,reason TEXT,authorized INTEGER NOT NULL,requestId TEXT UNIQUE NOT NULL);
--> statement-breakpoint
CREATE TABLE feedback(id TEXT PRIMARY KEY,rid TEXT REFERENCES resource(id),version TEXT REFERENCES version(id),type TEXT,location TEXT,description TEXT,suggestion TEXT,contact TEXT,status TEXT,created TEXT,requestId TEXT UNIQUE NOT NULL);
--> statement-breakpoint
CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT);
--> statement-breakpoint
CREATE TABLE audit(id INTEGER PRIMARY KEY,action TEXT,target TEXT,actor TEXT,created TEXT);
--> statement-breakpoint
CREATE TABLE metric(day TEXT,kind TEXT,n INTEGER,PRIMARY KEY(day,kind));
--> statement-breakpoint
CREATE TABLE rate(key TEXT PRIMARY KEY,n INTEGER,expires INTEGER);
--> statement-breakpoint
CREATE TABLE op(requestId TEXT PRIMARY KEY,rid TEXT NOT NULL);
--> statement-breakpoint
CREATE INDEX resource_status ON resource(status,updated);
--> statement-breakpoint
CREATE INDEX version_resource ON version(rid,created);
--> statement-breakpoint
CREATE INDEX attachment_version ON attachment(vid);
