# VocabMaster

A Chrome extension for vocabulary learning and word translation.

## Features
- Look up and translate words while browsing
- Save words to your personal vocabulary list
- Lightweight — Manifest V3, only `storage` + `activeTab` permissions

## Install (load unpacked)
1. Clone this repo
2. Open `chrome://extensions` and enable **Developer mode**
3. Click **Load unpacked** and select this folder

## Structure
- `background/` — service worker
- `content/` — in-page content script
- `popup/` — extension popup UI
- `manifest.json` — MV3 manifest

## License
MIT
