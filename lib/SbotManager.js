import ssbClient from 'ssb-client';
import merror from 'make-error-cause';
import async from 'async';
import util from 'util';
import ssbKeys from 'ssb-keys';
import path from 'path';
import Debug from 'debug';
import ref from 'ssb-ref';

import { createRequire } from 'module';
import childProcess from 'child_process';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const debug = Debug('ssb-bot-feed2:SbotManager');
const printToConsole = Debug('ssb-bot-feed2:SbotManager:*');

// eslint-disable-next-line no-underscore-dangle
const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line no-underscore-dangle
const __dirname = path.dirname(__filename);

export default class SbotManager {
  constructor(config) {
    this.config = config;
    this.sbotsConfig = config.sbots;
    this.conns = {};
    this.servers = {};

    printToConsole('Sbot manager started.');
  }

  async startServers() {
    printToConsole('Starting SSB servers...');

    // async.eachSeries() is required instead of async.each().
    // see comments below.
    await async.each(Object.keys(this.sbotsConfig), (sbotName, cb) => {
      if (!this.sbotsConfig[sbotName].startServer) {
        return;
      }

      if (this.servers[sbotName]) {
        return;
      }

      const ssbConfig = this.getSbotConfig(sbotName);
      const redactedConfig = JSON.parse(JSON.stringify(ssbConfig));
      redactedConfig.keys.private = null;
      //console.dir(redactedConfig, { depth: null });

      this.servers[sbotName] = childProcess.fork(
        path.join(__dirname, '..', 'ssb-server.js'),
        [],
        { stdio: 'inherit' },
      );

      this.servers[sbotName].on('message', (msg) => {
        switch (msg.type) {
          case 'ready':
            this.servers[sbotName].send({
              type: 'start',
              sbotName,
              ssbConfig,
            });
            break;
          case 'started':
            cb();
            break;
          case 'stopped':
            delete this.servers[sbotName];
            break;
          default:
            debug(`Unknown message type: ${msg.type}`);
        }
      });

      this.servers[sbotName].on('error', (err) => {
        printToConsole(err.stack);
      });
    });

    printToConsole('All SSB Server started.');
  }

  async closeServers() {
    await async.each(this.servers, (server, cb) => {
      const stopListener = (msg) => {
        if (msg.type === 'stopped') {
          server.off('message', stopListener);
          cb();
        }
      };
      server.on('message', stopListener);
      server.send({
        type: 'stop',
      });
    });
    printToConsole('All SSB Server closed.');
  }

  async getConn(sbotName) {
    const ssbConfig = this.getSbotConfig(sbotName);

    if (!this.conns[sbotName]) {
      try {
        this.conns[sbotName] = await ssbClient(ssbConfig.keys, ssbConfig);
        printToConsole(`Connection to sbot ${sbotName} established.`);

        if (this.config.sbots[sbotName].invite) {

          const parsedInvite = ref.parseInvite(this.config.sbots[sbotName].invite)
          const addr=parsedInvite.remote;
          try {
          this.conns[sbotName].invite.accept(this.config.sbots[sbotName].invite, (err)=>{
            if (err) {
              printToConsole("using invite got:", err.message);
            } else {
              printToConsole(`${parsedInvite.remote} accepted invite`);
            }
          });
          } catch(err) {  
            console.log(err);
          }
         
          this.conns[sbotName].conn.remember(addr,{},(err)=>{
            printToConsole(`added ${parsedInvite.remote} to ssb-conn`, err);        
          })
        }

        // Remove connection when it's closed.
        this.conns[sbotName].on('close', () => {
          delete this.conns[sbotName];
          printToConsole(`Connection to sbot ${sbotName} closed.`);
        });
      } catch (err) {
        printToConsole(`Unable to connect to sbot "${sbotName}". Will retry later. Error: ${err.stack}`);
      }
    }

    return this.conns[sbotName];
  }

  getSbotConfig(sbotName) {
    const cfg = this.sbotsConfig[sbotName];
    if (!cfg) {
      throw new merror.BaseError("Can't find config for sbot: ", sbotName);
    }

    const ssbConfig = require('ssb-config/inject')(sbotName, {
      host: cfg.host,
      port: cfg.port || 8008,
      blobsPort: cfg.wsPort || 8989,
      ws: { port: cfg.wsPort || undefined },
      path: cfg.path,
      // not using ssb-friends (sbot/contacts fixes hops at 2, so this setting won't do anything)
      friends: {
        dunbar: 150,
        hops: 2, // down from 3
      },
    });

    ssbConfig.keys = ssbKeys.loadOrCreateSync(path.join(ssbConfig.path, 'secret'));

    const pubkey = ssbConfig.keys.id.slice(1).replace(`.${ssbConfig.keys.curve}`, '');

    ssbConfig.remote = `net:${ssbConfig.host}:${ssbConfig.port}~shs:${pubkey}`;
    delete ssbConfig.connections.incoming.unix;

    // Support rooms
    // ssbConfig.connections.incoming.tunnel = [{ scope: 'public', transform: 'shs' }];
    // ssbConfig.connections.outgoing.tunnel = [{ transform: 'shs' }];

    // Support DHT invites (only as a client, for now)
    ssbConfig.connections.outgoing.dht = [{ transform: 'shs' }];

    return ssbConfig;
  }

  async close() {
    await async.eachOf(this.conns, async (conn, sbotName) => {
      try {
        await util.promisify(conn.close)();
      } catch (err) {
        console.error(`Unable to close sbot ${sbotName} connection: ${err}`);
      }
    });
    debug('All sbot client connections are closed.');

    await this.closeServers();
    debug('All sbot servers are closed.');
  }

  startPatchwork(sbotName) {
    if (!this.sbotsConfig[sbotName]) {
      console.error(`No SSB instance named ${sbotName}.`);
      return;
    }

    const ssbConfig = this.sbotsConfig[sbotName];

    let binPath = this.config.patchwork.bin;

    if (binPath) {
      const args = [
        '--path',
        ssbConfig.path,
        '--port',
        ssbConfig.port,
        '--blobsPort',
        ssbConfig.wsPort,
        '--ws.port',
        ssbConfig.wsPort,
        '-g',
      ];
      if (this.config.patchwork.doubleDash) {
        args.unshift('--');
      }

      // MacOS
      if (process.platform === 'darwin') {
        args.unshift(binPath, '--args');
        binPath = 'open';
      }

      const proc = childProcess.spawn(
        binPath,
        args,
        {
          detached: true,
          stdio: 'ignore',
        },
      );
      proc.unref();
    } else {
      console.error('No Patchwork executable file configure in config file.');
    }
  }
}
