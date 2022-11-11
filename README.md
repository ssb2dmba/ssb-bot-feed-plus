# @marine-master/ssb-bot-feed

Scuttlebutt bot that read RSS feeds and post updates automatically.

It was based on the original [ssb-bot-feed](https://github.com/klarkc/ssb-bot-feed). But now it's completely rewritten.

## Main Features

* Multiple SSB instances
* It comes with its own SSB Server and is able to start servers for each SSB instance automatically. Then you don't need to start ssb-server, Patchwork etc. yourself. (Note: currently ssb-room is not supported because of a [bug](https://github.com/staltz/ssb-room/issues/15).)
* Multiple RSS Feeds for each SSB instance
* Each RSS Feed can be posted to different channels
* Post template is configurable for each RSS feed
* Images in RSS entries can be parsed and posted automatically (as ssb-blobs)
* Long RSS entries can be splitted into smaller parts to fit SSB post length limitation
* Socks5 proxy
* Launch Patchwork which connects to internal ssb-server easily

## Install ssb-bot-feed

### Windows

1. Go to [nodejs.org](https://nodejs.org/) and download LTS version of NodeJS. Double click the downloaded file to install it. Remember to check "Automatically install the necessary tools" checkbox when asked.
2. Download and install the latest version of [Git for Windows](https://github.com/git-for-windows/git/releases)
3. Install ssb-bot-feed. Open PowerShell and run command:  
    ```bash
    npm install -g @marine-master/ssb-bot-feed
    ```

### MacOS

1. Install Homebrew. Open Terminal and enter following command. You can also use [NVM](https://github.com/nvm-sh/nvm) to install NodeJS.
    ```bash
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install.sh)"
    ```
2. Install Command Line Tools (CLT) for Xcode:
    ```bash
    xcode-select --install
    ```
3. Install NodeJS:
    ```bash
    brew install node
    ```
4. Install ssb-bot-feed:
    ```bash
    npm install -g @marine-master/ssb-bot-feed
    ```

### Linux

1. Follow [this instruction](https://nodejs.org/en/download/package-manager/) to install NodeJS. You can also use [NVM](https://github.com/nvm-sh/nvm) to install NodeJS.
2. Install ssb-bot-feed:
    ```bash
    npm install -g @marine-master/ssb-bot-feed
    ```
    If you get permission error, try command:
    ```bash
    sudo npm install -g --unsafe-perm @marine-master/ssb-bot-feed
    ```


### Configuration

Create a file in current folder with filename `config.yaml`:

```yaml
########################
# Global Configuration #
########################

# Database configuration
db:
  # The directory that stores database
  location: ./
  # Posted entries which are older than these DAYs will be deleted from DB
  # Can be override in each feed's configuration
  cleanup: 30

# RSS fetcher configuration
rss:
  # User agent for requests
  userAgent: Node/RssFeedEmitter (https://github.com/filipedeschamps/rss-feed-emitter)
  # Whether to ignore the first load of items
  skipFirstLoad: true
  # Default feed refresh time in milliseconds
  # Can be override in each feed's configuration
  refresh: 30000

# Proxy server to be used for fetching entries and images.
# Can be override in each feed's configuration
# proxy: socks5://127.0.0.1:8080

# PatchWork configuration
patchwork:
  # The path of PatchWork executable file / command
  bin: /usr/bin/ssb-patchwork
  # Whether to add double dash (--) between patchwork command and its options
  doubleDash: true

######################
# SSB Server & Feeds #
######################

sbots:
  # Name of the SSB instance. Can be any name but be unique.
  ssb_rss:
    # The data dir of the SSB instance
    path: ~/.ssb_rss
    # The port of the SSB instance. Must be unique.
    port: 7000
    # The websocket port of the SSB instance. Must be unique.
    wsPort: 7001
    # Whether to start own server. If you've started the server already
    # (for example the server in PatchWork), set it to false.
    startServer: true
    # Feeds for this SSB instance. Feeds defined here will be posted to
    # this SSB instance.
    feeds:
      # Feeds URL
      - url: https://rsshub.app/engadget/us
        # The SSB channel to post the feeds' entries to.
        # Quotes are required. Use spaces to separate channels.
        channels: "#engadget #rss"

        # Template for posting to SSB. Available variables:
        # - {title}: Entry title
        # - {description}: Entry content
        # - {link}: Web link to the RSS entry
        # - {channels}: The channels that the post belongs to
        postTemplate: |
          # {title}

          {description}

          Link: [{link}]({link})

          {channels}
        # proxy can be specified here to override the global setting
        # proxy: socks5://127.0.0.1:8080

        # cleanup can be specified here to override the global setting
        # cleanup: 30

        # refresh can be specified here to override the global setting
        # refresh: 6000

      # Another feed
      # - url: https://url_of_the_feed
      #   channels: "#channel_for_the_feed"
  # Another SSB instance
  # ssb_rss2:
  #   path: ~/.ssb_rss2
  #   port: 7002
  #   wsPort: 7003
  #   startServer: true
  #   feeds:
  #     - url: https://url_of_the_feed2
  #       channels: "#channel_for_the_feed2 #rss"
  #     - url: https://url_of_the_feed3
  #       channels: "#channel_for_the_feed3 #rss"

```

## Usage

### Prepare SSB account for RSS feeds

> Note: You can skip this step and just config SSB data path and set startServer to "true". The bot will create the account for you. You can later Start Patchwork (see below) and edit your profile or join Pubs.

Install and open [PatchWork](https://github.com/ssbc/patchwork/releases).

By default, it's data is stored in `~/.ssb` folder. If you want the data to be stored in different folder, create the folder first, then use the following command in terminal to start Patchwork:

Windows:
```bash
C:\Users\test\AppData\Local\Programs\ssb-patchwork\Patchwork.exe -- --path=/path/to/data/folder
```

MacOS:  
```bash
open /Applications/Patchwork.app --args -- --path=/path/to/data/folder
```

Linux:  
```bash
/path/to/ssb-patchwork --path=/path/to/data/folder
```

Setup name/description/avatar for your account profile. Join some [pubs](https://github.com/ssbc/ssb-server/wiki/Pub-Servers#public-pubs) and wait for all data to be downloaded. For more information, [click here](https://scuttlebutt.nz/docs/introduction/detailed-start/).

After all data downloaded, quit PatchWork.

### Run ssb-bot-feed

Run command under the directory which has your `config.yaml` file:

Windows:
```bash
ssb-bot-feed.cmd run
```

Other OS:
```bash
ssb-bot-feed run
```

Or you can use `--config` option to specify a path to config file.

### Start Patchwork

If you want to launch PatchWork, run following command under the directory which has your `config.yaml` file:

Windows:
```bash
ssb-bot-feed.cmd patchwork <ssbinstancename>
```

Other OS:
```bash
ssb-bot-feed patchwork <ssbinstancename>
```

Or you can use `--config` option to specify a path to config file.
