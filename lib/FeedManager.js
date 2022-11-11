import Debug from 'debug';
import RssFeedEmitter from './ProxyFeedEmitter.js';

const debug = Debug('ssb-bot-feed2:FeedManager');
const printToConsole = Debug('ssb-bot-feed2:FeedManager:*');

/**
 * Monitor RSS feeds and save them to db
 */
export default class FeedManager {
  constructor(config, db) {
    this.config = config;
    this.sbotsConfig = config.sbots;
    this.db = db;
    this.feedEmitter = new RssFeedEmitter({
      userAgent: this.config.rss.userAgent,
      skipFirstLoad: this.config.rss.skipFirstLoad,
    });
    this.feedEmitter.on('error', (err) => {
      console.error(
        'ignoring feedMonitor msg:',
        err.message,
      );
    });

    this.feeds = {};
    this.buildFeeds();

    printToConsole('Feed manager started.');
  }

  getFeed(url) {
    return this.feeds[url];
  }

  close() {
    this.feedEmitter.destroy();
    debug('Feed Emitter destroyed');
  }

  /**
   * @private
   */
  addFeeds(feeds) {
    feeds.forEach((feed) => {
      this.feeds[feed.url] = feed;

      this.feedEmitter.add({
        url: feed.url,
        eventName: `new-item-${feed.url}`,
        refresh: feed.refresh || undefined,
        proxy: feed.proxy,
      });

      // Image fetch queue (one for each feed)
      // const imgQueue = async.queue(async (url) => this.downloadImage(url, feed), 5);

      this.feedEmitter.on(`new-item-${feed.url}`, (entry) => {
        // Save to DB
        this.db.insertEntry(feed, entry).then(() => {
          printToConsole(`New Entry from ${feed.url}: ${entry.title}`);
        });
      });
    });
  }

  /**
   * @private
   */
  buildFeeds() {
    Object.entries(this.sbotsConfig).forEach(([sbotName, sbotConfig]) => {
      const { feeds } = sbotConfig;
      if (!feeds) {
        console.warn('No feeds defined for sbot: ', sbotName);
        return;
      }
      feeds.forEach((feed, index) => {
        if (!feed.proxy && this.config.proxy) {
          feeds[index].proxy = this.config.proxy;
        }
        if (!feed.cleanup && this.config.db.cleanup) {
          feeds[index].cleanup = this.config.db.cleanup;
        }
        if (!feed.refresh && this.config.rss.refresh) {
          feeds[index].refresh = this.config.rss.refresh;
        }
        feeds[index].sbotName = sbotName;
      });

      this.addFeeds(feeds);
    });
  }
}
