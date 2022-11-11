import SbotManager from '../lib/SbotManager.js';
import Config from '../lib/Config.js';

export default {
  command: ['patchwork <ssb_instance_name>'],
  aliases: [],
  describe: 'Launch PatchWork.',
  builder: (yargs) => {
    const config = new Config().loadFromFile(yargs.argv.config);
    yargs.positional('ssb_instance_name', {
      describe: 'SSB instance name defined in config file. The launched PatchWork will connect to SSB server of this instance.',
      type: 'string',
      choices: Object.keys(config.sbots),
    });
  },

  handler: async (argv) => {
    const config = new Config().loadFromFile(argv.config);

    const sbotManager = new SbotManager(config);

    const sbotName = argv.ssb_instance_name;

    sbotManager.startPatchwork(sbotName);
  },
};
