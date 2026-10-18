# SimpleHome

A custom browser home page. One HTML file, no build step, no dependencies, no tracking — clock, launcher search, editable shortcuts, a scratchpad, a focus timer with generated soundscapes, and thirty-six themes with animated backgrounds and customizable accent colors.

Optionally, an accompanying Chrome extension puts it on your new tab page and blocks ads using EasyList.

```
index.html      the home page — works standalone, open it and you're done
extension/      optional Chrome extension: new tab override + ad blocking
```

## Features

**Launcher search.** Type to filter your shortcuts live. Matching runs against both the shortcut name and its hostname, ranked so exact matches beat prefixes beat substrings. Arrow keys move the selection, Enter opens it in a new tab. If nothing matches, Enter runs a web search instead; if what you typed looks like a domain, an "Open" row appears too. Google, DuckDuckGo, and Bing are selectable.

**Inline calculator & unit conversion.** Type an expression like `(18 + 4) * 2`, `9^2 - 1`, or `20% of 85` and the result appears as the top row, live, computed by a small hand-rolled parser — no `eval()`. Unit conversions work the same way: `10 km to mi`, `5 kg in lbs`, `100 f to c` (length, weight, volume, and temperature). Click the result or press Enter to copy it to the clipboard rather than navigate anywhere. Plain digit-hyphen-digit strings like phone numbers or `2026-08-08` are deliberately left alone.

**Autocomplete.** The page can't read your browser history — no web page can — so the launcher keeps its own. Anything you open from here (a tile, a result, a URL you typed) is remembered and ranked by how often and how recently you used it. From then on, typing completes the host inline the way an address bar does: type `gith` and the rest of `github.com` appears selected, so carrying on typing replaces it and `→` or `Enter` accepts it. Deep links come back as their own rows, so `gith` can offer `github.com/notifications` rather than just the domain. Completion is host-only — completing a whole path mid-keystroke means undoing a guess on every character.

Settings → History shows how many sites are remembered and clears them, with an undo. The log is capped at 300 entries, stays in this browser's `localStorage`, and travels with the export/import backup.

**Command prefixes.** Start a query with a prefix to route it somewhere specific — `gh react` searches GitHub, `y live sets` searches YouTube. Typing a partial prefix suggests the matching commands. Built in: `g` Google · `d` DuckDuckGo · `y` YouTube · `gh` GitHub · `w` Wikipedia · `r` Reddit · `a` Amazon · `m` Maps · `i` Images · `np` npm · `mdn` MDN · `so` Stack Overflow. Add your own by editing the `COMMANDS` array.

**Editable shortcuts.** Click the pencil to enter edit mode, then drag tiles to reorder, click one to rename or change its URL, or hit the × to remove it. The + tile adds new ones. Removals show an undo toast rather than a confirmation dialog, and adding a shortcut that duplicates an existing hostname warns first. Icons are pulled automatically from each site's favicon, with a letter avatar as fallback. Tiles always stay centered as a group, however many you have. Clicking a tile opens it in a new tab, leaving the home page in place.

