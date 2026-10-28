import AxeBuilder from '@axe-core/playwright';
import {expect, test} from '@playwright/test';
import {installFixtureRoutes, openIncident, openWorkbench} from './support/fixtures';

/**
 * Axe smoke for the framed-sheet redesign. The earlier a11y spec asserts
 * behaviour (dialog semantics, focus, overflow); this one checks the rendered
 * colour/contrast/naming tree on the four core surfaces.
 */
const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice'];

async function expectNoViolations(page: import('@playwright/test').Page, label: string) {
  const results = await new AxeBuilder({page}).withTags(WCAG).analyze();
  const summary = results.violations.map(v => `${v.id} (${v.impact}): ${v.nodes.map(n=>`${n.target.join(' ')}: ${n.failureSummary}`).join('\n')}`);
  expect(summary, label).toEqual([]);
}

test('workbench renders without axe violations', async ({page}) => {
  await installFixtureRoutes(page);
  await openWorkbench(page);
  await expect(page.locator('#main-content h1')).toBeVisible();
  await expectNoViolations(page, 'workbench');
});

test('incident detail renders without axe violations', async ({page}) => {
  await installFixtureRoutes(page);
  await openIncident(page);
  await expect(page.locator('#main-content h1')).toBeVisible();
  await expectNoViolations(page, 'detail');
});

test('evidence drawer renders without axe violations', async ({page}) => {
  await installFixtureRoutes(page);
  await openIncident(page);
  await page.getByRole('button', {name: /查看全部成员证据/}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expectNoViolations(page, 'evidence drawer');
});

test('official overview empty state renders without axe violations', async ({page}) => {
  await installFixtureRoutes(page);
  await page.goto('/');
  await expect(page.getByText('未找到最新正式分析结果。')).toBeVisible();
  await expectNoViolations(page, 'overview empty state');
});
