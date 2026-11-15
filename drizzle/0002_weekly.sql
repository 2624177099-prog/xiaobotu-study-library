CREATE TABLE file_metric_daily (
  day TEXT NOT NULL,
  rid TEXT NOT NULL,
  event TEXT NOT NULL,
  n INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, rid, event)
);
