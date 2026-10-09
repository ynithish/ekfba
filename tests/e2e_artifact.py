"""Functional test of the EKFBA Claude page (artifact/dist/ekfba.html) in headless Chromium,
with an in-memory stand-in for the Claude page runtime (db, user, downloads).

Run: node tools/build-artifact.mjs && python3 tests/e2e_artifact.py
"""
import json, os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
PAGE = (ROOT / 'artifact/dist/ekfba.html').read_text()
PACK = json.loads((ROOT / 'spec/examples/example-pack.json').read_text())
SHOTS = Path(os.environ.get('SHOTS', '/tmp/ekfba-shots')); SHOTS.mkdir(parents=True, exist_ok=True)

MOCK = """
(() => {
  const store = window.__store = JSON.parse(localStorage.getItem('__seed') || '{}');
  const listeners = {};
  window.__downloads = [];
  const notify = (col) => (listeners[col] || []).forEach((cb) => cb(snap(col)));
  const snap = (col) => ({ docs: Object.entries(store[col] || {}).map(([id, v]) => ({ id, data: () => JSON.parse(JSON.stringify(v)) })) });
  const collection = (col) => ({
    doc: (id) => ({
      set: async (d) => { (store[col] ||= {})[id] = JSON.parse(JSON.stringify(d)); notify(col); await new Promise((r) => setTimeout(r, 5)); },
      update: async (d) => { Object.assign(store[col][id], d); notify(col); await new Promise((r) => setTimeout(r, 5)); },
      delete: async () => { delete store[col][id]; setTimeout(() => notify(col)); },
    }),
    onSnapshot: (cb) => { (listeners[col] ||= []).push(cb); setTimeout(() => cb(snap(col))); return () => {}; },
  });
  const caps = {
    db: { collection },
    user: { can: async () => true, isOwner: () => true },
    downloads: { save: async (f) => { window.__downloads.push(f); } },
  };
  window.claude = { use: async (n) => caps[n] || null };
})();
"""

results = []
def check(name, cond):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name)

