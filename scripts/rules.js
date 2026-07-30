(function () {
  // Minimal rule engine for cell count flags
  window.ruleEngine = window.ruleEngine || {};

  // Default thresholds (configurable later)
  const defaults = {
    blasts_high_pct: 20, // blasts >=20% -> red
    blasts_moderate_pct: 5, // blasts >=5% -> orange
    me_low: 1.5, // default lower bound
    me_high: 3.3, // default upper bound
    plasma_myeloma_pct: 60, // IMWG biomarker threshold
    plasma_suspicious_pct: 10,
    lymph_high_pct: 50,
    atypical_suspicious_count: 5,
  };

  // Simple helper to compute percentages defensively
  function pct(count, total) {
    if (!total || total === 0) return 0;
    return (count / total) * 100;
  }

  // Evaluate rules against a snapshot object { cellCounts, total, meRatio, context }
  function evaluate(snapshot) {
    const flags = [];
    if (!snapshot) return flags;
    const counts = snapshot.cellCounts || {};
    const total = snapshot.total || 0;

    const blastsPct = pct(counts['Blasts'] || 0, total);

    // Blast rules
    if (blastsPct >= defaults.blasts_high_pct) {
      flags.push({
        id: 'blasts_high',
        severity: 'red',
        title: 'High blasts',
        message: `Blasts ${blastsPct.toFixed(1)}% — consider urgent hematopathology review (may indicate acute leukemia).`,
        evidence: { blasts: blastsPct.toFixed(1) },
        refs: [
          { title: 'WHO classification (summary)', url: 'https://www.who.int/news-room/questions-and-answers/item/acute-leukemia' },
        ],
      });
    } else if (blastsPct >= defaults.blasts_moderate_pct) {
      flags.push({
        id: 'blasts_moderate',
        severity: 'orange',
        title: 'Elevated blasts',
        message: `Blasts ${blastsPct.toFixed(1)}% — consider further evaluation and correlation.`,
        evidence: { blasts: blastsPct.toFixed(1) },
        refs: [],
      });
    }

    // M:E ratio rule (if provided)
    if (typeof snapshot.meRatio !== 'undefined' && snapshot.meRatio !== '–') {
      const me = parseFloat(snapshot.meRatio);
      if (!isNaN(me) && (me < defaults.me_low || me > defaults.me_high)) {
        flags.push({
          id: 'me_ratio_outside',
          severity: 'orange',
          title: 'Abnormal M:E ratio',
          message: `M:E ratio ${me} outside reference (${defaults.me_low} – ${defaults.me_high}) — consider marrow dyspoiesis or erythroid/myeloid shifts.`,
          evidence: { meRatio: me },
          refs: [],
        });
      }
    }

    // PB-specific: any circulating blasts
    if (snapshot.context === 'pb') {
      const pbBlasts = counts['Blasts'] || 0;
      if (pbBlasts > 0) {
        flags.push({
          id: 'pb_blasts_present',
          severity: 'red',
          title: 'Blasts in peripheral blood',
          message: `Blasts present in peripheral blood (${pbBlasts} cells) — urgent review recommended.`,
          evidence: { blasts: pbBlasts },
          refs: [],
        });
      }
    }

    // Plasma cell / myeloma-related flags
    const plasmaPct = pct(counts['Plasma'] || 0, total);
    if (plasmaPct >= defaults.plasma_myeloma_pct) {
      flags.push({
        id: 'plasma_myeloma_biomarker',
        severity: 'red',
        title: 'High marrow plasma cells (possible myeloma biomarker)',
        message: `Plasma cells ${plasmaPct.toFixed(1)}% — meets myeloma biomarker threshold (>=${defaults.plasma_myeloma_pct}%) used in consensus criteria; consider urgent hematopathology/hematology evaluation and confirmatory testing (bone marrow biopsy with clonality assessment, serum/urine protein studies, free light chains, imaging).`,
        evidence: { plasmaPct: plasmaPct.toFixed(1) },
        refs: [
          { title: 'IMWG diagnostic criteria (guidance)', url: 'https://www.myeloma.org' },
        ],
      });
    } else if (plasmaPct >= defaults.plasma_suspicious_pct) {
      flags.push({
        id: 'plasma_suspicious',
        severity: 'orange',
        title: 'Increased plasma cells (suspicious)',
        message: `Plasma cells ${plasmaPct.toFixed(1)}% — increased plasma cells in marrow aspirate; consider confirmatory studies (immunophenotyping/flow, serum/urine electrophoresis, free light chains) and hematopathology review.`,
        evidence: { plasmaPct: plasmaPct.toFixed(1) },
        refs: [],
      });
    }

    // Lymphoma-related flags (bone marrow involvement risk)
    const lymphPct = pct(counts['Lymphs'] || 0, total);
    const atypCount = counts['Atypical'] || 0;

    if (lymphPct >= defaults.lymph_high_pct && atypCount >= 3) {
      flags.push({
        id: 'lymphoma_suspicious_highly',
        severity: 'red',
        title: 'Marked lymphocytosis with atypical cells (possible marrow involvement by lymphoma)',
        message: `Lymphocytes ${lymphPct.toFixed(1)}% with ${atypCount} atypical cells — may indicate lymphoid neoplasm involving marrow. Recommend hematopathology review and confirmatory testing (flow cytometry, immunohistochemistry, molecular studies).`,
        evidence: { lymphPct: lymphPct.toFixed(1), atypical: atypCount },
        refs: [
          { title: 'WHO lymphoid neoplasms guidance', url: 'https://www.who.int' },
        ],
      });
    } else if (atypCount >= defaults.atypical_suspicious_count) {
      flags.push({
        id: 'lymphoma_suspicious_atypical',
        severity: 'orange',
        title: 'Elevated atypical cells (possible lymphoma involvement)',
        message: `Atypical cells ${atypCount} — consider hematopathology review and confirmatory tests (flow cytometry, immunostains).`,
        evidence: { atypical: atypCount },
        refs: [],
      });
    }

    return flags;
  }

  // Render flags into a panel element; panelId is element id
  function render(panelId, flags, snapshotHash) {
    const panel = document.getElementById(panelId);
    if (!panel) return;

    panel.innerHTML = '';
    if (!flags || flags.length === 0) {
      panel.style.display = 'none';
      return;
    }
    panel.style.display = 'block';

    const header = document.createElement('div');
    header.className = 'flags-header';
    header.innerHTML = `<strong>Flags</strong> <small style="margin-left:8px;color:#666">Decision support only — not a diagnosis</small>`;
    panel.appendChild(header);

    flags.forEach((f) => {
      const card = document.createElement('div');
      card.className = 'flag-card';
      card.dataset.flagId = f.id;
      card.innerHTML = `
        <div class="flag-title"><span class="flag-dot ${f.severity}"></span> ${f.title}</div>
        <div class="flag-message">${f.message}</div>
        <div class="flag-evidence">${Object.keys(f.evidence || {}).map(k => `${k}: ${f.evidence[k]}`).join(' | ')}</div>
        <div class="flag-actions"><button class="dismiss-btn">Dismiss</button> <button class="more-btn">More</button></div>
      `;

      card.querySelector('.dismiss-btn').onclick = () => {
        card.style.display = 'none';
        try { localStorage.setItem(panelId + '_dismiss_' + f.id, snapshotHash || Date.now()); } catch (e) {}
      };

      card.querySelector('.more-btn').onclick = () => {
        const more = document.createElement('div');
        more.className = 'flag-more';
        more.innerHTML = `<em>References:</em> ${f.refs.map(r=>`<a href="${r.url}" target="_blank">${r.title}</a>`).join(', ')}<br/><small>Decision support only — not a diagnosis.</small>`;
        card.appendChild(more);
        card.querySelector('.more-btn').disabled = true;
      };

      panel.appendChild(card);
    });
  }

  function hashSnapshot(snapshot) {
    try { return JSON.stringify(snapshot); } catch (e) { return String(Date.now()); }
  }

  window.ruleEngine.evaluate = evaluate;
  window.ruleEngine.render = render;
  window.ruleEngine.hashSnapshot = hashSnapshot;

  window.ruleEngine.updateFlags = function (panelId, snapshot) {
    try {
      const flags = evaluate(snapshot || {});
      const snapshotHash = hashSnapshot(snapshot || {});
      const filtered = flags.filter(f => {
        const dismissed = localStorage.getItem(panelId + '_dismiss_' + f.id);
        if (!dismissed) return true;
        return dismissed !== snapshotHash;
      });
      render(panelId, filtered, snapshotHash);
    } catch (e) {
      console.error('ruleEngine.updateFlags failed', e);
    }
  };

  // Minimal CSS for flags
  const css = `
    .flags-panel { border:1px solid #eee; padding:8px; margin-top:8px; background:#fff; max-width:420px; }
    .flags-header { font-weight:600; margin-bottom:6px; }
    .flag-card { border-radius:6px; padding:8px; margin-bottom:8px; border-left:6px solid #ccc; background:#fafafa; }
    .flag-dot.red{ display:inline-block; width:10px; height:10px; background:#c62828; border-radius:50%; margin-right:6px; }
    .flag-dot.orange{ display:inline-block; width:10px; height:10px; background:#ff9800; border-radius:50%; margin-right:6px; }
    .flag-title{ font-weight:600; margin-bottom:4px; }
    .flag-message{ margin-bottom:6px; }
    .flag-evidence{ font-size:0.85em; color:#444; margin-bottom:6px; }
    .flag-more{ font-size:0.85em; color:#333; margin-top:6px; }
    .dismiss-btn, .more-btn { margin-right:6px; }
  `;
  try {
    const style = document.createElement('style');
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
  } catch (e) {}

})();
