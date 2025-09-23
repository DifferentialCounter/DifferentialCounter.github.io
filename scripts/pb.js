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
    <button onclick="pbExportExcel_pb()">Export Case to Excel</button>
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
      .getElementById("pbCaseNumber")
      .addEventListener("input", function () {
        this.style.border = "";
      });
    document
      .getElementById("pbPathInitials")
      .addEventListener("input", function () {
        this.style.border = "";
      });

    // Highlight unassigned cell types
    const assignedIndexes = new Set(keyBindings_pb);
    const unassigned = cellTypes_pb.filter(
      (_, idx) => !assignedIndexes.has(idx)
    );
    const highlightDiv = document.getElementById("pbUnassignedHighlight");
    if (unassigned.length > 0) {
      highlightDiv.innerHTML =
        `<strong style="color:red;">Unassigned cell types:</strong> ` +
        unassigned
          .map(
            (type) =>
              `<span style="background: #ffe0e0; color: #b30000; padding: 2px 8px; border-radius: 4px; margin-right: 4px;">${type}</span>`
          )
          .join("");
    } else {
      highlightDiv.innerHTML = `<span style="color:green;">All cell types assigned.</span>`;
    }
  }

  window.pbUndoAll_pb = function () {
    for (let type in cellCounts_pb) cellCounts_pb[type] = 0;
    history_pb = [];
    totalCount_PB = 0;
    nrbcCount_pb = 0;
    log_pb.value = "";
    document.getElementById("pbCaseNumber").value = "";
    document.getElementById("pbPathInitials").value = "";
    updateDisplay_pb();
    saveState_pb();
  };

  window.pbExportExcel_pb = function () {
    const caseNumber = window.caseInfo.caseNumber || "Case";
    const initials = window.caseInfo.initials || "Path";
    const workbook = XLSX.utils.book_new();
    Object.keys(snapshots_pb).forEach((label) => {
      const ws = XLSX.utils.json_to_sheet(snapshots_pb[label]);
      XLSX.utils.book_append_sheet(workbook, ws, label);
    });
    const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    saveAs(blob, `${caseNumber}_${initials}_pb.xlsx`);
  };

  log_pb.addEventListener("input", () => {
    // Reset counts and history
    cellTypes_pb.forEach((type) => (cellCounts_pb[type] = 0));
    totalCount_PB = 0;
    nrbcCount_pb = 0;
    history_pb = [];

    for (let char of log_pb.value) {
      const keyNum = parseInt(char);
      if (!isNaN(keyNum) && keyNum >= 0 && keyNum <= 9) {
        const idx = keyBindings_pb[keyNum];
        const type = cellTypes_pb[idx];
        cellCounts_pb[type]++;
        history_pb.push(type);

        if (type === "NRBCs") {
          nrbcCount_pb++;
        } else {
          totalCount_PB++;

          if (totalCount_PB % 50 === 0) snapshotCounts_pb(totalCount_PB);

          if (
            Math.floor(totalCount_PB / 100) > lastBeepedHundred_pb &&
            totalCount_PB !== 0
          ) {
            playSound(beep_pb);
            lastBeepedHundred_pb = Math.floor(totalCount_PB / 100);
          } else {
            playSound(clickSound_pb);
          }
        }
      }
    }

    updateDisplay_pb();
    saveState_pb();

    if (totalCount_PB === MAX_COUNT_PB) {
      const pbApp = document.getElementById("pbApp");
      if (pbApp && pbApp.classList.contains("active")) {
        playSound(chime_pb);
        pbExportExcel_pb();
      }
    }
  });

  const ctx_pb = document.getElementById("pbChart").getContext("2d");
  const chart_pb = new Chart(ctx_pb, {
    type: "pie",
    data: {
      labels: cellTypes_pb,
      datasets: [
        {
          data: cellTypes_pb.map((type) => cellCounts_pb[type]),
          backgroundColor: [
            "#00000",
            "#660202",
            "#e6194b",
            "#911eb4",
            "#f58231",
            "#4363d8",
            "#46f0f0",
            "#f032e6",
            "#bcf60c",
            "#fabebe",
          ],
        },
      ],
    },
    options: {
      plugins: {
        legend: { position: "right" },
        tooltip: {
          callbacks: {
            label: function (context) {
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const value = context.raw;
              const percent =
                total > 0 ? ((value / total) * 100).toFixed(1) : 0;
              return `${context.label}: ${value} (${percent}%)`;
            },
          },
        },
        title: { display: true, text: "Cell Distribution" },
      },
    },
  });

  function updateChart_pb() {
    chart_pb.data.datasets[0].data = cellTypes_pb.map(
      (type) => cellCounts_pb[type]
    );
    chart_pb.update();
  }

  // Init
  loadState_pb();
  updateDisplay_pb();
  createKeypad_pb();
  createRemapArea_pb();

  document.addEventListener("keydown", (e) => {
    if (document.activeElement === log_pb) return;

    const caseNumber = document.getElementById("pbCaseNumber").value.trim();
    const initials = document.getElementById("pbPathInitials").value.trim();
    if (!caseNumber || !initials) return;

    const pbApp = document.getElementById("pbApp");
    if (!pbApp || !pbApp.classList.contains("active")) return;

    if (e.key >= "0" && e.key <= "9") {
      const keyNum = parseInt(e.key);
      const idx = keyBindings_pb[keyNum];
      if (typeof idx === "number") handleInput_pb(idx);
    } else if (e.key === "Escape") {
      e.preventDefault();
      pbUndoAll_pb();
    }
  });
})();