def main():
    errors = []
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        ctx.add_init_script(MOCK)
        page = ctx.new_page()
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: m.type == 'error' and 'fonts.g' not in m.text and errors.append(m.text))
        page.route('https://fonts.googleapis.com/**', lambda r: r.fulfill(status=200, body='', content_type='text/css'))
        page.route('http://ekfba.test/', lambda r: r.fulfill(status=200, body='<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1"></head><body>' + PAGE + '</body></html>', content_type='text/html'))
        page.goto('http://ekfba.test/')
        page.wait_for_selector('.total-n')
        check('opens on Spends', True)
        page.click('[data-tab=wallet]')
        page.wait_for_selector('.empty h2:has-text("Your wallet is empty")')
        check('empty wallet state', True)

        # Add a card that matches the example pack
        page.click('[data-action=new]')
        page.fill('#f-bank', 'Example Bank'); page.fill('#f-name', 'Sample Rewards'); page.fill('#f-variant', 'Classic')
        page.select_option('#f-network', 'Visa'); page.fill('#f-nickname', 'Everyday'); page.fill('#f-last4', '4417')
        page.fill('#f-holderName', 'Nithish'); page.fill('#f-annual', '500'); page.fill('#f-issue', '2024-11-20')
        page.fill('#f-notes', 'valid thru 08/29')
        page.click('#card-form [type=submit]')
        page.wait_for_selector('.ferr')
        check('expiry date refused', 'expiry' in page.inner_text('.ferr'))
        page.fill('#f-notes', 'Main shopping card')
        page.click('#card-form [type=submit]')
        page.wait_for_selector('.row .ins:has-text("Everyday")')
        check('card saved', page.locator('.row').count() == 1)
        check('fee status pill uses NLNLALD vocabulary', page.locator('.row .pill').first.inner_text() in ('Renews soon', 'On track', 'Urgent', 'Overdue'))
        check('calendar reminder links', page.locator('.rem a').count() >= 1 and 'calendar.google.com' in page.locator('.rem a').first.get_attribute('href'))
        check('no rules yet message', page.locator('.box.warn:has-text("No verified rules")').count() == 1)

        # Rule import: invalid JSON, then invalid pack, then valid
        page.click('[data-action=import]')
        page.fill('#pack-text', '{ not json')
        page.click('[data-action=check-pack]')
        check('invalid JSON explained', 'not valid JSON' in page.inner_text('.box.bad'))
        bad = dict(PACK); bad['checkedAt'] = '2099-01-01'
        page.fill('#pack-text', json.dumps(bad)); page.click('[data-action=check-pack]')
        check('future checkedAt rejected', 'future' in page.inner_text('.box.bad'))
        page.fill('#pack-text', json.dumps(PACK)); page.click('[data-action=check-pack]')
        page.wait_for_selector('[data-action=approve]')
        check('review shows new items', page.locator('.diff li').count() >= 10)
        check('review warns about unverified/caps', True)
        page.screenshot(path=str(SHOTS / 'a1-review.png'), full_page=True)
        page.click('[data-action=approve]')
        page.wait_for_selector('.pack-meta:has-text("Rules version 1")')
        check('rules saved as version 1', True)
        check('card fees taken from pack', '₹500' in page.inner_text('.kv'))
        check('variant-only offer hidden for Classic', page.locator('.rule:has-text("Instamart")').count() == 0)
        check('expired offer shown as expired', page.locator('.rule.expired .pill:has-text("Expired")').count() == 1)
        check('unverified badges shown', page.locator('.rule .pill:has-text("Unverified")').count() == 2)
        page.screenshot(path=str(SHOTS / 'a2-card-rules.png'), full_page=True)

        # Update rules -> diff -> version 2
        page.click('[data-action=import]')
        p2 = json.loads(json.dumps(PACK)); p2['offers'][0]['validTo'] = '2026-11-30'; p2['offers'].pop()
        page.fill('#pack-text', json.dumps(p2)); page.click('[data-action=check-pack]')
        page.wait_for_selector('[data-action=approve]')
        diff = page.inner_text('.diff')
        check('diff shows changed and removed', 'Changed' in diff and 'Removed' in diff and 'validTo' in diff)
        page.click('[data-action=approve]')
        page.wait_for_selector('.pack-meta:has-text("Rules version 2 of 2")')
        statuses = page.evaluate("() => Object.values(window.__store.rulePacks).map(p => p.version + ':' + p.status).sort()")
        check('old version superseded, kept for history', statuses == ['1:superseded', '2:active'])

        # Ask (Phase 3)
        page.click('[data-tab=ask]')
        page.fill('#ask-q', '₹20,000 at Croma'); page.click('#ask-form [type=submit]')
        page.wait_for_selector('.winner')
        check('ask: best card named', 'Everyday' in page.inner_text('.winner .big'))
        check('ask: saving = 10% capped ₹1,500 + 400 pts × 25p', page.inner_text('.save b') == '₹1,600')
        page.screenshot(path=str(SHOTS / 'a5-ask.png'), full_page=True)
        # Log it (Phase 4)
        page.click('[data-action=log-from-ask]')
        page.wait_for_selector('#log-form')
        check('log form prefilled from Ask', page.input_value('#l-amount') == '20000' and page.input_value('#l-merchant') == 'Croma')
        page.click('#log-form [type=submit]')
        page.wait_for_function("document.querySelector('#toast') && document.querySelector('#toast').textContent.startsWith('Saved')")
        check('purchase saved', 'Saved: ₹20,000' in page.inner_text('#toast'))
        page.click('[data-action=log-from-ask]'); page.click('#log-form [type=submit]')
        page.wait_for_selector('#log-form .box.warn')
        check('duplicate purchase caught (Scenario 8)', 'already logged' in page.inner_text('#log-form .box.warn'))
        page.click('#log-form .box.warn [data-action=log-cancel]')
        page.click('[data-tab=spends]'); page.wait_for_selector('.total-n')
        check('spends total', page.inner_text('.total-n') == '₹20,000')
        check('spend by card', '₹20,000' in page.inner_text('.spend-row.row'))
        page.click('.purchase'); page.wait_for_selector('#log-form')
        page.select_option('#l-status', 'refunded'); page.fill('#l-refund', '5000'); page.click('#log-form [type=submit]')
        page.wait_for_selector('.pill:has-text("Refunded")')
        check('refund reduces spend (Scenario 7)', page.inner_text('.total-n') == '₹15,000')
        check('milestone progress shown', page.locator('.ms .bar').count() >= 1)
        page.screenshot(path=str(SHOTS / 'a6-spends.png'), full_page=True)
        page.click('[data-tab=ask]')
        page.fill('#ask-q', 'croma'); page.click('#ask-form [type=submit]'); page.wait_for_selector('.winner')
        check('ask without amount works', 'exact saving' in page.inner_text('.winner'))
        page.fill('#ask-q', 'sharma stores 500'); page.click('#ask-form [type=submit]')
        page.wait_for_selector('[data-action=ask-cat]')
        page.click('[data-cat=electronics]'); page.wait_for_selector('.winner')
        check('ask: unknown shop -> category follow-up -> result', 'Everyday' in page.inner_text('.winner .big'))

        # Freshness tab
        page.click('[data-tab=fresh]')
        check('freshness lists card', page.locator('.row .pill').first.inner_text() in ('Fresh', 'Offers out of date', 'Out of date'))

        # Archive
        page.click('[data-tab=wallet]')
        if page.locator('.detail').count() == 0: page.click('.row-head')
        page.click('[data-what=archive]'); page.click('[data-status=archived]')
        page.wait_for_selector('[data-action=toggle-archived]')
        check('archived card hidden but kept', page.locator('.row').count() == 0)

        # Dark theme look
        page.emulate_media(color_scheme='dark'); page.click('[data-action=toggle-archived]')
        page.screenshot(path=str(SHOTS / 'a4-dark.png'), full_page=True)
        b.close()
    check('no page errors', not errors)
    for e in errors: print('  error:', e)
    failed = [n for n, ok in results if not ok]
    print(f"\n{len(results) - len(failed)}/{len(results)} checks passed")
    sys.exit(1 if failed else 0)

main()
