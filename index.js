#!/usr/bin/env node

import Debug from 'debug';
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import merror from 'make-error-cause';
import colors from 'colors';

import runCmd from './cmds/run.js';
import patchworkCmd from './cmds/patchwork.js';

const printToConsole = Debug('ssb-bot-feed2:*');

process.on('unhandledRejection', (reason, p) => {
  printToConsole('Unhandled Rejection at: Promise', p, 'reason:', reason.stack);
  // application specific logging, throwing an error, or other logic here
});

yargs(hideBin(process.argv))
  .option('config', {
    alias: 'c',
    demandOption: true,
    default: 'config.yaml',
    describe: 'Path to config file',
    type: 'string',
    normalize: true,
  })
  // Note: commandDir() doesn't work for ESM in yargs 16.0.3 yet
  .command(runCmd)
  .command(patchworkCmd)
  .demandCommand(1, 'You need at least one command before moving on.')
  .fail((msg, err, y) => {
    if (err) {
      if (err instanceof merror.BaseError) {
        console.error(colors.red(`${err.name}: ${err.message}`));
      } else {
        console.error(colors.red(err.stack));
      }
    } else {
      console.error(msg);
    }
    console.log('\nHelp:');
    y.showHelp();
  })
  .recommendCommands()
  .version()
  .epilog('I\'m a bot that reads RSS feeds and posts update to Secure Scuttlebutt. For more information, please visit https://github.com/marine-master/ssb-bot-feed')
  .help()
  .parse();
