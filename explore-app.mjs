import { chromium } from 'playwright';
import { mkdir } from 'fs/promises';

await mkdir('/opt/cursor/artifacts', { recursive: true });

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, // iPhone dimensions
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15'
});

const page = await context.newPage();

// 1. Login page
console.log('1. Capturing login page...');
await page.goto('http://localhost:3000/login');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: '/opt/cursor/artifacts/01-login-page.png', fullPage: true });

// 2. Click device-only mode
console.log('2. Clicking device-only mode...');
await page.click('text=Use on this device only');
await page.waitForURL('http://localhost:3000/');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: '/opt/cursor/artifacts/02-home-empty.png', fullPage: true });

// 3. Click "New counter" button in grid
console.log('3. Opening new counter modal...');
await page.click('text=New counter');
await page.waitForSelector('.modal', { state: 'visible' });
await page.screenshot({ path: '/opt/cursor/artifacts/03-new-counter-modal.png', fullPage: true });

// 4. Create first counter
console.log('4. Creating first counter...');
await page.fill('input[type="text"]', 'Morning Medication');
await page.fill('input[type="number"]', '30');
await page.click('button:has-text("Create")');
await page.waitForURL(/\/c\//, { timeout: 10000 });
await page.waitForLoadState('networkidle');
await page.screenshot({ path: '/opt/cursor/artifacts/04-counter-detail-empty.png', fullPage: true });

// 5. Click check-in button
console.log('5. Opening check-in modal...');
await page.click('button:has-text("Check-in")');
await page.waitForSelector('.modal', { state: 'visible' });
await page.screenshot({ path: '/opt/cursor/artifacts/05-checkin-modal.png', fullPage: true });

// 6. Add a check-in with note
console.log('6. Adding check-in...');
await page.fill('textarea', 'Took pill with breakfast');
await page.click('button:has-text("Save check-in")');
await page.waitForSelector('.modal', { state: 'hidden', timeout: 5000 }).catch(() => {});
await page.waitForTimeout(1000);
await page.screenshot({ path: '/opt/cursor/artifacts/06-after-first-checkin.png', fullPage: true });

// 7. Open settings
console.log('7. Opening settings...');
await page.click('[aria-label="Counter settings"]');
await page.waitForSelector('.modal', { state: 'visible' });
await page.screenshot({ path: '/opt/cursor/artifacts/07-settings-modal.png', fullPage: true });
await page.click('button:has-text("Cancel")');
await page.waitForSelector('.modal', { state: 'hidden' });

// 8. Add more check-ins
console.log('8. Adding more check-ins...');
for (let i = 0; i < 4; i++) {
  await page.click('button:has-text("Check-in")');
  await page.waitForSelector('.modal', { state: 'visible' });
  await page.click('button:has-text("Save check-in")');
  await page.waitForSelector('.modal', { state: 'hidden', timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);
}
await page.screenshot({ path: '/opt/cursor/artifacts/08-with-history.png', fullPage: true });

// 9. Go back to home
console.log('9. Going back to home...');
await page.click('[aria-label*="Back"]');
await page.waitForURL('http://localhost:3000/');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: '/opt/cursor/artifacts/09-home-with-counter.png', fullPage: true });

// 10. Create another counter via + button
console.log('10. Creating second counter...');
await page.click('[aria-label="New counter"]');
await page.waitForSelector('.modal', { state: 'visible' });
await page.fill('input[type="text"]', 'Daily Water');
await page.fill('input[type="number"]', '8');
await page.click('button:has-text("Create")');
await page.waitForURL(/\/c\//);
await page.waitForLoadState('networkidle');

// 11. Go back and show home with multiple counters
console.log('11. Going back to show multiple counters...');
await page.click('[aria-label*="Back"]');
await page.waitForURL('http://localhost:3000/');
await page.waitForLoadState('networkidle');
await page.screenshot({ path: '/opt/cursor/artifacts/10-home-multiple.png', fullPage: true });

// 12. Click on first counter to show detail again
console.log('12. Opening first counter detail...');
await page.click('a:has-text("Morning Medication")');
await page.waitForURL(/\/c\//);
await page.waitForLoadState('networkidle');

// 13. Try to show rounds section (scroll down)
console.log('13. Capturing rounds section...');
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(500);
await page.screenshot({ path: '/opt/cursor/artifacts/11-rounds-section.png', fullPage: true });

// 14. Click "New round"
console.log('14. Creating a round...');
await page.click('button:has-text("New round")');
await page.waitForSelector('.modal', { state: 'visible' });
await page.screenshot({ path: '/opt/cursor/artifacts/12-new-round-modal.png', fullPage: true });
await page.fill('input[type="text"]', 'Morning Routine');
await page.click('button:has-text("Create")');
await page.waitForSelector('.modal', { state: 'hidden' });
await page.waitForTimeout(1000);
await page.screenshot({ path: '/opt/cursor/artifacts/13-with-round.png', fullPage: true });

// 15. Add a sub-counter
console.log('15. Adding sub-counter...');
await page.click('button:has-text("Add sub-counter")');
await page.waitForSelector('.modal', { state: 'visible' });
await page.screenshot({ path: '/opt/cursor/artifacts/14-new-sub-modal.png', fullPage: true });
await page.fill('input[type="text"]', 'Stretch');
await page.fill('input[type="number"]', '1');
await page.click('button:has-text("Create")');
await page.waitForSelector('.modal', { state: 'hidden' });
await page.waitForTimeout(1000);
await page.screenshot({ path: '/opt/cursor/artifacts/15-with-sub.png', fullPage: true });

console.log('Done! Screenshots saved to /opt/cursor/artifacts/');
await browser.close();
