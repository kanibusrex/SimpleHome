// Shortcut tiles: adding, editing and removing them in edit mode, the undo
// toast, Alt+number hotkeys, and groups.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useBrowser, eventually, DEFAULT_SHORTCUTS } from '../helpers.mjs';

const browser = useBrowser();

async function enterEditMode(app) {
  await app.page.click('#editBtn');
  await app.page.waitForFunction(() => document.body.classList.contains('editing'));
}

async function leaveEditMode(app) {
  await app.page.click('#editBtn');
  await app.page.waitForFunction(() => !document.body.classList.contains('editing'));
}

async function fillModal(app, { name, url, group }) {
  const { page } = app;
  await page.locator('#modalOverlay').waitFor({ state: 'visible' });
  if (name !== undefined) await page.fill('#tileName', name);
  if (url !== undefined) await page.fill('#tileUrl', url);
  if (group !== undefined) await page.selectOption('#tileGroup', group);
  await page.click('#modalSave');
}

const tile = (app, label) =>
  app.page.locator('#shortcutsGrid .tile', { has: app.page.locator('.tile-label', { hasText: label }) });

test('a shortcut added in edit mode opens in a new tab and survives a reload', async (t) => {
  const app = await browser.open(t);
  const { page } = app;

  await enterEditMode(app);
  await page.click('#shortcutsGrid .add-tile');
  await page.locator('#modalOverlay').waitFor({ state: 'visible' });
  assert.equal(await page.textContent('#modalTitle'), 'Add shortcut');
  assert.ok(await page.locator('#modalDelete').isHidden(), 'nothing to delete yet');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'tileName', 'the name field has focus');

  // Without a name nothing is saved and the dialog stays open.
  await page.fill('#tileUrl', 'example.com');
  await page.click('#modalSave');
  assert.ok(await page.locator('#modalOverlay').isVisible());

  await fillModal(app, { name: 'Example', url: 'example.com' });
  await page.locator('#modalOverlay').waitFor({ state: 'hidden' });
  assert.deepEqual(await app.tileLabels(), [...DEFAULT_SHORTCUTS, 'Example']);
  const saved = await app.stored('homepage.shortcuts');
  assert.deepEqual(
    saved[saved.length - 1],
    { name: 'Example', url: 'https://example.com', group: '' },
    'the scheme is added',
  );

  await leaveEditMode(app);
  const link = tile(app, 'Example');
  assert.equal(await link.evaluate((el) => el.tagName), 'A');
  assert.equal(await link.getAttribute('href'), 'https://example.com');
  assert.equal(await link.getAttribute('target'), '_blank');
  assert.match(await link.getAttribute('rel'), /\bnoopener\b/);

  await app.reload();
  assert.deepEqual(await app.tileLabels(), [...DEFAULT_SHORTCUTS, 'Example']);
});

test('adding a second shortcut to the same site asks first', async (t) => {
  const app = await browser.open(t);
  const { page } = app;
  await enterEditMode(app);

  await page.click('#shortcutsGrid .add-tile');
  app.expectDialog({ accept: false });
  await fillModal(app, { name: 'My repos', url: 'https://www.github.com/me' });
  assert.equal(app.dialogs.at(-1).message, 'GitHub already points to github.com. Add this anyway?');
  assert.ok(await page.locator('#modalOverlay').isVisible(), 'declining keeps the dialog open');
  assert.deepEqual(await app.tileLabels(), DEFAULT_SHORTCUTS);

  app.expectDialog({ accept: true });
  await page.click('#modalSave');
  await page.locator('#modalOverlay').waitFor({ state: 'hidden' });
  assert.deepEqual(await app.tileLabels(), [...DEFAULT_SHORTCUTS, 'My repos']);
});

test('clicking a tile in edit mode edits it in place', async (t) => {
  const app = await browser.open(t);
  const { page } = app;
  await enterEditMode(app);

  await tile(app, 'YouTube').click();
  await page.locator('#modalOverlay').waitFor({ state: 'visible' });
  assert.equal(await page.textContent('#modalTitle'), 'Edit shortcut');
  assert.equal(await page.inputValue('#tileName'), 'YouTube');
  assert.equal(await page.inputValue('#tileUrl'), 'https://youtube.com');

  await fillModal(app, { name: 'YT Music', url: 'music.youtube.com' });
  assert.deepEqual(await app.tileLabels(), ['GitHub', 'YT Music', 'Gmail', 'Reddit']);
  assert.equal((await app.stored('homepage.shortcuts'))[1].url, 'https://music.youtube.com');
});

test('removing a shortcut shows an undo that restores it in place', async (t) => {
  const app = await browser.open(t);
  const { page } = app;
  await enterEditMode(app);

  await tile(app, 'Gmail').locator('.tile-remove').click();
  assert.deepEqual(await app.tileLabels(), ['GitHub', 'YouTube', 'Reddit']);
  assert.deepEqual(
    (await app.stored('homepage.shortcuts')).map((s) => s.name),
    ['GitHub', 'YouTube', 'Reddit'],
  );
  await page.locator('#toast.show').waitFor();
  assert.equal(await page.textContent('#toastMsg'), 'Removed Gmail');

  await page.click('#toastAction');
  assert.deepEqual(await app.tileLabels(), DEFAULT_SHORTCUTS);
  await app.reload();
  assert.deepEqual(await app.tileLabels(), DEFAULT_SHORTCUTS, 'the restored order is what was saved');

  // The dialog's Delete button goes through the same undoable path.
  await enterEditMode(app);
  await tile(app, 'Reddit').click();
  await page.click('#modalDelete');
  assert.deepEqual(await app.tileLabels(), ['GitHub', 'YouTube', 'Gmail']);
  assert.equal(await page.textContent('#toastMsg'), 'Removed Reddit');
});

