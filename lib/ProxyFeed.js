import Feed from 'rss-feed-emitter/src/Feed.js';
import FeedError from 'rss-feed-emitter/src/FeedError.js';
import ProxyAgent from 'socks-proxy-agent';
import got from 'got';

const RESPONSE_CODES = {
  OK: 200,
  NOT_FOUND: 404,
  ISE: 500,
};

const ALLOWED_MIMES = ['text/html', 'application/xhtml+xml', 'application/xml', 'text/xml'];

export default class ProxyFeed extends Feed {
  constructor(data) {
    super(data);
    this.proxy = data.proxy;
  }

  get(feedparser) {
    const agent = this.proxy ? new ProxyAgent(this.proxy) : undefined;
    got.stream(this.url, {
      agent: {
        http: agent,
        https: agent,
      },
      retry: {
        limit: 5,
      },
      headers: {
        'user-agent': this.userAgent,
        accept: ALLOWED_MIMES.join(','),
      },
    })
      .on('response', (res) => {
        if (res.statusCode !== RESPONSE_CODES.OK) {
          this.handleError(new FeedError(`This URL returned a ${res.statusCode} status code`, 'fetch_url_error', this.url));
        }
      })
      .on('error', (err) => {
        console.error(err);
        this.handleError(new FeedError(`Cannot connect to ${this.url}`, 'fetch_url_error', this.url));
      })
      .pipe(feedparser);
  }
}
