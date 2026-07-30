(function renderPB(containerId = "pbContainer") {
  const container_pb = document.getElementById(containerId);
  container_pb.innerHTML = `
    <h2>Peripheral Blood Smear Counter</h2>
    <div style="margin-bottom: 16px;">
      <label><strong>Case Number:</strong></label>
      <span id="pbCaseDisplay" style="margin-right: 20px;"></span>
      <label><strong>Pathologist Initials:</strong></label>
      <span id="pbInitialsDisplay"></span>
    </div>
    <div class="keypad" id="pbKeypad"></div>
    <div class="remap" id="pbRemap"></div>
    <div id="pbUnassignedWarning" style="color: red; font-weight: bold; margin-top: 6px;"></div>
    <div class="counter-display" id="pbDisplay"></div>
    <div><strong>Total (excluding NRBCs):</strong> <span id="pbTotal">0 / 200</span></div>
    <div><strong>NRBCs counted separately:</strong> <span id="pbNRBC">0</span></div>
    <button onclick="pbUndoAll_pb()">Undo All</button>
    <textarea id="pbLog"></textarea>
    <div id="pbChartContainer">
      <canvas id="pbChart"></canvas>
    </div>
  `;

  const beep_pb = new Audio("media/100.wav");
  const chime_pb = new Audio("media/complete.wav");
  const clickSound_pb = new Audio("media/click.wav");
  clickSound_pb.volume = 0.75;

  document.addEventListener("caseInfoReady", () => {
    document.getElementById("pbCaseDisplay").textContent =
      window.caseInfo.caseNumber;
    document.getElementById("pbInitialsDisplay").textContent =
      window.caseInfo.initials;
  });

  const cellTypes_pb = [
    "Blasts",
    "NRBCs",
    "Eos",
    "Basos",
    "Lymphs",
    "Monos",
    "Neuts",
    "Metas",
    "Myelo",
    "Promyelo",
  ];
  let keyBindings_pb = [0, 1, 2, 3, 6, 4, 5, 7, 8, 9];
  const cellCounts_pb = {};
  let totalCount_PB = 0;
  let nrbcCount_pb = 0;
  let history_pb = [];
  const snapshots_pb = {};
  const MAX_COUNT_PB = 200;
  let lastBeepedHundred_pb = 0;

  cellTypes_pb.forEach((type) => (cellCounts_pb[type] = 0));

  const keypad_pb = document.getElementById("pbKeypad");
  const counterDisplay_pb = document.getElementById("pbDisplay");
  const totalDisplay_pb = document.getElementById("pbTotal");
  const nrbcDisplay_pb = document.getElementById("pbNRBC");
  const log_pb = document.getElementById("pbLog");
  const remapArea_pb = document.getElementById("pbRemap");
  const warning_pb = document.getElementById("pbUnassignedWarning");

  function loadState_pb() {
    const saved = localStorage.getItem("pbState");
    if (!saved) return;

    try {
      const state = JSON.parse(saved);

      // Keep only keyBindings
      if (state.keyBindings) keyBindings_pb = state.keyBindings;

      // Reset everything else
      cellTypes_pb.forEach((type) => (cellCounts_pb[type] = 0));
      totalCount_PB = 0;
      nrbcCount_pb = 0;
      history_pb = [];
      for (let key in snapshots_pb) delete snapshots_pb[key];
    } catch (e) {
      console.error("Failed to load PB state:", e);
    }
  }

  function saveState_pb() {
    const state = {
      cellCounts: cellCounts_pb,
      totalCount_PB,
      history: history_pb,
      nrbcCount: nrbcCount_pb,
      keyBindings: keyBindings_pb,
    };
    localStorage.setItem("pbState", JSON.stringify(state));
  }

  function snapshotCounts_pb(count) {
    const displayOrder = [
      "Blasts",
      "Promyelo",
      "Myelo",
      "Metas",
      "Neuts",
      "Lymphs",
      "Monos",
      "Eos",
      "Basos",
      "NRBCs",
    ];

    // Build snapshot in display order
    const snap = displayOrder.map((type) => {
      let countVal, percentVal;
      if (type === "NRBCs") {
        countVal = nrbcCount_pb;
        percentVal = ""; // NRBCs are counted separately
      } else {
        countVal = cellCounts_pb[type] || 0;
        percentVal =
          count > 0 ? ((countVal / count) * 100).toFixed(1) + "%" : "0.0%";
      }
      return { CellType: type, Count: countVal, Percent: percentVal };
    });
    snapshots_pb[`Count_${count}`] = snap;
  }

  function playSound(sound) {
    try {
      sound.pause();
      sound.currentTime = 0;
      sound.play();
    } catch (e) {
      console.warn("Audio playback failed:", e);
    }
  }

  function createKeypad_pb() {
    keypad_pb.innerHTML = "";
    const layout = [
      [7, 8, 9],
      [4, 5, 6],
      [1, 2, 3],
      [null, 0, null],
    ];

    layout.forEach((row) => {
      row.forEach((i) => {
        const key = document.createElement("div");
        if (i === null) {
          key.style.visibility = "hidden";
        } else {
          const cellIndex = keyBindings_pb[i];
          key.className = "key";
          key.textContent = `${i}: ${cellTypes_pb[cellIndex]}`;
          key.onclick = () => handleInput_pb(cellIndex);
        }
        keypad_pb.appendChild(key);
      });
    });
  }

  function updateDisplay_pb() {
    counterDisplay_pb.innerHTML = "";

    // Build the table
    const table = document.createElement("table");
    table.style.borderCollapse = "collapse";
    table.style.width = "100%";
    table.style.marginTop = "10px";

    // Header row
    table.innerHTML = `
    <tr>
      <th style="border:1px solid #ccc; padding:6px;">Peripheral Blood (${totalCount_PB} cells)</th>
      <th style="border:1px solid #ccc; padding:6px;">Result</th>
      <th style="border:1px solid #ccc; padding:6px;">Reference Range</th>
    </tr>
  `;

    // Helper to add a normal row
    function addRow(label, percent, range) {
      const row = document.createElement("tr");
      row.innerHTML = `
      <td style="border:1px solid #ccc; padding:6px;">${label}</td>
      <td style="border:1px solid #ccc; padding:6px;">${percent}%</td>
      <td style="border:1px solid #ccc; padding:6px;">${range}</td>
    `;
      table.appendChild(row);
    }

    // Calculate values
    const blasts = (
      (cellCounts_pb["Blasts"] / totalCount_PB) * 100 || 0
    ).toFixed(1);
    const neuts = ((cellCounts_pb["Neuts"] / totalCount_PB) * 100 || 0).toFixed(
      1
    );
    const metas = ((cellCounts_pb["Metas"] / totalCount_PB) * 100 || 0).toFixed(
      1
    );
    const myelos = (
      (cellCounts_pb["Myelo"] / totalCount_PB) * 100 || 0
    ).toFixed(1);
    const promyelo = (
      (cellCounts_pb["Promyelo"] / totalCount_PB) * 100 || 0
    ).toFixed(1);
    const eos = ((cellCounts_pb["Eos"] / totalCount_PB) * 100 || 0).toFixed(1);
    const basos = ((cellCounts_pb["Basos"] / totalCount_PB) * 100 || 0).toFixed(
      1
    );
    const monos = ((cellCounts_pb["Monos"] / totalCount_PB) * 100 || 0).toFixed(
      1
    );
    const lymphs = (
      (cellCounts_pb["Lymphs"] / totalCount_PB) * 100 || 0
    ).toFixed(1);
    const nrbcs = (cellCounts_pb["NRBCs"] / 2).toFixed(1);

    // Add rows
    addRow("Blasts", blasts, "0%");
    addRow("Promyelocytes", promyelo, "0%");
    addRow("Myelocytes", myelos, "0%");
    addRow("Metamyelocytes", metas, "0%");
    addRow("Neutrophils", neuts, "34 – 73%");
    addRow("Lymphocytes", lymphs, "15 – 50%");
    addRow("Monocytes", monos, "1 – 15%");
    addRow("Eosinophils", eos, "1 – 5%");
    addRow("Basophils", basos, "0 – 1%");
    addRow("NRBCs/100", nrbcs, "1.5 – 3.3");

    counterDisplay_pb.appendChild(table);

    // Update total at the top
    totalDisplay_pb.textContent = `${totalCount_PB} / ${MAX_COUNT_PB}`;
    nrbcDisplay_pb.textContent = nrbcCount_pb;

    updateChart_pb();
  }

  function handleInput_pb(index) {
    const type = cellTypes_pb[index];
    cellCounts_pb[type]++;
    history_pb.push(type);

    if (type === "NRBCs") {
      nrbcCount_pb++;
    } else {
      totalCount_PB++;
      if (totalCount_PB % 50 === 0) snapshotCounts_pb(totalCount_PB);

      if (totalCount_PB === MAX_COUNT_PB) {
        const pbApp = document.getElementById("pbApp");
        if (pbApp && pbApp.classList.contains("active")) {
          playSound(chime_pb);
          pbExportExcel_pb();
        }
      }
    }

    updateDisplay_pb();
    saveState_pb();
  }

  function createRemapArea_pb() {
    remapArea_pb.innerHTML = `
        <details open>
        <summary><strong>Customize Key Mappings</strong></summary>
        <div style="margin-top: 10px;">
            <h4>Assign cell types to number keys:</h4>
            <table style="margin-bottom:10px;">
            <tr><th>Key</th><th>Cell Type</th></tr>
            ${Array.from(
              { length: 10 },
              (_, i) => `
                <tr>
                <td style="text-align:center;">${i}</td>
                <td>
                    <select id="pb-remap-select-${i}" style="width:120px;"></select>
                </td>
                </tr>
            `
            ).join("")}
            </table>
            <div id="pbUnassignedHighlight" style="margin-top:10px;"></div>
        </div>
        </details>
    `;

    // Fill each select with cell types
    for (let i = 0; i <= 9; i++) {
      const select = document.getElementById(`pb-remap-select-${i}`);
      cellTypes_pb.forEach((type, idx) => {
        const option = document.createElement("option");
        option.value = idx;
        option.textContent = type;
        if (keyBindings_pb[i] === idx) option.selected = true;
        select.appendChild(option);
      });
      select.onchange = function () {
        keyBindings_pb[i] = parseInt(this.value);
        saveState_pb();
        createRemapArea_pb();
        createKeypad_pb();
      };
    }

    document
304|       .getElementById("pbCaseNumber")
305|       .addEventListener("input", function () {
306|         this.style.border = "";
307|       });
308|     document
309|       .getElementById("pbPathInitials")
310|       .addEventListener("input", function () {
311|         this.style.border = "";
312|       });

313|     // Highlight unassigned cell types
314|     const assignedIndexes = new Set(keyBindings_pb);
315|     const unassigned = cellTypes_pb.filter(
316|       (_, idx) => !assignedIndexes.has(idx)
317|     );
318|     const highlightDiv = document.getElementById("pbUnassignedHighlight");
319|     if (unassigned.length > 0) {
320|       highlightDiv.innerHTML =
321|         `<strong style="color:red;">Unassigned cell types:</strong> ` +
322|         unassigned
323|           .map(
324|             (type) =>
325|               `<span style="background: #ffe0e0; color: #b30000; padding: 2px 8px; border-radius: 4px; margin-right: 4px;">${type}</span>`
326|           )
327|           .join("");
328|     } else {
329|       highlightDiv.innerHTML = `<span style="color:green;">All cell types assigned.</span>`;
330|     }
331|   }

332|   window.pbUndoAll_pb = function () {
333|     for (let type in cellCounts_pb) cellCounts_pb[type] = 0;
334|     history_pb = [];
335|     totalCount_PB = 0;
336|     nrbcCount_pb = 0;
337|     log_pb.value = "";
338|     document.getElementById("pbCaseNumber").value = "";
339|     document.getElementById("pbPathInitials").value = "";
340|     updateDisplay_pb();
341|     saveState_pb();
342|   };

343|   // Export replaced with a safe no-op
344|   window.pbExportExcel_pb = function () {
345|     console.warn("pbExportExcel_pb() called but export is disabled.");
346|   };

347|   log_pb.addEventListener("input", () => {
348|     // Reset counts and history
349|     cellTypes_pb.forEach((type) => (cellCounts_pb[type] = 0));
350|     totalCount_PB = 0;
351|     nrbcCount_pb = 0;
352|     history_pb = [];

353|     for (let char of log_pb.value) {
354|       const keyNum = parseInt(char);
355|       if (!isNaN(keyNum) && keyNum >= 0 && keyNum <= 9) {
356|         const idx = keyBindings_pb[keyNum];
357|         const type = cellTypes_pb[idx];
358|         cellCounts_pb[type]++;
359|         history_pb.push(type);

360|         if (type === "NRBCs") {
361|           nrbcCount_pb++;
362|         } else {
363|           totalCount_PB++;

364|           if (totalCount_PB % 50 === 0) snapshotCounts_pb(totalCount_PB);

365|           if (
366|             Math.floor(totalCount_PB / 100) > lastBeepedHundred_pb &&
367|             totalCount_PB !== 0
368|           ) {
369|             playSound(beep_pb);
370|             lastBeepedHundred_pb = Math.floor(totalCount_PB / 100);
371|           } else {
372|             playSound(clickSound_pb);
373|           }
374|         }
375|       }
376|     }

377|     updateDisplay_pb();
378|     saveState_pb();

379|     if (totalCount_PB === MAX_COUNT_PB) {
380|       const pbApp = document.getElementById("pbApp");
381|       if (pbApp && pbApp.classList.contains("active")) {
382|         playSound(chime_pb);
383|         // call to exporter is now no-op
384|         if (typeof window.pbExportExcel_pb === 'function') window.pbExportExcel_pb();
385|       }
386|     }
387|   });

388|   const ctx_pb = document.getElementById("pbChart").getContext("2d");
389|   const chart_pb = new Chart(ctx_pb, {
390|     type: "pie",
391|     data: {
392|       labels: cellTypes_pb,
393|       datasets: [
394|         {
395|           data: cellTypes_pb.map((type) => cellCounts_pb[type]),
396|           backgroundColor: [
397|             "#00000",
398|             "#660202",
399|             "#e6194b",
400|             "#911eb4",
401|             "#f58231",
402|             "#4363d8",
403|             "#46f0f0",
404|             "#f032e6",
405|             "#bcf60c",
406|             "#fabebe",
407|           ],
408|         },
409|       ],
410|     },
411|     options: {
412|       plugins: {
413|         legend: { position: "right" },
414|         tooltip: {
415|           callbacks: {
416|             label: function (context) {
417|               const total = context.dataset.data.reduce((a, b) => a + b, 0);
418|               const value = context.raw;
419|               const percent =
420|                 total > 0 ? ((value / total) * 100).toFixed(1) : 0;
421|               return `${context.label}: ${value} (${percent}%)`;
422|             },
423|           },
424|         },
425|         title: { display: true, text: "Cell Distribution" },
426|       },
427|     },
428|   });

429|   function updateChart_pb() {
430|     chart_pb.data.datasets[0].data = cellTypes_pb.map(
431|       (type) => cellCounts_pb[type]
432|     );
433|     chart_pb.update();
434|   }

435|   // Init
436|   loadState_pb();
437|   updateDisplay_pb();
438|   createKeypad_pb();
439|   createRemapArea_pb();

440|   document.addEventListener("keydown", (e) => {
441|     if (document.activeElement === log_pb) return;
442| 
443|     const caseNumber = document.getElementById("pbCaseNumber").value.trim();
444|     const initials = document.getElementById("pbPathInitials").value.trim();
445|     if (!caseNumber || !initials) return;
446| 
447|     const pbApp = document.getElementById("pbApp");
448|     if (!pbApp || !pbApp.classList.contains("active")) return;
449| 
450|     if (e.key >= "0" && e.key <= "9") {
451|       const keyNum = parseInt(e.key);
452|       const idx = keyBindings_pb[keyNum];
453|       if (typeof idx === "number") handleInput_pb(idx);
454|     } else if (e.key === "Escape") {
455|       e.preventDefault();
456|       pbUndoAll_pb();
457|     }
458|   });
459| })();
