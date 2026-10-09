import { html, icon } from '../html.js';
import { exportBackup, previewBackup, applyBackup, wipeDevice, getSetting, counts, APP_VERSION } from '../../data/repo.js';
import { requestPersistentStorage } from '../../data/db.js';
import { checkPassphrase } from '../../core/crypto.js';
import { todayLocal } from '../../core/ids.js';
import { toast, confirmDialog, downloadText, readFileText, relativeTime } from '../ui-kit.js';
import { go } from '../router.js';

export async function settings() {
  const lastBackupAt = await getSetting('lastBackupAt');
  const c = await counts();
  const storage = navigator.storage?.persisted ? await navigator.storage.persisted() : null;
  const est = navigator.storage?.estimate ? await navigator.storage.estimate() : null;

  return {
    title: 'Settings',
    body: html`
    <section class="panel">
      <h2 class="panel__title">${icon('download')} Back up your data</h2>
      <p>Last backup: <strong>${relativeTime(lastBackupAt)}</strong>. Your data lives only on this device until cloud sync arrives (Phase 6) — keep a recent backup.</p>
      <form id="export-form" class="form" novalidate>
        <label class="field"><span>Backup passphrase</span>
          <input type="password" name="pass" autocomplete="new-password" placeholder="At least 10 characters"></label>
        <label class="field"><span>Repeat passphrase</span>
          <input type="password" name="pass2" autocomplete="new-password"></label>
        <p class="hint">${icon('shield')} The backup is encrypted on this phone. Without the passphrase nobody — including you — can open it. Store the passphrase somewhere safe.</p>
        <div class="form__actions">
          <button class="btn btn--primary" type="submit">Download encrypted backup</button>
        </div>
        <details class="sub-details"><summary>Unencrypted export (readable JSON)</summary>
          <p class="hint">Anyone who gets this file can read your cards and purchases. Use only for inspection.</p>
          <button class="btn btn--ghost" type="button" id="export-plain">Download unencrypted JSON</button>
        </details>
      </form>
    </section>

    <section class="panel">
      <h2 class="panel__title">${icon('upload')} Restore or import</h2>
      <p>Import an EKFBA backup file (encrypted or plain). You'll see what it contains before anything changes.</p>
      <input type="file" id="import-file" accept=".json,application/json" class="file-input">
      <div id="import-step"></div>
    </section>

    <section class="panel">
      <h2 class="panel__title">${icon('device')} This device</h2>
      <dl>
        <div class="kv"><dt>App version</dt><dd>${APP_VERSION}</dd></div>
        <div class="kv"><dt>Cards stored</dt><dd>${c.totalCards}</dd></div>
        <div class="kv"><dt>Changes waiting for sync</dt><dd>${c.pendingSync} <em class="muted">(sync arrives in Phase 6)</em></dd></div>
        <div class="kv"><dt>Protected from browser clean-up</dt><dd>${storage === null ? 'Not supported' : storage ? 'Yes' : 'No'}</dd></div>
        ${est ? html`<div class="kv"><dt>Storage used</dt><dd>${(est.usage / 1024).toFixed(0)} KB</dd></div>` : ''}
      </dl>
      ${storage === false ? html`<button class="btn" id="persist">Protect my data on this device</button>
        <p class="hint">Installing the app to your home screen also helps the browser keep your data.</p>` : ''}
    </section>

    <section class="panel panel--danger">
      <h2 class="panel__title">${icon('alert')} Wipe this device</h2>
      <p>Deletes every card, purchase and setting stored in this browser. Use this before giving away or sharing the device. Make a backup first.</p>
      <button class="btn btn--danger" id="wipe">Wipe all data on this device</button>
    </section>

    <section class="panel">
      <h2 class="panel__title">${icon('shield')} Privacy</h2>
      <ul class="plain">
        <li>No full card numbers, CVVs, PINs, OTPs or passwords are ever stored.</li>
        <li>No analytics, trackers or third-party scripts.</li>
        <li>The app never connects to your bank or makes payments.</li>
        <li>Anyone who can unlock this phone and open the app can see your wallet. An app lock comes in Phase 6.</li>
      </ul>
    </section>`,
    after: bind,
  };
}

