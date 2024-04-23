/**
 * Regularly check database and post new entries to SBot
 */
import async from 'async';
import merror from 'make-error-cause';
import ProxyAgent from 'socks-proxy-agent';
import got from 'got';
import pull from 'pull-stream';
import toPull from 'stream-to-pull-stream';
import { Readable } from 'stream';
import TurndownService from 'turndown';

import jsdom from 'jsdom';
import ssbValidate from 'ssb-validate';
import Debug from 'debug';

const { JSDOM } = jsdom;
const debug = Debug('ssb-bot-feed2:Poster');
const debugImg = Debug('ssb-bot-feed2:Poster:addImage');
const printToConsole = Debug('ssb-bot-feed2:Poster:*');

const defaultPostTemplate = `
# {title}

{description}

Link: [{link}]({link})

{channels}
`;

export default class Poster {
  constructor(sbotManager, feedManager, db) {
    this.sbotManager = sbotManager;
    this.feedManager = feedManager;
    this.db = db;

    this.postQueue = async.queue(async (entryRow) => this.post(entryRow), 5);
    this.postQueue.error((err, entryRow) => {
      console.error(`Entry ${entryRow.id} post error: ${err.stack}`);
      this.db.setPending([entryRow.id]);
    });
    this.imgQueues = {};

    this.stop = false;

    this.turndown = new TurndownService()
      .addRule('emphasis', {
        filter: ['em', 'i'],

        replacement(content, node, options) {
          if (!content.trim()) return '';
          return ` ${options.emDelimiter}${content}${options.emDelimiter} `;
        },
      })
      .addRule('strong', {
        filter: ['strong', 'b'],

        replacement(content, node, options) {
          if (!content.trim()) return '';
          return ` ${options.strongDelimiter}${content}${options.strongDelimiter} `;
        },
      })
      .addRule('style', {
        filter: ['style'],

        replacement() {
          return '';
        },
      });
  }

  async close() {
    this.stop = true;

    // Kill queues
    this.postQueue.remove(() => true);
    await this.postQueue.drain();
    this.postQueue.kill();
    debug('PostQueue killed.');

    Object.values(this.imgQueues).forEach((imgQueue) => {
      imgQueue.kill();
    });
    debug('ImgQueues killed.');

    // Set posting entries to pending so that they can be posted again next time
    await this.db.setPostingPending();
    debug('All posting entries are set to pending.');
    // Cleanup old entries
    await async.each(this.feeds, async (feed) => {
      await this.db.deleteOldEntry(feed.sbotName, feed.url, feed.cleanup);
    });
    debug('Old entries deleted.');
  }

  fetchAndPost() {
    async.whilst((cb) => cb(null, !this.stop), async () => {
      const entries = await this.db.fetchEntries();

      if (entries.length === 0) {
        debug('No new entries in database. Sleep 10 seconds...');
        await Poster.sleep(10000);
      }

      // Triggers the start of the connections scheduler in CONN.
      const sbot_names = [...new Set(entries.map(item => item.sbot_name))];
      sbot_names.forEach(async (sbot_name) => {
        const sbotConn = await this.sbotManager.getConn("ssb_rss");
        try {
          sbotConn.conn.start()
        } catch (e) {
          console.error(e)
        }
      });

      const entryIds = entries.map((entry) => entry.id);

      await this.db.setPosting(entryIds);

      // Push to queue
      this.postQueue.push(entries);
    });
  }

