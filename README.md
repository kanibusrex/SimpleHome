# SimpleHome

A custom browser home page. One HTML file, no build step, no dependencies, no tracking — clock, launcher search, editable shortcuts, a scratchpad, and nineteen themes with animated backgrounds and customizable accent colors.

Optionally, an accompanying Chrome extension puts it on your new tab page and blocks ads using EasyList.

```
index.html      the home page — works standalone, open it and you're done
extension/      optional Chrome extension: new tab override + ad blocking
```

## Features

**Launcher search.** Type to filter your shortcuts live. Matching runs against both the shortcut name and its hostname, ranked so exact matches beat prefixes beat substrings. Arrow keys move the selection, Enter opens it in a new tab. If nothing matches, Enter runs a web search instead; if what you typed looks like a domain, an "Open" row appears too. Google, DuckDuckGo, and Bing are selectable.

**Inline calculator & unit conversion.** Type an expression like `(18 + 4) * 2`, `9^2 - 1`, or `20% of 85` and the result appears as the top row, live, computed by a small hand-rolled parser — no `eval()`. Unit conversions work the same way: `10 km to mi`, `5 kg in lbs`, `100 f to c` (length, weight, volume, and temperature). Click the result or press Enter to copy it to the clipboard rather than navigate anywhere. Plain digit-hyphen-digit strings like phone numbers or `2026-08-08` are deliberately left alone.

**Command prefixes.** Start a query with a prefix to route it somewhere specific — `gh react` searches GitHub, `y live sets` searches YouTube. Typing a partial prefix suggests the matching commands. Built in: `g` Google · `d` DuckDuckGo · `y` YouTube · `gh` GitHub · `w` Wikipedia · `r` Reddit · `a` Amazon · `m` Maps · `i` Images · `np` npm · `mdn` MDN · `so` Stack Overflow. Add your own by editing the `COMMANDS` array.

**Editable shortcuts.** Click the pencil to enter edit mode, then drag tiles to reorder, click one to rename or change its URL, or hit the × to remove it. The + tile adds new ones. Removals show an undo toast rather than a confirmation dialog, and adding a shortcut that duplicates an existing hostname warns first. Icons are pulled automatically from each site's favicon, with a letter avatar as fallback. Tiles always stay centered as a group, however many you have. Clicking a tile opens it in a new tab, leaving the home page in place.

