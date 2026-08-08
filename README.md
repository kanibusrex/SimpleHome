# Home

A custom browser home page. One HTML file, no build step, no dependencies, no tracking — clock, launcher search, editable shortcuts, a scratchpad, and nineteen themes with animated backgrounds and customizable accent colors.

## Features

**Launcher search.** Type to filter your shortcuts live. Matching runs against both the shortcut name and its hostname, ranked so exact matches beat prefixes beat substrings. Arrow keys move the selection, Enter opens it in a new tab. If nothing matches, Enter runs a web search instead; if what you typed looks like a domain, an "Open" row appears too. Google, DuckDuckGo, and Bing are selectable.

**Command prefixes.** Start a query with a prefix to route it somewhere specific — `gh react` searches GitHub, `y live sets` searches YouTube. Typing a partial prefix suggests the matching commands. Built in: `g` Google · `d` DuckDuckGo · `y` YouTube · `gh` GitHub · `w` Wikipedia · `r` Reddit · `a` Amazon · `m` Maps · `i` Images · `np` npm · `mdn` MDN · `so` Stack Overflow. Add your own by editing the `COMMANDS` array.

**Editable shortcuts.** Click the pencil to enter edit mode, then drag tiles to reorder, click one to rename or change its URL, or hit the × to remove it. The + tile adds new ones. Removals show an undo toast rather than a confirmation dialog, and adding a shortcut that duplicates an existing hostname warns first. Icons are pulled automatically from each site's favicon, with a letter avatar as fallback. Tiles always stay centered as a group, however many you have. Clicking a tile opens it in a new tab, leaving the home page in place.

**Tile hotkeys.** `Alt+1` through `Alt+9` open the first nine tiles in a new tab. Hold `Alt` to see the numbers.

**Scratchpad.** A persistent notes panel that saves as you type. `Shift+S` from anywhere.

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

**Export / import.** Everything lives in `localStorage`, which is per-browser and one "clear browsing data" away from gone. Settings → Backup writes a JSON file with your shortcuts, theme, custom accent colors, engine, and notes, and reads it back on another machine.

## Keyboard

| Key | Action |
|---|---|
| `/` | Jump to search |
| `↑` `↓` | Move through results |
| `Enter` | Open the selected result in a new tab |
| `Alt+1`–`Alt+9` | Open the first nine tiles in a new tab |
| `Shift+S` | Toggle the scratchpad |
| `Esc` | Close the open panel, modal, or search |

## Setup

Download `index.html` and open it — that's the whole install. To use it as your actual home page:

**Hosted (recommended).** Push `index.html` to a repo, enable GitHub Pages under Settings → Pages, and point your browser at the resulting URL. This way the same page and its favicons work across every device you sign into.

**Local file.** Point your browser at the `file://` path instead. Works fine, but favicons need a network connection either way, and the file won't follow you between machines.

Then set it in your browser:

- **Chrome / Edge** — Settings → On startup → Open a specific page, and Appearance → Show home button → set the URL
- **Firefox** — Settings → Home → Homepage and new windows → Custom URLs
- **Safari** — Settings → General → Homepage

### New tab page

Browsers deliberately don't let a plain web page override the new tab page — that slot is reserved for extensions. To get this on new tabs you'll need a redirector extension like *Custom New Tab URL* (Chrome) or *New Tab Override* (Firefox), pointed at your Pages URL.

## Notes

- Data is stored under the `homepage.*` keys in `localStorage`. Nothing leaves your browser.
- The page is installable — it ships a generated web app manifest, so Chrome and Safari will offer to add it to your dock or home screen as a standalone app. The favicon and status bar color follow the active theme.
- Background animations pause when the tab is hidden, so a backgrounded home page costs nothing.
- `prefers-reduced-motion` is respected: animated backgrounds are hidden and transitions are cut for anyone who has that set at the OS level.
- The one external request is to Google's favicon service (`s2/favicons`) for tile icons. Remove that line in `renderShortcuts()` if you'd rather have zero third-party requests — tiles fall back to letter avatars.
- The traveling glow uses `@property` for the animated gradient angle: Chrome/Edge 85+, Safari 16.4+, Firefox 128+. On older browsers the outline renders static instead of animating; nothing breaks.

## License

MIT
