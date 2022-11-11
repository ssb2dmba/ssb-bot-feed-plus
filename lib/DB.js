import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import path, { dirname } from 'path';
import Debug from 'debug';
import { fileURLToPath } from 'url';

const debug = Debug('ssb-bot-feed2:DB');
// const printToConsole = Debug('ssb-bot-feed2:DB:*');

// eslint-disable-next-line no-underscore-dangle
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line no-underscore-dangle
const __dirname = dirname(__filename);

export default class DB {
  constructor(dbLocation) {
    this.dbLocation = dbLocation;
  }

  async init() {
    this.db = await open({
      filename: path.join(this.dbLocation, 'bot.db'),
      driver: sqlite3.cached.Database,
    });

    await this.db.migrate({
      migrationsPath: path.join(__dirname, '..', 'db', 'migrations'),
    });

    debug('Database migrated.');

    return this;
  }

  async insertEntry(feed, entry) {
    const result = await this.db.run(
      `INSERT OR IGNORE INTO entry
        (sbot_name, feed_url, guid, entry_title, entry_dateline, entry_data, dateline)
        VALUES
        (?1, ?2, ?3, ?4, ?5, ?6, ?7)`,
      [
        feed.sbotName, feed.url, entry.guid, entry.title,
        Date.parse(entry.date), JSON.stringify(entry), Date.now(),
      ],
    );

    debug(`entry_${result.lastID} inserted`);
  }

  async deleteEntry(id) {
    await this.db.del(id);
  }

  async fetchEntries() {
    return this.db.all(
      'SELECT * FROM entry WHERE status = 0 ORDER BY entry_dateline LIMIT 10',
    );
  }

  async setPending(entryIds) {
    const inClause = entryIds.join(',');

    await this.db.run(`UPDATE entry SET status = 0 WHERE id IN (${inClause})`);
  }

  async setPostingPending() {
    await this.db.run('UPDATE entry SET status = 0 WHERE status = 1');
  }

  async setPosting(entryIds) {
    const inClause = entryIds.join(',');

    await this.db.run(`UPDATE entry SET status = 1 WHERE id IN (${inClause})`);
  }

  async setPosted(entryIds) {
    const inClause = entryIds.join(',');

    await this.db.run(`UPDATE entry SET status = 2 WHERE id IN (${inClause})`);
  }

  async deleteOldEntry(sbotName, feedUrl, ageInDays) {
    await this.db.run(
      'DELETE FROM entry WHERE status = 2 AND sbot_name = ?1 AND feed_url = ?2 AND entry_dateline < ?3',
      [sbotName, feedUrl, Date.now() - ageInDays * 1000 * 60 * 60 * 24],
    );
  }

  async close() {
    return this.db.close();
  }
}