**Groups.** Organize shortcuts into folders. A row of pill tabs appears above the grid once you create your first one (Settings isn't needed — just hit the pencil, then the + tab); the tab bar stays hidden the rest of the time if you never use it. Adding a shortcut while a group tab is active files it there automatically. Deleting a group ungroups its shortcuts rather than deleting them. Search and the Alt+1–9 hotkeys both respect whichever group is currently showing.

**Tile hotkeys.** `Alt+1` through `Alt+9` open the first nine visible tiles in a new tab. Hold `Alt` to see the numbers.

**Zen mode.** `Z` (or the ◎ button) strips everything down to just the clock and search bar, dead-centered, with the theme's background animation still running as ambience. `Esc` or `Z` again brings everything back. The state is remembered across reloads.

**Scratchpad.** A persistent notes panel that saves as you type. `Shift+S` from anywhere. Lines starting with `- [ ]` are checklist items — click the brackets to check them off (toggles to `- [x]`); clicking anywhere else on the line just places the cursor like normal text.

**Custom accent colors.** Settings → Theme has two color pickers — Accent and Accent 2 — that recolor the active theme's glow, particles, and clock digits live. Each theme remembers its own override independently, so switching themes never clobbers another theme's custom colors, and "Reset colors" drops back to that theme's defaults. Overrides travel with the export/import backup.

**Nineteen themes**, each with its own background animation:

| Theme | Palette | Animation |
|---|---|---|
| Ember | Dark red / black | Embers rising |
| Aurora | Dark teal / violet | Drifting waves over stars |
| Forest | Dark green | Wandering fireflies |
| Noir | Dark neutral | Twinkling starfield |
| Daybreak | Warm light | Floating light motes |
| Frost | Cool light | Falling snow |
| Sunset | Pink / peach | Drifting clouds |
| Bloom | Lavender / pink | Falling petals |
| Matrix | Phosphor green / black | Digital rain — katakana columns falling at staggered speeds, each led by a bright white glyph, with the trailing characters churning as they fall |
| Ember Matrix | Ember orange / black | The same digital rain as Matrix, recolored to Ember's orange-and-amber palette |
| Synthwave | Magenta / cyan on deep purple | A perspective grid scrolling toward the horizon under a striped, slowly pulsing sun |
| Cosmos | Indigo / violet | A deep starfield with drifting nebula clouds and periodic shooting stars |
| Storm | Slate blue | Wind-driven rain streaks with occasional sheet lightning |
| Abyss | Deep sea cyan | Bubbles wobbling up through swaying shafts of light |
| Circuit | Slate / lime | Pulses travelling along etched right-angle board traces |
| Terminal | Amber on black | CRT phosphor — scanlines, a rolling refresh bar, and a faint flicker |
| Festival | Night blue / multicolour | Rockets climbing and bursting into falling sparks |
| Ripple | Pale blue light | Rings spreading outward like rain on still water |
| Lava | Plum / magenta | Metaball blobs rising and merging, lava-lamp style |

Shortcut tiles, the search bar, and the scratchpad share a hover/focus treatment: a dark outline with a gradient glow that travels around the perimeter, colored from the active theme's accent.

**Clock.** A monospace instrument readout: 24-hour time with live seconds, an unlit `88:88` layer showing through behind the digits, a blinking separator, and a bar under the readout that sweeps once per minute. Below it sits a technical strip — ISO date, ISO week number, day of year, and UTC offset. The digits aren't plain black or white — each theme defines its own `--clock` and `--clock-2` pair, and the numerals are filled with a gradient between them, so the readout carries the theme's color rather than sitting on top of it. Those pairs are hand-picked to clear WCAG's 3:1 large-text contrast bar against every background. Set `CLOCK_24H = false` near `tick()` for a 12-hour clock with an AM/PM suffix.

**Time-of-day greeting** above the clock, switching between morning, afternoon, evening, and night.

**Export / import.** Everything lives in `localStorage`, which is per-browser and one "clear browsing data" away from gone. Settings → Backup writes a JSON file with your shortcuts, groups, theme, custom accent colors, engine, and notes, and reads it back on another machine.

## Keyboard

| Key | Action |
|---|---|
| `/` | Jump to search |
| `↑` `↓` | Move through results |
| `Enter` | Open the selected result in a new tab, or copy a calculator result |
| `Alt+1`–`Alt+9` | Open the first nine visible tiles in a new tab |
| `Shift+S` | Toggle the scratchpad |
| `Z` | Toggle zen mode |
| `Esc` | Clear search / close the open panel or modal / exit zen mode |

## Setup

Download `index.html` and open it — that's the whole install. To use it as your actual home page:

**Hosted (recommended).** Push `index.html` to a repo, enable GitHub Pages under Settings → Pages, and point your browser at the resulting URL. This way the same page and its favicons work across every device you sign into.

**Local file.** Point your browser at the `file://` path instead. Works fine, but favicons need a network connection either way, and the file won't follow you between machines.

Then set it in your browser:

- **Chrome / Edge** — Settings → On startup → Open a specific page, and Appearance → Show home button → set the URL
- **Firefox** — Settings → Home → Homepage and new windows → Custom URLs
- **Safari** — Settings → General → Homepage

### New tab page

Browsers reserve the new tab slot for extensions, so a plain web page can't claim it. `extension/` in this repo does exactly that — see [The extension](#the-extension) below. A general-purpose redirector like *Custom New Tab URL* (Chrome) or *New Tab Override* (Firefox) pointed at your Pages URL works too, if you'd rather not run this one.

## The extension

`extension/` holds an optional Chrome extension that does two things a web page can't:

1. **Sets SimpleHome as your new tab page.** Browsers reserve that slot for extensions, so this is the only way to get it there.
2. **Blocks ads and trackers**, using EasyList.

### Install

1. Go to `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select the `extension/` folder

It fetches filter lists on install, then refreshes them daily.

### How the blocking works

The extension downloads EasyList and converts it into Chrome `declarativeNetRequest` rules at runtime — the filter lists aren't vendored into the repo, so they stay current without you doing anything.

- **Network blocking** stops ad and tracker requests before they leave your browser
- **Cosmetic filtering** hides the leftover empty containers that would otherwise sit as blank gaps

From current EasyList + EasyPrivacy that works out to roughly 12,800 network rules and 28,000 element-hiding selectors, converted from about 85,000 filter lines at a 99.4% conversion rate. `node validate-rules.mjs` prints the current figures for whichever lists you point it at.

Most of EasyList is `||domain^` and nothing else — the adserver section alone is some 47,000 lines of it. Those fold into one rule per thousand domains using DNR's `requestDomains`, which matches subdomains the same way `||domain^` does. Without that the lists would overrun Chrome's rule ceiling twice over; with it they fit inside half of it.

Three lists are selectable in the popup: **EasyList** (ads), **EasyPrivacy** (trackers), and **Annoyances** (cookie notices, social widgets — off by default, since it's the most likely to break a page). The popup also has a global on/off switch and a per-site allowlist for when blocking breaks something.

### Honest limits

This is not a uBlock Origin replacement, and you should use uBlock instead if pure blocking quality is what you're after. Specifically:

- Chrome's `declarativeNetRequest` caps dynamic rules at 30,000. The three lists together currently land around 12,800, but a big enough combination still gets truncated — exceptions are installed first, since losing a block costs you an ad while losing an exception breaks a working page
- Regex rules are capped at 1,000 by Chrome, separately from that total
- Filters using options DNR can't express (`$csp`, `$redirect`, `$removeparam`, `$popup`) are skipped rather than approximated — a wrong rule breaks pages in ways that are hard to trace
- Procedural cosmetic filters (`:has-text`, `:-abp-has`, ABP snippets) are skipped; only plain CSS selectors are applied
- `$badfilter`, which retracts another list's filter, is skipped rather than honoured, so a handful of filters stay live that a full engine would drop
- There's no anti-adblock circumvention, so sites that detect blockers will still detect this

### Developing

The filter parser has a test suite and a schema validator:

```bash
cd extension
node test-parser.mjs      # unit tests for the ABP -> DNR converter
node validate-rules.mjs   # checks generated rules against Chrome's DNR constraints
```

`validate-rules.mjs` expects sample lists in `/tmp`; it skips cleanly if they aren't there. To give it something to chew on:

```bash
curl -o /tmp/easylist.txt https://easylist.to/easylist/easylist.txt
curl -o /tmp/easyprivacy.txt https://easylist.to/easylist/easyprivacy.txt
```

Manifest V3 forbids inline scripts, so the extension's new tab page is generated from the root `index.html` rather than duplicated. After editing `index.html`, run:

```bash
cd extension && python3 build-newtab.py
```

That writes `newtab.html` and `newtab.js`. Both are committed, so the extension loads unpacked without anyone having to build it first. The icons are generated too, though only if the mark itself changes:

```bash
pip install Pillow
cd extension && python3 build-icons.py
```

## Notes

- Data is stored under the `homepage.*` keys in `localStorage`. Nothing leaves your browser.
- The page is installable — it ships a generated web app manifest, so Chrome and Safari will offer to add it to your dock or home screen as a standalone app. The favicon and status bar color follow the active theme.
- Background animations pause when the tab is hidden, so a backgrounded home page costs nothing.
- `prefers-reduced-motion` is respected: animated backgrounds are hidden and transitions are cut for anyone who has that set at the OS level.
- One request reaches outside the page: Google's favicon service (`s2/favicons`) for tile icons. Remove that line in `renderShortcuts()` and the page makes no third-party request at all — tiles fall back to letter avatars.
- The traveling glow uses `@property` for the animated gradient angle: Chrome/Edge 85+, Safari 16.4+, Firefox 128+. On older browsers the outline renders static instead of animating; nothing breaks.

## License

MIT
