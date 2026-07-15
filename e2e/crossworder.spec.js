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