  async post(entryRow) {
    const entry = JSON.parse(entryRow.entry_data);
    entry.id = entryRow.id;

    const feedURL = entry.meta.link;
    const feed = this.feedManager.getFeed(feedURL);

    if (!feed) {
      console.warn(`No feed in config file for entry ${entry.id}. Feed URL: ${feedURL}`);
      return;
    }

    const sbotConn = await this.sbotManager.getConn(entryRow.sbot_name);

    if (!feedURL) {
      throw new merror.BaseError(`Feed entry ID: ${entryRow.id} doesn't have feed URL data.`);
    }

    if (!this.imgQueues[feedURL]) {
      // One image download queue for each feed
      this.imgQueues[feedURL] = async.queue(
        async (url) => Poster.addImage(sbotConn, url, feed.proxy),
        5,
      );
    }

    printToConsole(
      'publishing update for entry:',
      entry.title,
    );

    if (entry.description) {
      const html = entry.description.replace('<![CDATA[', '').replace(']]>', '');
      const dom = new JSDOM(html);
      let elms = [...new Set(dom.window.document.querySelectorAll('img'))]; // Remove dup
      // disable images upload depending on config
      if (this.sbotManager.config.sbots["ssb_rss"].strip_images) {
        elms = []
        var imgElements = dom.window.document.querySelectorAll("img");
        for(var i=0; i<imgElements.length; i++) {
          var img = imgElements[i];
          img.parentNode.removeChild(img);
        }
      }

      const imgPromises = [];

      elms.forEach((elm) => imgPromises.push(this.imgQueues[feedURL].pushAsync(elm.src)));

      Promise.allSettled(imgPromises).then((results) => {
        // printToConsole(util.inspect(results));

        const mentions = [];
        results.forEach((result) => {
          if (result.status === 'fulfilled') {
            const [src, hash, size, contentType] = result.value;
            const imgs = dom.window.document.querySelectorAll(`img[src="${src}"]`);
            imgs.forEach((img) => img.setAttribute('src', hash));
            mentions.push({
              link: hash,
              name: Poster.getFileNameFromUrl(src),
              size,
              type: contentType,
            });
          }
        });

        const description = this.turndown.turndown(dom.window.document);

        let { link } = entry;
        if (entry['media:content']) {
          link = entry['media:content']['@'].url;
        }

        // extract as externalLink the first link not tied to rss feed domain
        const regexMdLinks = /\[([^\[]+)\](\(.*\))/gm
        const matches = description.match(regexMdLinks)
        const singleMatch = /\[([^\[]+)\]\((.*)\)/
        const extract=[]
        let externalLink = ""
        for (var i = 0; i < matches.length; i++) {
          var text = singleMatch.exec(matches[i])
          var linkCandidate = text[2]
          var a = dom.window.document.createElement('a');
          a.href = linkCandidate;
          if (!link.includes(a.hostname)) {
            try {
              externalLink = linkCandidate.match(/\bhttps?:\/\/\S+/gi)[0].replace(")", '')
              break;
            } catch (e) {
              console.error(e.message)
            }
          }
        }
        if (externalLink === "") externalLink = link // fallback

        Poster.renderPost(
          sbotConn, entry, description,
          link,externalLink, feed.channels, mentions,
          feed.postTemplate || defaultPostTemplate,
        )
          .then(() => {
            // Mark entry posted in db
            this.db.setPosted([entryRow.id]);
            printToConsole(
              `published entry: ${entry.title}`,
            );
          })
          .catch((err) => {
            printToConsole(
              `error publishing: ${entry.title}`,
              err.message,
            );

            // Mark entry pending in db so that it will be retried later.
            this.db.setPending([entryRow.id]);
          });
      });
    }
  }

  static async renderPost(sbotConn, entry, description, link, externalLink, channels, mentions, postTemplate) {
    // Add channels hashtag to mentions
    channels.split(' ').forEach((chan) => {
      mentions.push({
        link: chan,
      });
    });

    const descriptions = [];
    if (
      Poster.calculateMsgLength(
        Poster.applyPostTemplate(
          postTemplate, entry.title, description, link, externalLink, channels,
        ),
        mentions,
      ) > 8192 - 200
    ) {
      // Separate descriptions around equally and re-apply templates

      const targetLength = 8192 - 200;

      // Only split markdown between paragraphs
      const paragraphs = description.split('\n\n');
      let descParted = '';
      paragraphs.forEach((p) => {
        const prevDesc = descParted;
        descParted += `${p}\n\n`;

        if (
          Poster.calculateMsgLength(
            Poster.applyPostTemplate(
              postTemplate,
              `${entry.title} (99)`, // Parted entry title
              descParted, link, channels,
            ),
            Poster.filterMentions(
              descParted,
              mentions,
            ),
          ) >= targetLength
        ) {
          // Push previous desc
          descriptions.push(prevDesc);
          // Reset desc
          descParted = `${p}\n\n`;
        }
      });
      descriptions.push(descParted); // Push the last part
    } else {
      descriptions.push(description);
    }

    let i = descriptions.length;
    await async.eachSeries(descriptions.reverse(), async (desc) => {
      let realMentions;
      let title;
      if (descriptions.length > 1) {
        // Remove unused mentions
        realMentions = Poster.filterMentions(desc, mentions);
        title = `${entry.title} (${i})`;
        i -= 1;
      } else {
        realMentions = mentions;
        title = entry.title;
      }

      await sbotConn.publish(
        {
          type: 'post',
          text: Poster.applyPostTemplate(
            postTemplate, title, desc, link, externalLink, channels,
          ),
          mentions: realMentions,
        },
      );

    });

    return descriptions[descriptions.length - 1];
  }

  static async addImage(sbotConn, src, proxy) {
    const agent = proxy ? new ProxyAgent(proxy) : undefined;
    try {
      debugImg(`Downloading ${src}...`);
      const res = await got(src, {
        agent: {
          http: agent,
          https: agent,
        },
        retry: {
          limit: 5,
        },
      });

      const contentType = res.headers['content-type'];

      let size = 0;
      const bodySize = (read) => (end, cb) => {
        read(end, (end2, data) => {
          if (data != null) {
            size += data.length;
          }
          cb(end2, data);
        });
      };

      const hash = await new Promise((resolve, reject) => pull(
        toPull.source(Readable.from(res.rawBody)),
        bodySize,
        sbotConn.blobs.add((err, hash2) => {
          if (err) {
            console.error(err);
            return reject(err);
          }
          return resolve(hash2);
        }),
      ));

      return [src, hash, size, contentType];
    } catch (err) {
      printToConsole(`Error download img: ${src}: ${err.response.body}`);
      throw err;
    }
  }

  static byteLength(string) {
    return Buffer.byteLength(string, 'utf8');
  }

  static getFileNameFromUrl(url) {
    if (url) {
      const tmp = url.split('/');
      const tmpLength = tmp.length;

      return tmpLength ? tmp[tmpLength - 1] : '';
    }

    return 'unknown';
  }

  static sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   *  (Almost) accurately calculate the length of msg going to be posted to ssb
   */
  static calculateMsgLength(text, mentions) {
    const mock = {
      previous: '*'.repeat(52),
      sequence: 9999999999,
      author: '*'.repeat(53),
      timestamp: 9999999999999,
      hash: 'sha256',
      content: {
        type: 'post',
        text,
        mentions,
      },
    };

    return ssbValidate.encode(mock).length;
  }

  /**
   *  Remove unused metions
   */
  static filterMentions(text, mentions) {
    return mentions.filter((mention) => {
      if (!mention.type) {
        // Not an blob mention
        return true;
      }

      // Try to search link in text
      return text.includes(mention.link);
    });
  }

  static applyPostTemplate(postTemplate, title, description, link, externalLink, channels) {
    const matchMap = {
      title,
      description,
      link,
      externalLink,
      channels,
    };
    const output = postTemplate.replace(
      /{(title|description|link|externalLink|channels)}/gm,
      (match) => matchMap[match.replace(/({|})/g, '')],
    );
    console.log(output)
    return output;
  }
}
