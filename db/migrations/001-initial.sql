-- Up
CREATE TABLE `entry` (
  id INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
  sbot_name TEXT NOT NULL,
  feed_url TEXT NOT NULL,
  guid TEXT NOT NULL,
  entry_title TEXT NOT NULL,
  entry_dateline INTEGER NOT NULL,
  entry_data TEXT NOT NULL,
  dateline INTEGER NOT NULL,
  -- (status) 0: Pending 1: Posting 2: Posted
  status INTEGER NOT NULL DEFAULT (0),
  UNIQUE (sbot_name, guid)
);
CREATE INDEX sbot_name_dateline ON `entry` (sbot_name, entry_dateline, status);
CREATE INDEX sbot_name_feed ON `entry` (sbot_name, feed_url, entry_dateline);
-- Down
DROP TABLE `entry`;