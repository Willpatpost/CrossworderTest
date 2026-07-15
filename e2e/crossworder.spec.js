import { test, expect } from '@playwright/test';

test('daily puzzle opens in play mode and accepts grid input', async ({ page }) => {
    await page.goto('/');

    const playDailyButton = page.getByRole('button', {
        name: 'Play Today’s Puzzle'
    });
    await expect(playDailyButton).toBeEnabled();
    await playDailyButton.click();

    await expect(page.locator('#play-screen')).toBeVisible();
    await expect(page.locator('#nav-play')).toHaveAttribute('aria-selected', 'true');

    const activeCell = page.locator('#play-grid-container .grid-cell[tabindex="0"]');
    await expect(activeCell).toHaveCount(1);
    await expect(activeCell).toBeFocused();

    await expect(page.locator('#play-across-display .word-list-item')).not.toHaveCount(0);
    await expect(page.locator('#play-down-display .word-list-item')).not.toHaveCount(0);
    await expect(page.locator('#play-active-clue-label')).not.toHaveText('Select a clue to begin.');

    await activeCell.press('A');
    await expect(
        page.locator('#play-grid-container').getByText('A', { exact: true })
    ).toHaveCount(1);
});

test('manual and automated editors share an editable grid workspace', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('tab', { name: 'Editor', exact: true }).click();
    await expect(page.locator('#manual-editor-tab')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#manual-editor-controls')).toBeVisible();

    await page.locator('#automated-editor-tab').click();
    await expect(page.locator('#automated-editor-tab')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#automated-editor-controls')).toBeVisible();
    await expect(page.locator('#manual-editor-controls')).toBeHidden();

    await page.locator('#automated-rows-input').fill('9');
    await page.locator('#automated-columns-input').fill('9');
    await page.locator('#automated-block-rows-input').fill('1');
    await page.locator('#automated-block-columns-input').fill('1');
    await page.locator('#generate-random-layout-button').click();

    await expect(page.locator('#grid-container .grid-cell')).toHaveCount(81);
    await expect(page.locator('#grid-container .grid-cell.block')).not.toHaveCount(0);

    await page.locator('#letter-mode-button').click();
    const editableCell = page.locator('#grid-container .grid-cell:not(.block)').first();
    await editableCell.click();
    await editableCell.press('Z');
    await expect(page.locator('#grid-container').getByText('Z', { exact: true })).toHaveCount(1);
});
