import Debug from 'debug';
import DB from '../lib/DB.js';
import SbotManager from '../lib/SbotManager.js';
import FeedManager from '../lib/FeedManager.js';
import Poster from '../lib/Poster.js';
import Config from '../lib/Config.js';

const printToConsole = Debug('ssb-bot-feed2:cmd:run:*');

const registerExitListeners = (exitHandler) => {
  process.stdin.resume();// so the program will not close instantly

  // do something when app is closing
  process.on('beforeExit', async (code) => {
    await exitHandler({ cleanup: true }, code);
  });

  // catches ctrl+c event
  process.on('SIGINT', async (code) => {
    await exitHandler({ cleanup: true, exit: true }, code);
  });

  // catches "kill pid" (for example: nodemon restart)
  process.on('SIGUSR1', async (code) => {
    await exitHandler({ cleanup: true, exit: true }, code);
  });
  process.on('SIGTERM', async (code) => {
    await exitHandler({ cleanup: true, exit: true }, code);
  });

  // catches uncaught exceptions
  // process.on('uncaughtException', async (code) => {
  //   await exitHandler({ cleanup: true, exit: true }, code);
  // });
};
export default {
  command: ['run'],
  aliases: ['start'],
  describe: 'Run the bot.',
  builder: {},

  handler: async (argv) => {
    const config = new Config().loadFromFile(argv.config);

    const db = await new DB(config.db.location).init();

    const feedManager = new FeedManager(config, db);

    const sbotManager = new SbotManager(config);

    const poster = new Poster(sbotManager, feedManager, db);

    let shuttingDown = false;
    const exitHandler = async (options, exitCode) => {
      printToConsole('Exiting...');
      if (shuttingDown && options.exit) {
        console.warn('Force closing... We\'ll try to shutdown faster next time :( Bye-bye!');
        // Force exit
        process.exit(1);
      }
      shuttingDown = true;

      if (options.cleanup) {
        printToConsole('Cleaning up. Please wait...');
        // Close FeedManager first so no new feeds will be inserted into DB.
        feedManager.close();
        printToConsole('Feed manager closed.');
        // Empty and kill post queues, reset pending status and remove old posted entries.
        await poster.close();
        printToConsole('Poster closed.');
        // Shutdown sbot clients and servers
        await sbotManager.close();
        printToConsole('Sbot manager closed.');
        await db.close();
        printToConsole('Database closed.');
      }
      printToConsole('Thank you for hiring me and I hope you have a great day!');

      if (exitCode || exitCode === 0) printToConsole(exitCode);
      if (options.exit) process.exit();
    };

    registerExitListeners(exitHandler);

    await sbotManager.startServers();
    poster.fetchAndPost();
  },
};
