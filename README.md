# Name Override — SillyTavern Extension

Manually set custom replacement values for `{{char}}` and `{{user}}` in the prompt sent to the API. Settings are saved per character card.

## Install

### Option A: Via ST's built-in installer
1. Open SillyTavern → Extensions → Install Extension
2. Paste this folder's URL or path

### Option B: Manual
1. Copy the `name-override` folder into your ST third-party extensions directory:
   - **Linux / Termux**: `SillyTavern/data/default-user/extensions/third-party/name-override/`
   - If the above doesn't work, try: `SillyTavern/public/scripts/extensions/third-party/name-override/`
2. Restart SillyTavern
3. Go to Extensions panel → enable "Name Override"

## Usage

1. Open a chat with a character
2. In the Extensions panel, expand **Name Override**
3. Type the replacement name in the `{{char}} →` or `{{user}} →` field
4. Leave empty to use the default name

The replacement happens in the prompt sent to the API only — the UI still shows the original names.

## Troubleshooting

- **Extension doesn't appear**: Check the browser console (F12) for import errors. The relative import paths in `index.js` may need adjustment depending on your ST version. Look for the comment block at the top of `index.js`.
- **Names not being replaced**: Open browser console and check for `[name-override] loaded`. If it loaded but replacements aren't working, the event names may differ in your ST version — check `event_types` in the console.
