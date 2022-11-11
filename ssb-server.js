import Debug from 'debug';

import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';

const require = createRequire(import.meta.url);
const debug = Debug('ssb-bot-feed2:ssb-server');
const printToConsole = Debug('ssb-bot-feed2:ssb-server:*');

// Fix "localStorage is not defined" error in has-network2 module
global.localStorage = null;

const createSSBServer = require('secret-stack')()
  .use(require('ssb-db'))
  .use(require('ssb-conn'))
  .use(require('ssb-lan'))
  .use(require('ssb-logging'))
  .use(require('ssb-master'))
  .use(require('ssb-no-auth'))
  .use(require('ssb-replicate'))
  .use(require('ssb-unix-socket'))
  .use(require('ssb-friends')) // not strictly required, but helps ssb-conn a lot
  .use(require('ssb-blobs'))
  .use(require('ssb-backlinks'))
  .use(require('ssb-about'))
  .use(require('ssb-private'))
  .use(require('ssb-room/tunnel/client'))
  .use(require('ssb-dht-invite'))
  .use(require('ssb-invite'))
  .use(require('ssb-query'))
  .use(require('ssb-search'))
  .use(require('ssb-ws'))
  .use(require('ssb-tags'))
  .use(require('ssb-ebt'))
  .use(require('ssb-patchwork/lib/plugins'));

if (!process.connected) {
  printToConsole('Server can only be launched as a child process');
  process.exit(0);
}

let server;
let sbotName;
process.on('message', (msg) => {
  if (msg.type === 'start') {
    sbotName = msg.sbotName;

    server = createSSBServer(msg.ssbConfig);
    // save an updated list of methods this server has made public
    // in a location that ssb-client will know to check
    const manifest = server.getManifest();
    fs.writeFileSync(
      path.join(msg.ssbConfig.path, 'manifest.json'),
      JSON.stringify(manifest),
    );

    server.on('multiserver:listening', () => {
      printToConsole(`SSB Server "${sbotName}" started.`);
      process.send({
        type: 'started',
      });
    });

    server.on('close', (err) => {
      if (err) {
        console.error(`Unable to close server ${sbotName}. Error: ${err}`);
      } else {
        printToConsole(`SSB Server "${sbotName}" stopped.`);
      }
      process.send({
        type: 'stopped',
      }, () => {
        process.exit(0);
      });
    });
  } else if (msg.type === 'stop') {
    if (server) server.close();
  } else {
    debug(`Unknown message type: ${msg.type}`);
  }
});

process.send({ type: 'ready' });

// process.stdin.resume(); should not be here.
// If it's here, under Windows, this child process won't receive any messages from parent

// catches ctrl+c event
process.on('SIGINT', async () => {});
// catches "kill pid" (for example: nodemon restart)
process.on('SIGUSR1', async () => {});
process.on('SIGTERM', async () => {});

process.on('uncaughtException', (err, origin) => {
  printToConsole(`Error happens when closing server "${sbotName}".
Error: ${err.stack}
Exception origin: ${origin}

Force closing...`);

  process.send({
    type: 'stopped',
  }, () => {
    process.exit(-1);
  });
});
