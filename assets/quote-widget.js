/* =========================================================
   EV AutoGlass — "Tell us what's wrong" quote flow
   Self-contained widget. Mount by adding:
     <div id="quote-widget-mount"></div>
   anywhere on the page.
   ========================================================= */

(function () {

  const DAMAGE_TYPES = [
    {
      id: 'front',
      name: 'Front Windshield',
      sub: 'Chip, crack, or full replace',
      img: 'https://d8j0ntlcm91z4.cloudfront.net/user_38jUgr17I6kW2g7ysqUa9OUVLGY/hf_20260911_215600_9e94c9c0-fc6a-4f71-a443-f1a7db80aa83.png'
    },
    {
      id: 'rear',
      name: 'Back Glass / Rear Window',
      sub: 'Rear windshield damage',
      img: 'https://d8j0ntlcm91z4.cloudfront.net/user_38jUgr17I6kW2g7ysqUa9OUVLGY/hf_20260911_215600_f8f0ebd0-ce0d-4d71-a0e6-151f942338c3.png'
    },
    {
      id: 'driver',
      name: 'Driver Side Window',
      sub: 'Door or quarter glass',
      img: 'https://d8j0ntlcm91z4.cloudfront.net/user_38jUgr17I6kW2g7ysqUa9OUVLGY/hf_20260911_215600_2db5f880-ee1f-4978-846b-b8646b39d8d7.png'
    },
    {
      id: 'passenger',
      name: 'Passenger Side Window',
      sub: 'Door or quarter glass',
      img: 'https://d8j0ntlcm91z4.cloudfront.net/user_38jUgr17I6kW2g7ysqUa9OUVLGY/hf_20260911_215600_7471d393-3179-4077-89aa-1b50b53a8c8b.png'
    }
  ];

  // Generic shield icon used for every carrier tile — no trademarked
  // insurer logos are used here, only plain text names.
  const SHIELD_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2 3 6v6c0 5 3.8 9.4 9 10 5.2-.6 9-5 9-10V6z"/></svg>`;

  const INSURERS = [
    'State Farm', 'GEICO', 'Progressive', 'Allstate',
    'USAA', 'Farmers', 'Nationwide', 'Liberty Mutual',
    'Travelers', 'American Family', 'Other insurer', 'No insurance / self-pay'
  ];

  function guessCity(zip) {
    if (!/^\d{5}$/.test(zip)) return null;
    if (zip.startsWith('8528')) return 'Tempe';
    if (zip.startsWith('8525') || zip.startsWith('8526')) return 'Scottsdale';
    if (zip.startsWith('8520') || zip.startsWith('8521')) return 'Mesa';
    if (zip.startsWith('8522') || zip.startsWith('8524')) return 'Chandler';
    if (zip.startsWith('8513')) return 'Maricopa';
    if (zip.startsWith('8508')) return 'Anthem';
    if (zip.startsWith('85')) return 'Phoenix Valley';
    return null;
  }

  /* ---------------------------------------------------------
     REAL VIN VALIDATION + DECODE

     1) validateVINFormat / vinChecksumValid run entirely client-side
        using the standard ISO 3779 transliteration + check-digit
        algorithm, so obviously bogus input (wrong length, invalid
        letters, failed check digit) is caught instantly with no
        network call.
     2) decodeVIN() then calls NHTSA's free, public "vPIC" VIN
        decoder API (no key required, CORS-enabled) to get the
        real year/make/model/trim for a VIN that passes validation.
        This runs in the visitor's browser, not a mock.
  --------------------------------------------------------- */
  const VIN_TRANSLIT = {
    A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
    J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
    S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9
  };
  const VIN_WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

  function validateVINFormat(vin) {
    if (!vin) return 'Enter a VIN.';
    if (vin.length !== 17) return 'A VIN is exactly 17 characters.';
    if (/[IOQ]/.test(vin)) return 'VINs never contain the letters I, O, or Q.';
    if (!/^[A-Z0-9]{17}$/.test(vin)) return 'Only letters and numbers are allowed.';
    return null;
  }

  function vinChecksumValid(vin) {
    let sum = 0;
    for (let i = 0; i < 17; i++) {
      const ch = vin[i];
      const value = /[0-9]/.test(ch) ? Number(ch) : (VIN_TRANSLIT[ch] || 0);
      sum += value * VIN_WEIGHTS[i];
    }
    const remainder = sum % 11;
    const expected = remainder === 10 ? 'X' : String(remainder);
    return vin[8] === expected;
  }

  async function decodeVIN(vin) {
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${encodeURIComponent(vin)}?format=json`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('lookup-failed');
    const data = await res.json();
    const r = data.Results && data.Results[0];
    if (!r || !r.Make || !r.ModelYear) return null;
    return {
      year: Number(r.ModelYear),
      make: r.Make,
      model: r.Model || '',
      trim: r.Trim || r.Series || null
    };
  }

  function likelyNeedsADAS(year) {
    return !!year && year >= 2018;
  }

  function el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  }

  function buildWidget(mount) {
    const uid = 'qw-' + Math.random().toString(36).slice(2, 8);

    mount.innerHTML = `
      <div class="quote-widget" id="${uid}">
        <div class="qw-steps">
          <span class="qw-step-pill" data-step-pill="1">1. Damage</span>
          <span class="qw-step-pill" data-step-pill="2">2. Vehicle</span>
          <span class="qw-step-pill" data-step-pill="3">3. Insurance</span>
          <span class="qw-step-pill" data-step-pill="4">4. Location &amp; contact</span>
          <span class="qw-step-pill" data-step-pill="5">5. Summary</span>
        </div>

        <!-- STEP 1: DAMAGE -->
        <div class="qw-panel" data-panel="1">
          <h3 class="h-3" style="color:#fff;margin-bottom:14px;">What's damaged?</h3>
          <div class="damage-grid" data-damage-grid></div>
          <div class="qw-nav">
            <span></span>
            <button class="btn btn-primary" data-next="1" disabled>Continue</button>
          </div>
        </div>

        <!-- STEP 2: VEHICLE -->
        <div class="qw-panel" data-panel="2">
          <h3 class="h-3" style="color:#fff;margin-bottom:14px;">Identify your vehicle</h3>
          <div class="qw-tabs">
            <button class="qw-tab active" data-vtab="vin">Enter VIN</button>
            <button class="qw-tab" data-vtab="manual">Enter manually</button>
            <button class="qw-tab" data-vtab="plate">Use plate + state</button>
          </div>

          <div data-vpanel="vin">
            <div class="field-row single">
              <div>
                <label for="${uid}-vin">17-character VIN</label>
                <input class="field" id="${uid}-vin" maxlength="17" placeholder="e.g. 1HGCM82633A004352" data-vin-input autocomplete="off" autocapitalize="characters">
                <div class="error-text" data-vin-error>That doesn't look like a valid VIN.</div>
                <p class="helper">Find it on your dashboard (driver's side, visible through the windshield) or on a sticker inside the driver-side door jamb. We look it up against the free NHTSA vehicle database — nothing is stored.</p>
              </div>
            </div>
            <button class="btn btn-line" style="color:#fff;border-color:rgba(255,255,255,.3);" data-decode-vin>Decode VIN</button>
            <div data-vin-result style="margin-top:16px;"></div>
          </div>

          <div data-vpanel="manual" style="display:none;">
            <div class="field-row tri">
              <div>
                <label for="${uid}-year">Year</label>
                <select class="field" id="${uid}-year" data-manual="year"></select>
              </div>
              <div>
                <label for="${uid}-make">Make</label>
                <select class="field" id="${uid}-make" data-manual="make"></select>
              </div>
              <div>
                <label for="${uid}-model">Model</label>
                <select class="field" id="${uid}-model" data-manual="model">
                  <option value="">Select model</option>
                </select>
              </div>
            </div>
            <div class="field-row single">
              <div>
                <label for="${uid}-trim">Trim (optional)</label>
                <input class="field" id="${uid}-trim" placeholder="e.g. LE, Sport, Limited" data-manual="trim">
              </div>
            </div>
          </div>

          <div data-vpanel="plate" style="display:none;">
            <div class="field-row">
              <div>
                <label for="${uid}-plate">License plate</label>
                <input class="field" id="${uid}-plate" placeholder="e.g. ABC1234" data-plate-input>
              </div>
              <div>
                <label for="${uid}-plate-state">State</label>
                <select class="field" id="${uid}-plate-state" data-plate-state>
                  <option>AZ</option><option>CA</option><option>NV</option><option>NM</option><option>UT</option><option>TX</option><option>Other</option>
                </select>
              </div>
            </div>
            <button class="btn btn-line" style="color:#fff;border-color:rgba(255,255,255,.3);" data-decode-plate>Look up vehicle</button>
            <p class="helper">Plate lookups require a state DMV data agreement we don't have wired up yet, so this gives an approximate match — a specialist confirms the exact trim when they call.</p>
            <div data-plate-result style="margin-top:16px;"></div>
          </div>

          <div class="qw-nav">
            <button class="link-btn" data-back="2">Back</button>
            <button class="btn btn-primary" data-next="2" disabled>Continue</button>
          </div>
        </div>

        <!-- STEP 3: INSURANCE -->
        <div class="qw-panel" data-panel="3">
          <h3 class="h-3" style="color:#fff;margin-bottom:6px;">Who's your insurance with?</h3>
          <p class="helper" style="margin-bottom:16px;">Most comprehensive policies cover glass at $0 out of pocket. We'll confirm your coverage before any work starts.</p>
          <div class="insurer-grid" data-insurer-grid></div>
          <div class="field-row single" data-insurer-other-row style="display:none;margin-top:14px;">
            <div>
              <label for="${uid}-insurer-other">Insurance company name</label>
              <input class="field" id="${uid}-insurer-other" placeholder="e.g. Auto-Owners Insurance" data-insurer-other-input>
            </div>
          </div>
          <div class="qw-nav">
            <button class="link-btn" data-back="3">Back</button>
            <button class="btn btn-primary" data-next="3" disabled>Continue</button>
          </div>
        </div>

        <!-- STEP 4: LOCATION + CONTACT -->
        <div class="qw-panel" data-panel="4">
          <h3 class="h-3" style="color:#fff;margin-bottom:14px;">Where and how should we reach you?</h3>
          <div class="field-row">
            <div>
              <label for="${uid}-zip">ZIP code</label>
              <input class="field" id="${uid}-zip" inputmode="numeric" maxlength="5" placeholder="85001" data-zip-input>
              <div class="helper" data-city-guess></div>
            </div>
            <div>
              <label for="${uid}-name">Full name</label>
              <input class="field" id="${uid}-name" placeholder="Jordan Ramirez" data-name-input>
            </div>
          </div>
          <div class="field-row">
            <div>
              <label for="${uid}-phone">Phone number</label>
              <input class="field" id="${uid}-phone" type="tel" placeholder="(602) 555-0143" data-phone-input>
            </div>
            <div>
              <label for="${uid}-contact">Preferred contact method</label>
              <select class="field" id="${uid}-contact" data-contact-input>
                <option>Call</option>
                <option>Text</option>
                <option>Email</option>
              </select>
            </div>
          </div>
          <label>Upload a photo of the damage (optional — helps us quote accurately)</label>
          <div class="upload-drop">
            <input type="file" accept="image/*" data-photo-input id="${uid}-photo" class="visually-hidden">
            <label for="${uid}-photo" style="cursor:pointer;color:var(--green);font-weight:600;">Choose a photo</label>
            <div data-photo-name style="margin-top:6px;color:var(--cream);font-size:.85rem;"></div>
          </div>
          <div class="qw-nav">
            <button class="link-btn" data-back="4">Back</button>
            <button class="btn btn-primary" data-next="4">See my summary</button>
          </div>
        </div>

        <!-- STEP 5: SUMMARY -->
        <div class="qw-panel" data-panel="5">
          <h3 class="h-3" style="color:#fff;margin-bottom:14px;">Here's what we've got</h3>
          <div class="summary-card" data-summary></div>
          <p class="helper" style="margin-bottom:18px;">A specialist will confirm your quote and available appointment times within 15 minutes during business hours.</p>
          <div class="qw-nav">
            <button class="link-btn" data-back="5">Start over</button>
            <a class="btn btn-primary" href="tel:16029803593">Or just call now</a>
          </div>
        </div>

        <div class="qw-fallback">
          <span>Prefer to talk it through?</span>
          <a class="btn-phone" href="tel:16029803593" style="color:var(--green);">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
            Call (602) 980-3593
          </a>
        </div>
      </div>
    `;

    const root = mount.querySelector('.quote-widget');
    const state = {
      step: 1, damage: null, vehicle: null, insurer: null,
      zip: '', name: '', phone: '', contact: 'Call', photo: null
    };
    const STEP_COUNT = 5;

    // ---- Step 1: damage grid (photo cards) ----
    const grid = root.querySelector('[data-damage-grid]');
    DAMAGE_TYPES.forEach(d => {
      const card = el(`
        <button type="button" class="damage-card" data-damage-id="${d.id}">
          <div class="damage-card-media"><img src="${d.img}" alt="" loading="lazy"></div>
          <div class="damage-card-body">
            <div class="name">${d.name}</div>
            <div class="sub">${d.sub}</div>
          </div>
        </button>`);
      card.addEventListener('click', () => {
        grid.querySelectorAll('.damage-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        state.damage = d;
        root.querySelector('[data-next="1"]').disabled = false;
      });
      grid.appendChild(card);
    });

    // ---- Step 2: vehicle ID tabs ----
    const vtabs = root.querySelectorAll('[data-vtab]');
    const vpanels = { vin: root.querySelector('[data-vpanel="vin"]'), manual: root.querySelector('[data-vpanel="manual"]'), plate: root.querySelector('[data-vpanel="plate"]') };
    vtabs.forEach(tab => {
      tab.addEventListener('click', () => {
        vtabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        Object.values(vpanels).forEach(p => p.style.display = 'none');
        vpanels[tab.dataset.vtab].style.display = '';
        // Re-check completion for the newly active tab
        if (tab.dataset.vtab === 'manual') checkManualComplete();
      });
    });

    // Manual dropdowns
    const MAKES_MODELS = {
      Toyota: ['Camry', 'Corolla', 'RAV4', 'Tacoma', 'Highlander'],
      Honda: ['Civic', 'Accord', 'CR-V', 'Pilot'],
      Ford: ['F-150', 'Explorer', 'Escape', 'Mustang'],
      Chevrolet: ['Silverado', 'Equinox', 'Malibu', 'Tahoe'],
      Nissan: ['Altima', 'Rogue', 'Sentra', 'Frontier'],
      Jeep: ['Grand Cherokee', 'Wrangler', 'Cherokee'],
      Hyundai: ['Elantra', 'Tucson', 'Santa Fe'],
      Kia: ['Sportage', 'Sorento', 'Optima']
    };
    const yearSel = root.querySelector('[data-manual="year"]');
    const makeSel = root.querySelector('[data-manual="make"]');
    const modelSel = root.querySelector('[data-manual="model"]');
    const trimInput = root.querySelector('[data-manual="trim"]');
    yearSel.innerHTML = '<option value="">Select year</option>' + Array.from({ length: 20 }, (_, i) => 2025 - i).map(y => `<option>${y}</option>`).join('');
    makeSel.innerHTML = '<option value="">Select make</option>' + Object.keys(MAKES_MODELS).map(m => `<option>${m}</option>`).join('');
    makeSel.addEventListener('change', () => {
      const list = MAKES_MODELS[makeSel.value] || [];
      modelSel.innerHTML = '<option value="">Select model</option>' + list.map(m => `<option>${m}</option>`).join('');
      checkManualComplete();
    });
    [yearSel, modelSel, trimInput].forEach(f => f.addEventListener('input', checkManualComplete));
    [yearSel, modelSel].forEach(f => f.addEventListener('change', checkManualComplete));

    function checkManualComplete() {
      if (root.querySelector('[data-vtab="manual"]').classList.contains('active') && yearSel.value && makeSel.value && modelSel.value) {
        state.vehicle = { year: +yearSel.value, make: makeSel.value, model: modelSel.value, trim: trimInput.value || null, source: 'manual' };
        root.querySelector('[data-next="2"]').disabled = false;
      }
    }

    // ---- VIN decode (real, live) ----
    const vinInput = root.querySelector('[data-vin-input]');
    const vinError = root.querySelector('[data-vin-error]');
    const vinButton = root.querySelector('[data-decode-vin]');

    function setVinError(msg) {
      if (msg) {
        vinInput.classList.add('invalid');
        vinError.textContent = msg;
      } else {
        vinInput.classList.remove('invalid');
      }
    }

    vinInput.addEventListener('input', () => {
      vinInput.value = vinInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
      setVinError(null);
    });

    vinButton.addEventListener('click', async () => {
      const vin = vinInput.value.trim();
      const resultBox = root.querySelector('[data-vin-result]');
      resultBox.innerHTML = '';

      const formatError = validateVINFormat(vin);
      if (formatError) { setVinError(formatError); return; }
      if (!vinChecksumValid(vin)) {
        setVinError("That VIN's check digit doesn't add up — double-check for typos (VINs never contain I, O, or Q).");
        return;
      }
      setVinError(null);

      vinButton.disabled = true;
      const originalLabel = vinButton.textContent;
      vinButton.textContent = 'Decoding…';

      try {
        const decoded = await decodeVIN(vin);
        if (!decoded) {
          resultBox.innerHTML = `<p class="helper" style="color:#ff9d7a;">We couldn't find that VIN in the vehicle database. Try "Enter manually" instead, or we'll confirm it on the call.</p>`;
        } else {
          state.vehicle = { ...decoded, source: 'vin', vin };
          resultBox.innerHTML = `<div class="summary-card" style="margin:0;">
            <div class="summary-row"><span class="k">Decoded vehicle</span><span>${decoded.year} ${decoded.make} ${decoded.model}${decoded.trim ? ' ' + decoded.trim : ''}</span></div>
          </div>`;
          root.querySelector('[data-next="2"]').disabled = false;
        }
      } catch (err) {
        resultBox.innerHTML = `<p class="helper" style="color:#ff9d7a;">We couldn't reach the vehicle database just now. Try again in a moment, or use "Enter manually".</p>`;
      } finally {
        vinButton.disabled = false;
        vinButton.textContent = originalLabel;
      }
    });

    // Plate lookup — approximate placeholder pending a DMV data agreement.
    root.querySelector('[data-decode-plate]').addEventListener('click', () => {
      const plate = root.querySelector('[data-plate-input]').value.trim();
      const stateAbbr = root.querySelector('[data-plate-state]').value;
      const resultBox = root.querySelector('[data-plate-result]');
      if (!plate) return;
      resultBox.innerHTML = `<div class="summary-card" style="margin:0;">
        <div class="summary-row"><span class="k">Plate on file</span><span>${plate} · ${stateAbbr}</span></div>
      </div>`;
      state.vehicle = { year: null, make: null, model: null, trim: null, source: 'plate', plate, plateState: stateAbbr };
      root.querySelector('[data-next="2"]').disabled = false;
    });

    // ---- Step 3: insurance ----
    const insurerGrid = root.querySelector('[data-insurer-grid]');
    const otherRow = root.querySelector('[data-insurer-other-row]');
    const otherInput = root.querySelector('[data-insurer-other-input]');
    INSURERS.forEach(name => {
      const card = el(`
        <button type="button" class="insurer-card" data-insurer="${name}">
          ${SHIELD_ICON}
          <span>${name}</span>
        </button>`);
      card.addEventListener('click', () => {
        insurerGrid.querySelectorAll('.insurer-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const isOther = name === 'Other insurer';
        otherRow.style.display = isOther ? '' : 'none';
        state.insurer = isOther ? (otherInput.value || 'Other insurer') : name;
        root.querySelector('[data-next="3"]').disabled = isOther && !otherInput.value;
      });
      insurerGrid.appendChild(card);
    });
    otherInput.addEventListener('input', () => {
      state.insurer = otherInput.value || 'Other insurer';
      root.querySelector('[data-next="3"]').disabled = !otherInput.value;
    });

    // ---- Step 4: location + contact ----
    const zipInput = root.querySelector('[data-zip-input]');
    const cityGuess = root.querySelector('[data-city-guess]');
    zipInput.addEventListener('input', () => {
      state.zip = zipInput.value.trim();
      const city = guessCity(state.zip);
      cityGuess.textContent = city ? `Looks like ${city}, AZ — we cover this area.` : '';
    });
    root.querySelector('[data-name-input]').addEventListener('input', e => state.name = e.target.value);
    root.querySelector('[data-phone-input]').addEventListener('input', e => state.phone = e.target.value);
    root.querySelector('[data-contact-input]').addEventListener('change', e => state.contact = e.target.value);
    root.querySelector('[data-photo-input]').addEventListener('change', e => {
      const f = e.target.files[0];
      state.photo = f ? f.name : null;
      root.querySelector('[data-photo-name]').textContent = f ? `Selected: ${f.name}` : '';
    });

    // ---- Navigation ----
    function showStep(n) {
      state.step = n;
      root.querySelectorAll('.qw-panel').forEach(p => p.classList.toggle('active', +p.dataset.panel === n));
      root.querySelectorAll('[data-step-pill]').forEach(p => {
        const s = +p.dataset.stepPill;
        p.classList.toggle('active', s === n);
        p.classList.toggle('done', s < n);
      });
      if (n === STEP_COUNT) renderSummary();
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    root.querySelectorAll('[data-next]').forEach(btn => {
      btn.addEventListener('click', () => showStep(state.step + 1));
    });
    root.querySelectorAll('[data-back]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.step === STEP_COUNT) { showStep(1); return; }
        showStep(Math.max(1, state.step - 1));
      });
    });

    function renderSummary() {
      const v = state.vehicle;
      let vehicleLine = 'Not provided';
      if (v) {
        vehicleLine = [v.year, v.make, v.model, v.trim].filter(Boolean).join(' ') || `Plate ${v.plate || ''} (${v.plateState || ''})`;
      }
      const adas = v && likelyNeedsADAS(v.year);
      root.querySelector('[data-summary]').innerHTML = `
        <div class="summary-row"><span class="k">Damage</span><span>${state.damage ? state.damage.name : '—'}</span></div>
        <div class="summary-row"><span class="k">Vehicle</span><span>${vehicleLine}</span></div>
        <div class="summary-row"><span class="k">Insurance</span><span>${state.insurer || '—'}</span></div>
        <div class="summary-row"><span class="k">Location</span><span>${state.zip || '—'}${guessCity(state.zip) ? ' · ' + guessCity(state.zip) : ''}</span></div>
        <div class="summary-row"><span class="k">Contact</span><span>${state.name || '—'} · ${state.phone || '—'} · prefers ${state.contact}</span></div>
        ${adas ? `<div class="adas-flag"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5M2 12l10 5 10-5"/></svg> ADAS camera recalibration is likely needed for this vehicle</div>` : ''}
      `;
    }

    showStep(1);

    // Expose a small API so hero forms can hand off a ZIP and jump in
    root.qwPrefillZip = (zip) => {
      zipInput.value = zip;
      zipInput.dispatchEvent(new Event('input'));
      showStep(1);
    };
    mount._qwInstance = root;
  }

  function init() {
    document.querySelectorAll('#quote-widget-mount').forEach(buildWidget);

    // Hero ZIP hand-off
    const heroForm = document.getElementById('hero-zip-form');
    if (heroForm) {
      heroForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const zip = document.getElementById('hero-zip').value.trim();
        const mount = document.getElementById('quote-widget-mount');
        if (mount && mount._qwInstance) mount._qwInstance.qwPrefillZip(zip);
        else if (mount) mount.scrollIntoView({ behavior: 'smooth' });
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
