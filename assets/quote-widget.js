/* =========================================================
   EV AutoGlass — "Tell us what's wrong" quote flow
   Self-contained widget. Mount by adding:
     <div id="quote-widget-mount"></div>
   anywhere on the page. Multiple mounts on one page are fine —
   each gets its own isolated state via data-qw-id.
   ========================================================= */

(function () {

  const DAMAGE_TYPES = [
    {
      id: 'front',
      name: 'Front Windshield',
      sub: 'Chip, crack, or full replace',
      icon: `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 26 L9 10 Q10 8 12 8 H28 Q30 8 31 10 L35 26 Q35 28 33 28 H7 Q5 28 5 26 Z"/><path d="M20 8 V28 M9 17 H31"/></svg>`
    },
    {
      id: 'rear',
      name: 'Back Glass / Rear Window',
      sub: 'Rear windshield damage',
      icon: `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 24 L10 12 Q11 10 13 10 H27 Q29 10 30 12 L34 24 Q34 26 32 26 H8 Q6 26 6 24 Z"/><path d="M13 10 L11 26 M27 10 L29 26"/></svg>`
    },
    {
      id: 'driver',
      name: 'Driver Side Window',
      sub: 'Door or quarter glass',
      icon: `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="6" y="9" width="24" height="17" rx="2"/><path d="M6 26 L34 26 L30 33 H10 Z" stroke-linejoin="round"/><text x="18" y="20" font-size="9" fill="currentColor" stroke="none" font-family="sans-serif">L</text></svg>`
    },
    {
      id: 'passenger',
      name: 'Passenger Side Window',
      sub: 'Door or quarter glass',
      icon: `<svg viewBox="0 0 40 40" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="10" y="9" width="24" height="17" rx="2"/><path d="M6 26 L34 26 L30 33 H10 Z" stroke-linejoin="round"/><text x="19" y="20" font-size="9" fill="currentColor" stroke="none" font-family="sans-serif">R</text></svg>`
    }
  ];

  const AZ_CITY_BY_ZIP_PREFIX = {
    '850': 'Phoenix', '851': 'Phoenix', '853': 'Phoenix',
    '852': 'Mesa', '858': 'Scottsdale', '857': 'Scottsdale',
    '859': 'Anthem', '853': 'Maricopa', '852': 'Chandler', '85281': 'Tempe'
  };

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
     MOCK VIN DECODER
     Swap this out for a real VIN-decode API (e.g. NHTSA vPIC)
     when one is wired up. Contract: takes a 17-char VIN string,
     returns { year, make, model, trim } or null if it can't decode.
     Kept deterministic here so demos are consistent.
  --------------------------------------------------------- */
  function mockDecodeVIN(vin) {
    if (!vin || vin.length !== 17) return null;
    const makes = ['Toyota', 'Honda', 'Ford', 'Chevrolet', 'Nissan', 'Jeep', 'Hyundai', 'Kia'];
    const models = { Toyota: 'Camry', Honda: 'Civic', Ford: 'F-150', Chevrolet: 'Silverado', Nissan: 'Altima', Jeep: 'Grand Cherokee', Hyundai: 'Elantra', Kia: 'Sportage' };
    let seed = 0;
    for (let i = 0; i < vin.length; i++) seed += vin.charCodeAt(i) * (i + 1);
    const make = makes[seed % makes.length];
    const year = 2013 + (seed % 13); // 2013–2025
    const trims = ['LE', 'SE', 'Sport', 'Limited', 'XLE', 'Base'];
    return { year, make, model: models[make], trim: trims[seed % trims.length] };
  }

  function likelyNeedsADAS(year) {
    return year >= 2018;
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
          <span class="qw-step-pill" data-step-pill="3">3. Location &amp; contact</span>
          <span class="qw-step-pill" data-step-pill="4">4. Summary</span>
        </div>

        <!-- STEP 1 -->
        <div class="qw-panel" data-panel="1">
          <h3 class="h-3" style="color:#fff;margin-bottom:14px;">What's damaged?</h3>
          <div class="damage-grid" data-damage-grid></div>
          <div class="qw-nav">
            <span></span>
            <button class="btn btn-primary" data-next="1" disabled>Continue</button>
          </div>
        </div>

        <!-- STEP 2 -->
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
                <input class="field" id="${uid}-vin" maxlength="17" placeholder="e.g. 1HGCM82633A004352" data-vin-input>
                <div class="error-text">That doesn't look like a valid 17-character VIN.</div>
                <p class="helper">Find it on your dashboard (driver's side, visible through the windshield) or on a sticker inside the driver-side door jamb.</p>
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
            <div data-plate-result style="margin-top:16px;"></div>
          </div>

          <div class="qw-nav">
            <button class="link-btn" data-back="2">Back</button>
            <button class="btn btn-primary" data-next="2" disabled>Continue</button>
          </div>
        </div>

        <!-- STEP 3 -->
        <div class="qw-panel" data-panel="3">
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
            <button class="link-btn" data-back="3">Back</button>
            <button class="btn btn-primary" data-next="3">See my summary</button>
          </div>
        </div>

        <!-- STEP 4 -->
        <div class="qw-panel" data-panel="4">
          <h3 class="h-3" style="color:#fff;margin-bottom:14px;">Here's what we've got</h3>
          <div class="summary-card" data-summary></div>
          <p class="helper" style="margin-bottom:18px;">A specialist will confirm your quote and available appointment times within 15 minutes during business hours.</p>
          <div class="qw-nav">
            <button class="link-btn" data-back="4">Start over</button>
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
    const state = { step: 1, damage: null, vehicle: null, zip: '', name: '', phone: '', contact: 'Call', photo: null };

    // ---- Step 1: damage grid ----
    const grid = root.querySelector('[data-damage-grid]');
    DAMAGE_TYPES.forEach(d => {
      const card = el(`
        <button type="button" class="damage-card" data-damage-id="${d.id}">
          ${d.icon}
          <div class="name">${d.name}</div>
          <div class="sub">${d.sub}</div>
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

    // VIN decode
    const vinInput = root.querySelector('[data-vin-input]');
    root.querySelector('[data-decode-vin]').addEventListener('click', () => {
      const vin = vinInput.value.trim().toUpperCase();
      const resultBox = root.querySelector('[data-vin-result]');
      if (vin.length !== 17) {
        vinInput.classList.add('invalid');
        resultBox.innerHTML = '';
        return;
      }
      vinInput.classList.remove('invalid');
      const decoded = mockDecodeVIN(vin);
      if (decoded) {
        state.vehicle = { ...decoded, source: 'vin', vin };
        resultBox.innerHTML = `<div class="summary-card" style="margin:0;"><div class="summary-row"><span class="k">Decoded vehicle</span><span>${decoded.year} ${decoded.make} ${decoded.model} ${decoded.trim}</span></div></div>`;
        root.querySelector('[data-next="2"]').disabled = false;
      }
    });

    // Plate lookup (mocked the same way)
    root.querySelector('[data-decode-plate]').addEventListener('click', () => {
      const plate = root.querySelector('[data-plate-input]').value.trim();
      const stateAbbr = root.querySelector('[data-plate-state]').value;
      const resultBox = root.querySelector('[data-plate-result]');
      if (!plate) return;
      const decoded = mockDecodeVIN(plate.padEnd(17, '0').slice(0, 17));
      state.vehicle = { ...decoded, source: 'plate', plate, plateState: stateAbbr };
      resultBox.innerHTML = `<div class="summary-card" style="margin:0;"><div class="summary-row"><span class="k">Matched vehicle</span><span>${decoded.year} ${decoded.make} ${decoded.model} ${decoded.trim}</span></div></div>`;
      root.querySelector('[data-next="2"]').disabled = false;
    });

    // ---- Step 3: location + contact ----
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
      if (n === 4) renderSummary();
      root.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    root.querySelectorAll('[data-next]').forEach(btn => {
      btn.addEventListener('click', () => showStep(state.step + 1));
    });
    root.querySelectorAll('[data-back]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (state.step === 4) { showStep(1); return; }
        showStep(Math.max(1, state.step - 1));
      });
    });

    function renderSummary() {
      const v = state.vehicle;
      const vehicleLine = v ? `${v.year} ${v.make} ${v.model}${v.trim ? ' ' + v.trim : ''}` : 'Not provided';
      const adas = v && likelyNeedsADAS(v.year);
      root.querySelector('[data-summary]').innerHTML = `
        <div class="summary-row"><span class="k">Damage</span><span>${state.damage ? state.damage.name : '—'}</span></div>
        <div class="summary-row"><span class="k">Vehicle</span><span>${vehicleLine}</span></div>
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