test('Alt+1 to Alt+9 open the visible tiles in a new tab', async (t) => {
  const app = await browser.open(t);
  const { page } = app;
  await page.keyboard.press('Alt+2');
  assert.deepEqual(await app.nextOpened(), { url: 'https://youtube.com', target: '_blank', features: 'noopener' });
  // No ninth tile: nothing happens.
  await page.keyboard.press('Alt+9');
  await page.keyboard.press('Alt+4');
  assert.deepEqual(
    (await app.opened()).map((o) => o.url),
    ['https://youtube.com', 'https://reddit.com'],
  );
});

// ---- groups ----

const groupTabs = (app) =>
  app.page.$$eval('#groupTabs .group-tab:not(.group-tab-add)', (tabs) =>
    tabs.map((tab) => ({
      label: tab.firstChild.textContent,
      count: Number(tab.querySelector('.group-count').textContent),
      active: tab.classList.contains('active'),
    })),
  );

async function showGroup(app, label, expectedTiles) {
  await app.page.locator('#groupTabs .group-tab', { hasText: label }).first().click();
  await eventually(async () => assert.deepEqual(await app.tileLabels(), expectedTiles));
}

test('groups: create one, file shortcuts in it, switch tabs, and deleting it ungroups them', async (t) => {
  const app = await browser.open(t);
  const { page } = app;
  assert.ok(await page.locator('#groupTabs').isHidden(), 'no tab bar until there is a group');

  await enterEditMode(app);
  app.expectDialog({ accept: true, text: 'Work' });
  await page.click('#groupTabs .group-tab-add');
  assert.equal(app.dialogs.at(-1).message, 'New group name');
  await eventually(async () =>
    assert.deepEqual(await groupTabs(app), [
      { label: 'All', count: 4, active: false },
      { label: 'Work', count: 0, active: true },
    ]),
  );
  assert.deepEqual(await app.stored('homepage.groups'), ['Work']);
  assert.deepEqual(await app.tileLabels(), [], 'the new group starts empty');

  // Adding while a group is showing files the shortcut there.
  await page.click('#shortcutsGrid .add-tile');
  await page.locator('#modalOverlay').waitFor({ state: 'visible' });
  assert.equal(await page.inputValue('#tileGroup'), 'Work');
  await fillModal(app, { name: 'Docs', url: 'docs.google.com' });
  assert.deepEqual(await app.tileLabels(), ['Docs']);

  // File an existing shortcut too, from the All tab.
  await showGroup(app, 'All', [...DEFAULT_SHORTCUTS, 'Docs']);
  await tile(app, 'GitHub').click();
  await fillModal(app, { group: 'Work' });
  await leaveEditMode(app);

  assert.ok(await page.locator('#groupTabs').isVisible(), 'tabs stay once a group exists');
  assert.deepEqual(await groupTabs(app), [
    { label: 'All', count: 5, active: true },
    { label: 'Work', count: 2, active: false },
  ]);
  await showGroup(app, 'Work', ['GitHub', 'Docs']);

  // The hotkeys follow the group that is showing.
  await page.keyboard.press('Alt+2');
  assert.equal((await app.nextOpened()).url, 'https://docs.google.com');

  await app.reload();
  assert.deepEqual(await app.tileLabels(), ['GitHub', 'Docs'], 'the active group is remembered');

  // Deleting the group keeps its shortcuts, ungrouped.
  await enterEditMode(app);
  app.expectDialog({ accept: true });
  await page.locator('#groupTabs .group-tab', { hasText: 'Work' }).locator('.group-tab-remove').click();
  assert.equal(app.dialogs.at(-1).message, 'Delete group "Work"? Its shortcuts will become ungrouped.');
  await eventually(async () => assert.deepEqual(await app.tileLabels(), [...DEFAULT_SHORTCUTS, 'Docs']));
  assert.deepEqual(await app.stored('homepage.groups'), []);
  assert.ok(
    (await app.stored('homepage.shortcuts')).every((s) => !s.group),
    'nothing still points at the group',
  );
  await leaveEditMode(app);
  assert.ok(await page.locator('#groupTabs').isHidden(), 'the tab bar goes away with the last group');
});

test(
  'search only offers shortcuts from the group that is showing, as the README promises',
  async (t) => {
    const app = await browser.open(t, {
      storage: {
        'homepage.groups': ['Work'],
        'homepage.activeGroup': 'Work',
        'homepage.shortcuts': [
          { name: 'GitHub', url: 'https://github.com', group: 'Work' },
          { name: 'YouTube', url: 'https://youtube.com', group: '' },
        ],
      },
    });
    assert.deepEqual(await app.tileLabels(), ['GitHub']);
    await app.search('tube');
    const shortcuts = (await app.results()).filter((r) => r.kind === 'Shortcut').map((r) => r.text);
    assert.deepEqual(shortcuts, []);
  },
);
