from pathlib import Path
import json
from playwright.sync_api import sync_playwright

repo = Path(__file__).resolve().parents[2]
report = repo / 'reports/full-e2e/live-2026-09-12T07-11-29-470Z-4d3d4690/report.html'
checks = []
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in [1440, 390]:
        page = browser.new_page(viewport={'width': width, 'height': 1000}, device_scale_factor=1)
        errors = []
        page.on('pageerror', lambda error: errors.append(str(error)))
        page.goto(report.as_uri())
        assert page.locator('article').count() == 5
        assert page.locator('.round').count() == 17
        assert '售後優先' in page.locator('header').inner_text()
        assert '非模型逐字稿' in page.locator('header').inner_text()
        assert not errors
        assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth')
        page.screenshot(path=str(report.parent / f'preview-{width}.png'), full_page=True)
        if width == 1440:
            page.locator('article').first.screenshot(path=str(report.parent / 'top-seller.png'))
        checks.append({'width': width, 'cards': 5, 'rounds': 17, 'overflow': False, 'page_errors': errors})
        page.close()
    browser.close()
(Path(__file__).parent / 'visual-check.json').write_text(json.dumps(checks, indent=2), encoding='utf-8')
print('PASS: desktop/mobile, five sellers, 17 rounds, preference label, no overflow or page errors.')