**Groups.** Organize shortcuts into folders. A segmented control — a frosted track with an accent pill gliding between tabs, each showing how many shortcuts it holds, scrolling sideways on a narrow screen — appears above the grid once you create your first one (Settings isn't needed — just hit the pencil, then the + tab); the tab bar stays hidden the rest of the time if you never use it. Adding a shortcut while a group tab is active files it there automatically. Deleting a group ungroups its shortcuts rather than deleting them. Search and the Alt+1–9 hotkeys both respect whichever group is currently showing.

**Tile hotkeys.** `Alt+1` through `Alt+9` open the first nine visible tiles in a new tab. Hold `Alt` to see the numbers.

**Toolbar.** Focus, scratchpad, edit, settings and zen sit in a frosted floating bar at the bottom right, drawn as line icons that lift on hover with a label above them; whichever is open glows in the accent. On a phone it becomes a full-width tab bar with labels. It used to be pinned top right, where the clock — which is sized to the viewport — grew into it below 900px wide and genuinely overlapped it on a phone in landscape. The bottom is also the easier end of a phone to reach.

**Touch gestures.** On a phone, where none of the keyboard shortcuts exist: swipe left or right across the page to move between groups, long-press a tile to edit it without entering edit mode, and pull down from the top of the page to jump into search. The phone's own long-press link menu is switched off on tiles so it doesn't get in the way, as is the browser's pull-to-refresh.

**Docked header.** Scroll and the clock doesn't leave: it shrinks into a compact readout and pins to the top with the search bar, over a frosted-glass band, while the tiles scroll underneath — the greeting and date strip fade out on the way. The collapse is a scroll-driven CSS animation, so it moves in lockstep with your finger (browsers without scroll timelines get the same effect from a script). A page that only just overflows gets a little extra scroll room so the collapse can finish.

**Finish.** The page settles in on load — clock, search and then each tile rising out of a soft blur in sequence. Tiles are lit glass cards that lift and tilt toward the pointer, with a spotlight following it, and give slightly under a press. Icons sit on dark graphite app-icon wells; logos that are dark themselves (GitHub, X, Notion) are detected and drawn inverted so they stay visible, and sites without a favicon get an accent-coloured letter; the search results open as a frosted-glass panel. While a tile's favicon is loading its slot shimmers, and the icon resolves in from a soft blur when it arrives (letter avatars get the same reveal). Changing category — by tab or by swipe — sends the current tiles out toward where you're going and cascades the new set in from that side, while the highlight glides across to the new tab. Settings is laid out as grouped cards, each with an icon, with taller theme previews (a check marks the active one), round colour pickers and keycap-style shortcut lists. Settings and the scratchpad open as frosted sheets — floating cards on a wide screen, full height on a phone — that glide in with their sections settling one after another and dim the page behind. Their title and close button stay pinned while the sheet scrolls, and tapping the dimmed page closes them too.

**Zen mode.** `Z` (or the ◎ button) strips everything down to just the clock and search bar, dead-centered, with the theme's background animation still running as ambience. `Esc` or `Z` again brings everything back. The state is remembered across reloads.

**Focus.** `F` (or the timer button) opens Drift, a focus timer that fills the screen with a place to work in: Rain on Glass, Night Train, Corner Café, Night Shore or Server Room. Each place is a live canvas scene with a soundscape generated in the browser by the Web Audio API — there are no audio files — and the two are tied together: a drop you hear lands on the glass, the view jolts as the wheels cross a rail joint, foam runs up the sand as a wave breaks, drive lights flicker as the disks seek. A mixer sets the four layers of each place, remembered per place. Pick 15 to 90 minutes (or any length in 5-minute steps) and the controls fade away until you move; the session ends with a slow fade and an optional bell, then asks what you worked on. Pomodoro breaks are a switch away: 5 minutes after each round and 15 after every fourth, played quieter, with the note taken during the break instead. The log shows today, this week, your streak and all-time totals, a 26-week heatmap and recent sessions with their notes. `Esc` or Home goes back to your shortcuts without stopping anything: the toolbar button counts down, as does the tab title, and the timer reopens itself when a session or break ends. The timer has its own styles inside a shadow root, so the themes and it never touch.

**Scratchpad.** A persistent notes panel that saves as you type, on a ruled page whose lines scroll with the text, with a live saved indicator, a word count, and buttons to start a checklist item or copy the whole note. `Shift+S` from anywhere. Lines starting with `- [ ]` are checklist items — click the brackets to check them off (toggles to `- [x]`); clicking anywhere else on the line just places the cursor like normal text.

**Custom accent colors.** Settings → Theme has two color pickers — Accent and Accent 2 — that recolor the active theme's glow, particles, and clock digits live. Each theme remembers its own override independently, so switching themes never clobbers another theme's custom colors, and "Reset colors" drops back to that theme's defaults. Overrides travel with the export/import backup.

**Thirty-six themes**, each with its own background animation:

| Theme | Palette | Animation |
|---|---|---|
| Ember | Dark red / black | Fire embers rising on a canvas — each spark is born white-hot, cools through orange to deep red as it climbs, flickers and is pushed about by turbulence, with out-of-focus embers drifting near the camera and firelight breathing up from below |
| Aurora | Teal / violet | Curtains of northern lights — rays rippling along a snaking hem — over a twinkling starfield |
| Forest | Deep green / lime | Fireflies blinking at different depths, light shafts from the canopy, mist drifting along the floor |
| Noir | Graphite / steel blue | Light through venetian blinds raking across a dark wall, with dust that only shows where it catches the light |
| Daybreak | Warm light | A low sun breathing light into the corner, slowly turning rays, a lens-flare chain and golden dust |
| Frost | Cool light | Snow at three depths in gusting wind, out-of-focus flakes near the lens, and ice crystals grown into the corners |
| Sunset | Pink / peach | Soft clouds at three depths, lit warm underneath, drifting past a glowing low sun, with birds crossing now and then |
| Bloom | Lavender / pink | Cherry-blossom petals tumbling in 3D as they fall, over drifting soft light |
| Matrix | Phosphor green / black | Digital rain at two depths, each stream led by a bright glowing glyph with a fading trail |
| Ember Matrix | Ember orange / black | The same digital rain as Matrix, in Ember's orange and amber |
| Synthwave | Magenta / cyan on deep purple | A sliced neon sun sinking behind wireframe mountains over a perspective grid rolling toward you |
| Cosmos | Indigo / violet | A spiral galaxy of thousands of stars turning slowly, inner stars faster, with a glowing core and shooting stars |
| Storm | Slate blue | Wind-driven rain at two depths under drifting cloud, and branching lightning that flickers and lights the sky |
| Abyss | Deep sea cyan | Caustic light rippling down from the surface, slanting sun rays, drifting plankton and wobbling bubbles |
| Circuit | Slate / lime | A circuit board drawn on a canvas — chamfered copper traces and solder pads, with glowing data pulses and their tails racing along them and pads flashing as they pass |
| Terminal | Amber on black | CRT phosphor — scanlines and flicker — over a system log typing itself out |
| Festival | Night blue / multicolour | A fireworks show: peonies, rings and golden willows bursting, falling under gravity and crackling out |
| Ripple | Pale blue light | Rain on still water at a low angle — ring trains with crest and trough — and drifting glints; tap to drop a pebble |
| Lava | Plum / magenta / molten orange | A lava lamp: glossy wax blobs, lit from within, rise off a glowing heater, cool from orange to magenta as they climb, and merge and split as they pass — shaded on a canvas with a specular highlight and a hot rim |
| Hyperdrive | Cyan / magenta on deep space | A warp-speed starfield drawn on a canvas — cruising streaks that surge into a light-speed jump every thirteen seconds |
| Gilded | Black / gold | Art-deco sunburst rocking slowly from below, drifting gold dust, four-point glints, and a light sheen sweeping across |
| Prism | Violet / teal iridescent | Two counter-rotating holographic colour fields with tinted stage beams swinging through them |
| Velvet | Crimson / violet / orange | A slowly morphing mesh gradient under a fine, animated film grain |
| Carbon | Graphite / crimson | Carbon-fibre weave with a crimson light bar scanning down it and ambient edge lighting that breathes |
| Pulse | Graphite / crimson | A glowing heart-monitor trace sweeping across a faint grid, with a red flash on every beat |
| Shard | Graphite / crimson / silver | Panes of dark beveled glass drifting at different depths (the nearest out of focus), with crimson comets of light running round their edges |
| Hive | Graphite / crimson | A honeycomb grid lit by crimson waves — tap or click anywhere to send one out from that point |
| Eclipse | Black / gold | A total solar eclipse framing the clock: a black moon behind the readout, a flickering corona, and a diamond-ring flare on the limb every twenty-odd seconds. It follows the clock into zen mode |
| Silk | Champagne / rose on midnight | Generative flow-field threads weaving glowing strands along a slowly shifting current — different every load |
| Contour | Copper on charcoal | A living topographic map: contour lines traced by marching squares over drifting terrain, kept quiet behind the clock |
| Nocturne | Amber / blue city night | Rain on a window over out-of-focus city lights — drops catch, run in fits and starts, and sweep up the droplets in their path |
| Kintsugi | Gold on raku black | Gold seams crack in from the edges and branch across dark glazed ceramic, glints running along them; old seams fade as new ones form |
| Ink | Indigo / vermilion on paper | Ink drops blooming and curling through water — tap or click anywhere to drop more |
| Liquid Chrome | Silver / ice blue | A rippling mirrored surface with hard-edged chrome reflections — tap or click to send a ripple across it |
| Liquid Crimson | Dark grey / crimson | Liquid Chrome's rippling mirror in gunmetal, with a crimson sheen along the reflections — tap or click for a ripple |
| Origami | Cream / coral on deep teal | Sheets of paper fold themselves into planes, then glide and bank across the page trailing dotted flight paths |

Shortcut tiles, the search bar, and the scratchpad share a hover/focus treatment: a dark outline with a gradient glow that travels around the perimeter, colored from the active theme's accent.

**Clock.** A monospace instrument readout: 12-hour time with live seconds and an AM/PM marker stacked beneath them, an unlit `88:88` layer showing through behind the digits (`8:88` when the hour is a single digit), a blinking separator, and a bar under the readout that sweeps once per minute. Below it sits a technical strip — ISO date, ISO week number, day of year, and UTC offset. The digits aren't plain black or white — each theme defines its own `--clock` and `--clock-2` pair, and the numerals are filled with a gradient between them, so the readout carries the theme's color rather than sitting on top of it. Those pairs are hand-picked to clear WCAG's 3:1 large-text contrast bar against every background. Set `CLOCK_24H = true` near `tick()` for a 24-hour readout instead; the AM/PM marker then stays empty and collapses.

The hour and minute roll into place when they change, a band of light sweeps across the digits every few seconds, and the minute bar is a hairline with a lit bead riding its leading edge.

**Search bar.** Frosted glass with a lit top edge, a search icon, the engine shown as a small chip sized to its name, a "Search or type a URL" hint beside the glowing cursor, and a filled accent button. Focusing it lifts it slightly with a soft accent ring.

The greeting, clock and date sit on a frosted-glass card so they read cleanly over any background; it fades away as the header docks (Eclipse goes without it, since its moon frames the clock).

**Time-of-day greeting** above the clock, switching between morning, afternoon, evening, and night.

**Export / import.** Everything lives in `localStorage`, which is per-browser and one "clear browsing data" away from gone. Settings → Backup writes a JSON file with your shortcuts, groups, theme, custom accent colors, engine, notes, autocomplete history, and focus sessions and sound settings, and reads it back on another machine.

## Keyboard

| Key | Action |
|---|---|
| `/` | Jump to search |
| `↑` `↓` | Move through results |
| `Enter` | Open the selected result in a new tab, or copy a calculator result |
| `→` | Accept the inline completion |
| `Alt+1`–`Alt+9` | Open the first nine visible tiles in a new tab |
| `Shift+S` | Toggle the scratchpad |
| `Z` | Toggle zen mode |
| `F` | Open the focus timer |
| `Esc` | Clear search / close the open panel or modal / exit zen mode / leave the focus timer |

Inside the focus timer: `Space` starts or pauses, `←` `→` or `1`–`5` change place, `↑` `↓` change the length, `B` toggles Pomodoro breaks, `M` opens the mixer and `L` the log.

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

- Data is stored under the `homepage.*` keys in `localStorage`. Nothing leaves your browser, the autocomplete history included — clear it any time from Settings → History.
- The page is installable — it ships a generated web app manifest, so Chrome and Safari will offer to add it to your dock or home screen as a standalone app. The icon is a command prompt rather than a house, since a house glyph is indistinguishable from every other one on a home screen. It is drawn from the theme: the chevron takes the accent, the cursor takes the second accent, and the ground and status bar colour take the background, so an installed copy keeps the theme it was installed from. The extension's PNGs carry the same mark.
- Background animations pause when the tab is hidden, so a backgrounded home page costs nothing.
- `prefers-reduced-motion` is respected: animated backgrounds are hidden and transitions are cut for anyone who has that set at the OS level.
- One request reaches outside the page: Google's favicon service (`s2/favicons`) for tile icons. Remove that line in `renderShortcuts()` and the page makes no third-party request at all — tiles fall back to letter avatars.
- The traveling glow uses `@property` for the animated gradient angle: Chrome/Edge 85+, Safari 16.4+, Firefox 128+. On older browsers the outline renders static instead of animating; nothing breaks.

## License

MIT
