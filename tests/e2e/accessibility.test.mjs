// Accessibility, checked through the accessibility tree that assistive
// technology sees (Playwright's role locators and ARIA snapshots). The passing
// tests guard what already works; the todo tests pin WCAG 2.2 AA failures
// found while building this suite, so a fix shows up as a todo that passes.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useBrowser } from '../helpers.mjs';

const browser = useBrowser();

// Lines of an ARIA snapshot for controls that have a role but no name, e.g.
// `- button` or `- textbox [disabled]` rather than `- button "Settings"`.
function unnamedControls(snapshot) {
  return snapshot
    .split('\n')
    .map((line) => line.trim())
    .filter((line) =>
      /^- (button|link|textbox|combobox|checkbox|slider|switch|tab|option|menuitem)\b(?! ")/.test(line),
    );
}

test('the page has a language and a title, and the main controls are named', async (t) => {
  const app = await browser.open(t);
  const { page } = app;
  assert.equal(await page.getAttribute('html', 'lang'), 'en');
  assert.ok((await page.title()).trim());

  const named = [
    ['button', 'Focus timer'],
    ['button', 'Scratchpad'],
    ['button', 'Edit shortcuts'],
    ['button', 'Settings'],
    ['button', 'Zen mode (Z)'],
    ['button', 'Search'],
    ['textbox', 'Search or jump to a site'],
    ['timer', ''],
  ];
  for (const [role, name] of named) {
    const found = name ? page.getByRole(role, { name, exact: true }) : page.getByRole(role);
    assert.equal(await found.count(), 1, `${role} "${name}"`);
  }
  // Shortcut tiles are links whose name includes the shortcut's.
  assert.equal(await page.getByRole('link', { name: 'GitHub' }).getAttribute('href'), 'https://github.com');
});

test(
  'no control on the home screen is left without a name',
  async (t) => {
    const app = await browser.open(t);
    assert.deepEqual(unnamedControls(await app.page.locator('body').ariaSnapshot()), []);
  },
);

test('every control in Settings and the scratchpad has a name', async (t) => {
  const app = await browser.open(t);
  const { page } = app;
  await app.openSettings();
  assert.deepEqual(unnamedControls(await page.locator('#settingsPanel').ariaSnapshot()), []);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Shift+S');
  await page.locator('#scratchPanel').waitFor({ state: 'visible' });
  assert.deepEqual(unnamedControls(await page.locator('#scratchPanel').ariaSnapshot()), []);
});

test(
  'the undo toast is announced to screen readers',
  async (t) => {
    const app = await browser.open(t);
    const { page } = app;
    await page.click('#editBtn');
    await page.locator('#shortcutsGrid .tile', { hasText: 'Gmail' }).locator('.tile-remove').click();
    await page.locator('#toast.show').waitFor();
    assert.equal(await page.getByRole('status').filter({ hasText: 'Removed Gmail' }).count(), 1);
  },
);

test(
  'shortcuts can be added and edited from the keyboard',
  async (t) => {
    const app = await browser.open(t);
    const { page } = app;
    await app.activate('#editBtn');
    let reached = false;
    for (let i = 0; i < 40 && !reached; i++) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement.classList.contains('add-tile'));
    }
    assert.ok(reached, 'Tab never reaches the + tile');
    await page.keyboard.press('Enter');
    await page.locator('#modalOverlay').waitFor({ state: 'visible' });
  },
);

test(
  'the add/edit shortcut dialog is exposed as a labelled modal dialog',
  async (t) => {
    const app = await browser.open(t);
    const { page } = app;
    await page.click('#editBtn');
    await page.click('#shortcutsGrid .add-tile');
    await page.locator('#modalOverlay').waitFor({ state: 'visible' });
    const dialog = page.getByRole('dialog', { name: 'Add shortcut' });
    assert.equal(await dialog.count(), 1);
    assert.equal(await dialog.getAttribute('aria-modal'), 'true');
  },
);

test(
  'launcher results are exposed as a list of options tied to the search box',
  async (t) => {
    const app = await browser.open(t);
    const { page } = app;
    await app.search('git');
    const box = page.getByRole('combobox', { name: 'Search or jump to a site' });
    assert.equal(await box.count(), 1);
    assert.equal(await box.getAttribute('aria-expanded'), 'true');
    const option = page.getByRole('option', { name: /GitHub/ });
    assert.equal(await option.count(), 1);
    assert.equal(await option.getAttribute('aria-selected'), 'true');
  },
);
