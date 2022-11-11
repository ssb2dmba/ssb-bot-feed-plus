# Changes

## 1.2.0

### Added

* Config file validation.

### Changed

* Command ssb-bot-feed-patchwork is removed. Now please use sub-commands. For example: `ssb-bot-feed patchwork ssb_name`. See README.md for more information.

### Fixed

* CSS in `<style>` tags will be removed and won't be posted as normal text any more.

## 1.1.4

### Fixed

* "localStorage is not defined" at has-network2 module

## 1.1.3

### Changed

* electron-builder is not required to install the package now.

## 1.1.2

### Fixed

* ssb-bot-feed is now working under Windows.

## 1.1.1

### Added

* Add MacOS support to `ssb-bot-feed-patchwork` command.

## 1.1.0

### Added

* Each ssb-server runs in its standalone process.
* New `ssb-bot-feed-patchwork` command to launch PatchWork which connect to internal ssb-server easily.

## 1.0.0

Initial Release