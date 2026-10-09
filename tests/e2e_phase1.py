"""Phase 1 end-to-end test in headless Chromium (mobile viewport).

Run:  python3 tests/e2e_phase1.py            (serves the repo on a local port)
Covers: app boot, add/edit/validate cards, sensitive-data refusal, persistence across reloads,
offline reload via service worker, encrypted export -> wipe -> import (Scenario 11), archive.
"""
import functools, http.server, json, os, socketserver, sys, threading
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parent.parent
SHOTS = Path(os.environ.get('SHOTS', '/tmp/ekfba-shots')); SHOTS.mkdir(parents=True, exist_ok=True)
PASS = 'my long backup phrase'

class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache'); super().end_headers()

def serve():
    httpd = socketserver.TCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT)))
    threading.Thread(target=httpd.serve_forever, daemon=True).start()
    return httpd, f'http://127.0.0.1:{httpd.server_address[1]}/'

def main():
    httpd, base = serve()
    errors = []
    results = []
    def check(name, cond):
        results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        ctx = browser.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, accept_downloads=True)
        page = ctx.new_page()
        page.on('console', lambda m: m.type == 'error' and errors.append(m.text))
        page.on('pageerror', lambda e: errors.append(str(e)))

        page.goto(base)
        page.wait_for_selector('html[data-ready="1"]')
        check('boots to home', page.locator('.topbar__title').inner_text() == 'EKFBA')
        page.screenshot(path=str(SHOTS / '01-home-empty.png'), full_page=True)

        # Add a valid card
        page.goto(base + '#/cards/new'); page.wait_for_selector('#card-form')
        page.fill('[name=bank]', 'HDFC Bank'); page.fill('[name=name]', 'Millennia')
        page.select_option('[name=network]', 'Visa'); page.fill('[name=last4]', '4417')
        page.fill('[name=nickname]', 'Shopping'); page.fill('[name=annualFee]', '1,000')
        page.fill('[name=sourceUrls]', 'https://www.hdfcbank.com/personal/pay/cards/credit-cards/millennia-credit-card')
        page.screenshot(path=str(SHOTS / '02-add-card.png'), full_page=True)
        page.click('button[type=submit]')
        page.wait_for_selector('.panel__title:has-text("Card details")')
        check('card saved and detail shown', 'Shopping ••4417' in page.locator('.topbar__title').inner_text())
        check('annual fee formatted', page.locator('.kv:has-text("Annual fee") dd').inner_text() == '₹1,000')
        page.screenshot(path=str(SHOTS / '03-card-detail.png'), full_page=True)
        card_url = page.url

        # Validation + sensitive data refusal
        page.goto(base + '#/cards/new'); page.wait_for_selector('#card-form')
        page.click('label:has-text("Debit card")')
        page.fill('[name=bank]', 'SBI'); page.fill('[name=name]', 'Classic'); page.select_option('[name=network]', 'RuPay')
        page.fill('[name=nickname]', 'Salary'); page.fill('[name=notes]', 'card 4111 1111 1111 1111')
        page.click('button[type=submit]')
        page.wait_for_selector('.field__error')
        check('full card number refused', 'card number' in page.locator('.field__error').first.inner_text())
        page.fill('[name=notes]', 'Salary account debit card'); page.fill('[name=last4]', '12')
        page.click('button[type=submit]'); page.wait_for_selector('.field__error')
        check('bad last4 refused', 'last 4' in page.locator('.field__error').first.inner_text())
        page.fill('[name=last4]', '9021'); page.click('button[type=submit]')
        page.wait_for_selector('.panel__title:has-text("Card details")')
        check('debit card saved after fixing', 'Salary ••9021' in page.locator('.topbar__title').inner_text())

        # Edit -> version increments, data persists across reload
        page.goto(card_url + '/edit'); page.wait_for_selector('#card-form')
        page.fill('[name=nickname]', 'Online shopping'); page.click('button[type=submit]')
        page.wait_for_selector('.panel__title:has-text("Card details")')
        page.reload(); page.wait_for_selector('html[data-ready="1"]')
        check('edit persisted across reload', 'Online shopping' in page.locator('.topbar__title').inner_text())
        version = page.evaluate("""() => new Promise(r => { const q = indexedDB.open('ekfba'); q.onsuccess = () => {
            const t = q.result.transaction('cards').objectStore('cards').getAll(); t.onsuccess = () => r(t.result.map(c => c.version)); }; })""")
        check('versions tracked', sorted(version) == [1, 2])

        page.goto(base + '#/cards'); page.wait_for_selector('.card-tile')
        check('cards list shows both', page.locator('.card-tile').count() == 2)
        page.screenshot(path=str(SHOTS / '04-cards.png'), full_page=True)
        page.goto(base + '#/home'); page.wait_for_selector('.stats')
        check('home counts', page.locator('.stat__n').nth(0).inner_text() == '1' and page.locator('.stat__n').nth(1).inner_text() == '1')
        page.screenshot(path=str(SHOTS / '05-home.png'), full_page=True)

        # Offline: wait for service worker control, then reload with network off
        page.evaluate("() => navigator.serviceWorker.ready")
        page.reload(); page.wait_for_selector('html[data-ready="1"]')
        controlled = page.evaluate("() => !!navigator.serviceWorker.controller")
        check('service worker controls page', controlled)
        ctx.set_offline(True)
        page.reload(); page.wait_for_selector('html[data-ready="1"]', timeout=10000)
        page.goto(base + '#/cards'); page.wait_for_selector('.card-tile')
        check('works offline: wallet loads', page.locator('.card-tile').count() == 2)
        check('offline banner shown', 'Offline' in page.locator('#net').inner_text())
        page.screenshot(path=str(SHOTS / '06-offline.png'), full_page=True)
        ctx.set_offline(False)

        # Encrypted export -> wipe -> import (Scenario 11)
        page.goto(base + '#/settings'); page.wait_for_selector('#export-form')
        page.fill('[name=pass]', PASS); page.fill('[name=pass2]', PASS)
        with page.expect_download() as dl:
            page.click('#export-form [type=submit]')
        path = dl.value.path(); text = Path(path).read_text()
        env = json.loads(text)
        check('backup is encrypted', env.get('format') == 'ekfba-encrypted' and 'Millennia' not in text)
        page.screenshot(path=str(SHOTS / '07-settings.png'), full_page=True)

        page.click('#wipe'); page.fill('#wipe-confirm', 'WIPE'); page.click('dialog button[value=ok]')
        page.wait_for_selector('.empty h2:has-text("Start with your wallet")')
        check('wipe cleared device', page.locator('.stat__n').nth(0).inner_text() == '0')

        page.goto(base + '#/settings'); page.wait_for_selector('#import-file')
        page.set_input_files('#import-file', path)
        page.wait_for_selector('#pass-form')
        page.fill('#pass-form [name=pass]', 'wrong passphrase!'); page.click('#pass-form button')
        page.wait_for_selector('#pass-form .banner--error')
        check('wrong passphrase rejected', 'Wrong passphrase' in page.locator('#pass-form .banner--error').inner_text())
        page.fill('#pass-form [name=pass]', PASS); page.click('#pass-form button')
        page.wait_for_selector('.banner--ok')
        check('preview shows 2 cards', '2' in page.locator('.banner--ok strong').first.inner_text())
        page.click('[data-mode=replace]'); page.click('dialog button[value=ok]')
        page.wait_for_selector('.card-tile')
        check('restore brings back both cards', page.locator('.card-tile').count() == 2)
        page.goto(card_url); page.wait_for_selector('.panel__title:has-text("Card details")')
        check('restored card intact', 'Online shopping ••4417' in page.locator('.topbar__title').inner_text())

        # Merge import is idempotent (no duplicates)
        page.goto(base + '#/settings'); page.set_input_files('#import-file', path)
        page.fill('#pass-form [name=pass]', PASS); page.click('#pass-form button'); page.wait_for_selector('.banner--ok')
        page.click('[data-mode=merge]'); page.wait_for_selector('.card-tile')
        check('merging same backup creates no duplicates', page.locator('.card-tile').count() == 2)

        # Archive
        page.goto(card_url); page.wait_for_selector('[data-status=archived]')
        page.click('[data-status=archived]'); page.click('dialog button[value=ok]')
        page.wait_for_selector('.chip:has-text("Archived")')
        page.goto(base + '#/cards'); page.wait_for_selector('.card-tile')
        check('archived card hidden from list', page.locator('.card-tile').count() == 1)
        page.goto(base + '#/cards?all=1'); page.wait_for_selector('.card-tile')
        check('archived card still kept', page.locator('.card-tile').count() == 2)

        # Every route renders
        for r in ['ask', 'log', 'milestones', 'history', 'offers', 'reminders', 'sources', 'settings', 'more']:
            page.goto(base + '#/' + r); page.wait_for_selector('.topbar__title')
        page.goto(base + '#/more'); page.wait_for_selector('.menu')
        page.screenshot(path=str(SHOTS / '08-more.png'), full_page=True)
        check('all 12 screens reachable', True)

        browser.close()
    httpd.shutdown()
    check('no console errors', not errors)
    for e in errors: print('  console:', e)
    failed = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)

if __name__ == '__main__':
    main()
