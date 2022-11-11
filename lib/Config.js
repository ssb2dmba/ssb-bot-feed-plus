import path from 'path';
import _ from 'lodash';
import yaml from 'js-yaml';
import fs from 'fs';
import Debug from 'debug';
import url from 'url';
import ConfigError from './error/ConfigError.js';

const printToConsole = Debug('ssb-bot-feed2:Config:*');

export default class Config {
  constructor() {
    // Default config
    this.defaultConfig = {
      db: {
        location: './',
        cleanup: 30,
      },
      rss: {
        userAgent: 'Node/RssFeedEmitter (https://github.com/filipedeschamps/rss-feed-emitter)',
        skipFirstLoad: false,
        refresh: 30000,
      },
      patchwork: {
        doubleDash: true,
      },
      sbots: [],
    };
    this.config = this.defaultConfig;
  }

  validateAndNormalize() {
    this.config.db.location = path.normalize(this.config.db.location);
    // Make sure db.location is a directory
    try {
      if (!fs.lstatSync(this.config.db.location).isDirectory()) {
        throw new ConfigError('Config File: "db.location" must be a directory.');
      }
    } catch (err) {
      throw new ConfigError(`Config File: "db.location" is invalid. ${err}`);
    }

    this.config.db.cleanup = parseInt(this.config.db.cleanup, 10);
    if (Number.isNaN(this.config.db.cleanup) || this.config.db.cleanup < 1) {
      this.config.db.cleanup = 1;
    }

    this.config.rss.refresh = parseInt(this.config.rss.refresh, 10);
    if (Number.isNaN(this.config.rss.refresh) || this.config.rss.refresh < 5000) {
      // Limit minimum rss refresh rate to 5 seconds
      this.config.rss.refresh = 5000;
    }

    if (this.config.proxy) {
      try {
        this.config.proxy = Config.verifyAndNormalizeURL(this.config.proxy, ['socks5:', 'socks5h:']);
      } catch (err) {
        throw new ConfigError(`Config File: "proxy" is invalid. ${err}`);
      }
    }

    if (!this.config.sbots || Object.keys(this.config.sbots).length < 1) {
      printToConsole("Config File: WARNING: there's no sbot instance defined. Nothing will be posted.");
    } else {
      const usedPorts = {};
      /* eslint no-param-reassign: ["error", { "props": false }] */
      this.config.sbots = _.forIn(this.config.sbots, (sbot, sbotName, sbots) => {
        sbots[sbotName].path = path.normalize(sbot.path);
        // Make sure path is a directory
        try {
          if (!fs.lstatSync(sbots[sbotName].path).isDirectory()) {
            throw new ConfigError(`Config File: "path" of sbot "${sbotName}" must be a directory.`);
          }
        } catch (err) {
          throw new ConfigError(`Config File: "path" of sbot "${sbotName}" is invalid. ${err}`);
        }

        if (!sbot.port) {
          throw new ConfigError(`Config File: "port" of sbot "${sbotName}" is missing.`);
        }
        if (!sbot.wsPort) {
          throw new ConfigError(`Config File: "wsPort" of sbot "${sbotName}" is missing.`);
        }

        if (Object.keys(usedPorts).includes(sbot.port.toString())) {
          throw new ConfigError(`Config File: "port" ${sbot.port} of sbot "${sbotName}" is already used by sbot "${usedPorts[sbot.port]}".`);
        }
        usedPorts[sbot.port] = sbotName;

        if (Object.keys(usedPorts).includes(sbot.wsPort.toString())) {
          throw new ConfigError(`Config File: "wsPort" ${sbot.port} of sbot "${sbotName}" is already used by sbot "${usedPorts[sbot.wsPort]}".`);
        }
        usedPorts[sbot.wsPort] = sbotName;

        if (!sbot.feeds || Object.keys(sbot.feeds).length < 1) {
          printToConsole(`Config File: WARNING: there's no feed for sbot "${sbotName}" defined. Nothing will be posted to that sbot instance.`);
        }

        this.config.sbots[sbotName].feeds = _.forEach(sbot.feeds, (feed, index, feeds) => {
          try {
            feeds[index].url = Config.verifyAndNormalizeURL(feed.url, ['http:', 'https:']);
          } catch (e) {
            throw new ConfigError(`Config File: feed "url" in sbot "${sbotName}" is invalid: ${feed.url}. ${e}`);
          }

          if (feed.cleanup) {
            feeds[index].cleanup = parseInt(feed.cleanup, 10);
            if (Number.isNaN(feeds[index].cleanup) || feeds[index].cleanup < 1) {
              feeds[index].cleanup = undefined; // Use global config
            }
          }

          if (feed.refresh) {
            feeds[index].refresh = parseInt(feeds[index].refresh, 10);
            if (Number.isNaN(feeds[index].refresh) || feeds[index].refresh < 5000) {
              // Limit minimum rss refresh rate to 5 seconds
              feeds[index].refresh = undefined; // Use global config
            }
          }

          if (feed.proxy) {
            try {
              feeds[index].proxy = Config.verifyAndNormalizeURL(feed.proxy, ['socks5:', 'socks5h:']);
            } catch (err) {
              throw new ConfigError(`Config File: Feed "proxy" in sbot "${sbotName}" is invalid. ${err}`);
            }
          }
        });
      });
      /* eslint no-param-reassign: "error" */
    }
  }

  static verifyAndNormalizeURL(urlStr, acceptedProtocols) {
    const urlToVerify = new URL(urlStr);
    if (!acceptedProtocols.includes(urlToVerify.protocol)) {
      throw new Error(`Currently only ${acceptedProtocols} proxy is supported`);
    }
    if (!urlToVerify.host) {
      throw new Error('No host');
    }
    return urlToVerify.toString();
  }

  loadFromFile(filePath) {
    const config = yaml.safeLoad(fs.readFileSync(filePath, 'utf8'));
    this.config = _.defaultsDeep(config, this.defaultConfig);
    this.validateAndNormalize();
    return this.config;
  }
}
