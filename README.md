# ssb2dmba/ssb-bot-feed

Scuttlebutt bot that read RSS feeds and post updates automatically.

It was based on the original [ssb-bot-feed](https://github.com/klarkc/ssb-bot-feed). Then it's been completely rewritten as @marine-master/ssb-bot-feed

This fork add update for invite and hub and spoke to an ssb-relay server.

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

1. Follow [this instruction](https://nodejs.org/en/download/package-manager/) to install NodeJS. You can also use [NVM](https://github.com/nvm-sh/nvm) to install NodeJS.

2. Install ssb-bot-feed:
    ```bash
    git clone https://github.com/ssb2dmba/ssb-bot-feed-plus.gi
    ```

### Configuration

Create a file in current folder with filename `config.yaml` using `config.yaml.example`:
Get an invite for the ssb-relay (ex: http://delog.in/invite/)

## Usage

    ```bash
    cd ssb-bot-feed-plus
    npm run start 
    ```

or

    ```bash
    cd ssb-bot-feed-plus 
    ./node_modules/.bin/pm2 start --name "ssb-bot" npm -- start
    ```
