import FeedEmitter from 'rss-feed-emitter';
import ProxyFeed from './ProxyFeed.js';

export default class ProxyFeedEmitter extends FeedEmitter {
  add(...userFeedConfig) {
    if (userFeedConfig.length > 1) {
      userFeedConfig.forEach((f) => this.add(f));
      return this.feedList;
    }

    const config = userFeedConfig[0];

    ProxyFeedEmitter.validateFeedObject(config, this.userAgent);

    if (Array.isArray(config.url)) {
      config.url.forEach((url) => {
        this.add({
          ...config,
          url,
        });
      });
      return this.feedList;
    }

    const feed = new ProxyFeed(config);

    this.addOrUpdateFeedList(feed);

    return this.feedList;
  }
}