function bind(el) {
  const form = el.querySelector('#export-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const { pass, pass2 } = Object.fromEntries(new FormData(form));
    const problem = checkPassphrase(pass);
    if (problem) return toast(problem);
    if (pass !== pass2) return toast('The two passphrases do not match.');
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true; btn.textContent = 'Encrypting…';
    try {
      const env = await exportBackup({ passphrase: pass });
      downloadText(`ekfba-backup-${todayLocal()}.json`, JSON.stringify(env));
      form.reset();
      toast('Encrypted backup downloaded');
    } catch (err) { toast(`Backup failed: ${err.message}`); }
    btn.disabled = false; btn.textContent = 'Download encrypted backup';
  });

  el.querySelector('#export-plain').addEventListener('click', async () => {
    if (!(await confirmDialog('This file will not be encrypted. Anyone with it can read your wallet. Continue?', 'Download'))) return;
    const data = await exportBackup();
    downloadText(`ekfba-export-${todayLocal()}.json`, JSON.stringify(data, null, 2));
  });

  el.querySelector('#persist')?.addEventListener('click', async () => {
    const r = await requestPersistentStorage();
    toast(r.persisted ? 'Data protected on this device' : 'The browser declined. Install the app to your home screen and try again.');
    go(`/settings?t=${Date.now()}`);
  });

  el.querySelector('#wipe').addEventListener('click', async () => {
    const typed = await confirmDialog(html`This permanently deletes everything on this device. Type <strong>WIPE</strong> to confirm.
      <input id="wipe-confirm" class="select-block" autocomplete="off">`, 'Wipe device', () => document.getElementById('wipe-confirm').value.trim());
    if (typed !== 'WIPE') { if (typed !== false) toast('Not wiped — you must type WIPE.'); return; }
    await wipeDevice();
    toast('All data on this device was deleted');
    go(`/home?t=${Date.now()}`);
  });

  const fileInput = el.querySelector('#import-file');
  const step = el.querySelector('#import-step');
  let text = null;

  async function preview(passphrase = null) {
    const p = await previewBackup(text, passphrase);
    if (p.needsPassphrase) {
      step.innerHTML = String(html`
        <form id="pass-form" class="form" novalidate>
          ${p.errors.length ? html`<div class="banner banner--error">${p.errors[0]}</div>` : ''}
          <label class="field"><span>This backup is encrypted. Enter its passphrase</span>
            <input type="password" name="pass" autocomplete="current-password" required></label>
          <div class="form__actions"><button class="btn btn--primary">Unlock</button></div>
        </form>`);
      step.querySelector('#pass-form').addEventListener('submit', (e) => {
        e.preventDefault();
        preview(new FormData(e.target).get('pass'));
      });
      return;
    }
    if (!p.ok) {
      step.innerHTML = String(html`<div class="banner banner--error"><strong>This file can't be imported.</strong><ul>${(p.errors || []).slice(0, 8).map((x) => html`<li>${x}</li>`)}</ul></div>`);
      return;
    }
    const s = p.summary;
    step.innerHTML = String(html`
      <div class="banner banner--ok">Backup looks good: <strong>${s.cards}</strong> cards, <strong>${s.transactionEvents}</strong> purchase records, <strong>${s.offers}</strong> offers, <strong>${s.milestones}</strong> milestones.</div>
      <div class="actions">
        <button class="btn btn--primary" data-mode="merge">Merge into this device</button>
        <button class="btn btn--danger" data-mode="replace">Replace everything on this device</button>
      </div>
      <p class="hint">Merge keeps whichever copy of each record is newer. Replace makes this device an exact copy of the backup.</p>`);
    step.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', async () => {
      const mode = b.dataset.mode;
      if (mode === 'replace' && !(await confirmDialog('Replace all data on this device with the backup? Anything not in the backup will be lost.', 'Replace'))) return;
      try {
        const stats = await applyBackup(p.stores, mode);
        const added = Object.values(stats).reduce((a, x) => a + x.added, 0);
        const updated = Object.values(stats).reduce((a, x) => a + x.updated, 0);
        toast(mode === 'replace' ? 'Device restored from backup' : `Imported: ${added} added, ${updated} updated`);
        go(`/cards?t=${Date.now()}`);
      } catch (err) { toast(`Import failed, nothing was changed: ${err.message}`); }
    }));
  }

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;
    try { text = await readFileText(file); } catch (err) { toast(err.message); return; }
    preview();
  });
}
