// aspirate.js
(function renderAspirate(containerId = "aspirateContainer") {
  const container = document.getElementById(containerId);
  container.innerHTML = `
    <h2>Aspirate Smear Counter</h2>
    <div style="margin-bottom: 16px;">
      <label><strong>Case Number:</strong></label>
      <span id="aspirateCaseDisplay" style="margin-right: 20px;"></span>
      <label><strong>Pathologist Initials:</strong></label>
      <span id="aspirateInitialsDisplay"></span>
    </div>
    <div class="keypad" id="aspirateKeypad"></div>
    <div class="remap" id="aspirateRemap"></div>
    <div id="aspirateUnassignedWarning" style="color: red; font-weight: bold; margin-top: 6px;"></div>
    <div class="counter-display" id="aspirateDisplay"></div>
    <div><strong>Total:</strong> <span id="aspirateTotal">0 / 500</span></div>
    <div><strong>M:E Ratio:</strong> <span id="aspirateRatio">–</span></div>
    <button onclick="aspirateUndoAll()">Undo All</button>
    <button onclick="aspirateExportExcel()">Export Case to Excel</button>
    <textarea id="aspirateLog"></textarea>
    <div id="aspirateChartContainer">
      <canvas id="aspirateChart"></canvas>
    </div>
  `;

  const beep = new Audio("media/100.wav");
  const chime = new Audio("media/complete.wav");
  const clickSound = new Audio("media/click.wav");
  clickSound.volume = 0.75;

  document.addEventListener("caseInfoReady", () => {
    document.getElementById("aspirateCaseDisplay").textContent =
      window.caseInfo.caseNumber;
    document.getElementById("aspirateInitialsDisplay").textContent =
      window.caseInfo.initials;
  });

  const cellTypes = [
    "Blasts",
    "NRBCs",
    "Eos",
    "Basos",
    "Lymphs",
    "Monos",
    "Neuts",
    "Metas",
    "Myelo",
    "Plasma",
    "Atypical",
    "Other",
  ];
  let keyBindings = [0, 1, 2, 3, 6, 4, 5, 7, 8, 9];
  const cellCounts = {};
  let totalCount = 0;
  let history = [];
  const snapshots = {};
  const MAX_COUNT = 500;

  cellTypes.forEach((type) => (cellCounts[type] = 0));

  const keypad = document.getElementById("aspirateKeypad");
  const counterDisplay = document.getElementById("aspirateDisplay");
  const totalDisplay = document.getElementById("aspirateTotal");
  const ratioDisplay = document.getElementById("aspirateRatio");
  const log = document.getElementById("aspirateLog");
  const remapArea = document.getElementById("aspirateRemap");
  const warning = document.getElementById("aspirateUnassignedWarning");

  function loadState() {
    const saved = localStorage.getItem("aspirateState");
    if (!saved) return;

    try {
      const state = JSON.parse(saved);

      // Keep only keyBindings
      if (state.keyBindings) keyBindings = state.keyBindings;

      // Reset everything else
      cellTypes.forEach((type) => (cellCounts[type] = 0));
      totalCount = 0;
      history = [];
      for (let key in snapshots) delete snapshots[key];
    } catch (e) {
      console.error("Failed to load Aspirate state:", e);
    }
  }

  function saveState() {
    const state = { cellCounts, totalCount, history, keyBindings };
    localStorage.setItem("aspirateState", JSON.stringify(state));
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

  function handleInput(index) {
    const type = cellTypes[index];
    cellCounts[type]++;
    totalCount++;
    history.push(type);

    if (totalCount % 50 === 0) snapshotCounts(totalCount);

    updateDisplay();
    saveState();

    const aspirateApp = document.getElementById("aspirateApp");
    if (
      totalCount === MAX_COUNT &&
      aspirateApp &&
      aspirateApp.classList.contains("active")
    ) {
      playSound(chime);
      aspirateExportExcel();
      document.getElementById("aspirateOverrideContainer").style.display =
        "block";
    } else if (totalCount > MAX_COUNT && !allowOverLimit) {
      return; // prevent over-limit count
    }
  }

  function snapshotCounts(count) {
    const displayOrder = [
      "Blasts",
      "Neuts and Precursors",
      "Eos",
      "Basos",
      "Monos",
      "Lymphs",
      "Plasma",
      "NRBCs",
      "Atypical",
      "Other",
    ];

    // Calculate Neuts and Precursors sum
    const neutsPrecursors =
      cellCounts["Neuts"] + cellCounts["Metas"] + cellCounts["Myelo"];

    // Build snapshot in display order
    const snap = displayOrder.map((type) => {
      let countVal, percentVal;
      if (type === "Neuts and Precursors") {
        countVal = neutsPrecursors;
        percentVal =
          count > 0
            ? ((neutsPrecursors / count) * 100).toFixed(1) + "%"
            : "0.0%";
      } else {
        countVal = cellCounts[type] || 0;
        percentVal =
          count > 0 ? ((countVal / count) * 100).toFixed(1) + "%" : "0.0%";
      }
      return { CellType: type, Count: countVal, Percent: percentVal };
    });

    // Calculate M:E ratio
    const meNumerator =
      cellCounts["Eos"] +
      cellCounts["Basos"] +
      cellCounts["Neuts"] +
      cellCounts["Metas"] +
      cellCounts["Myelo"];
    const meRatio =
      cellCounts["NRBCs"] > 0
        ? (meNumerator / cellCounts["NRBCs"]).toFixed(2)
        : "–";

    // Add M:E ratio as a row at the end
    snap.push({ CellType: "M:E Ratio", Count: meRatio, Percent: "" });

    snapshots[`Count_${count}`] = snap;
  }

  function createKeypad() {
    keypad.innerHTML = "";
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
          const cellIndex = keyBindings[i];
          key.className = "key";
          key.textContent = `${i}: ${cellTypes[cellIndex]}`;
          key.onclick = () => handleInput(cellIndex);
        }
        keypad.appendChild(key);
      });
    });
  }

  function updateDisplay() {
    const counterDisplay = document.getElementById("aspirateDisplay");
    counterDisplay.innerHTML = "";

    // Build the table
    const table = document.createElement("table");
    table.style.borderCollapse = "collapse";
    table.style.width = "100%";
    table.style.marginTop = "10px";

    // Header row
    table.innerHTML = `
    <tr>
      <th style="border:1px solid #ccc; padding:6px;">Aspirate Smear (${totalCount} cells)</th>
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

    // Helper for expandable neutrophil row
    function addExpandableNeutRow(totalPercent) {
      const neutRow = document.createElement("tr");
      neutRow.innerHTML = `
      <td style="border:1px solid #ccc; padding:6px;">
        <details>
          <summary>Neutrophils & Precursors</summary>
          <div style="font-size:0.9em; margin-top:4px; margin-left:12px;">
            <div style="color:#4363d8;">Neuts: ${cellCounts["Neuts"]}</div>
            <div style="color:#f58231;">Metas: ${cellCounts["Metas"]}</div>
            <div style="color:#46f0f0;">Myelo: ${cellCounts["Myelo"]}</div>
          </div>
        </details>
      </td>
      <td style="border:1px solid #ccc; padding:6px;">${totalPercent}%</td>
      <td style="border:1px solid #ccc; padding:6px;">33 – 63%</td>
    `;
      table.appendChild(neutRow);
    }

    // Calculate values
    const blasts = ((cellCounts["Blasts"] / totalCount) * 100 || 0).toFixed(1);
    const neutsPrecursorsCount =
      cellCounts["Neuts"] + cellCounts["Metas"] + cellCounts["Myelo"];
    const neutsPrecursors = (
      (neutsPrecursorsCount / totalCount) * 100 || 0
    ).toFixed(1);
    const eos = ((cellCounts["Eos"] / totalCount) * 100 || 0).toFixed(1);
    const basos = ((cellCounts["Basos"] / totalCount) * 100 || 0).toFixed(1);
    const monos = ((cellCounts["Monos"] / totalCount) * 100 || 0).toFixed(1);
    const lymphs = ((cellCounts["Lymphs"] / totalCount) * 100 || 0).toFixed(1);
    const plasma = ((cellCounts["Plasma"] / totalCount) * 100 || 0).toFixed(1);
    const others = ((cellCounts["Other"] / totalCount) * 100 || 0).toFixed(1);
    const atyp = ((cellCounts["Atypical"] / totalCount) * 100 || 0).toFixed(1);
    const nrbcs = ((cellCounts["NRBCs"] / totalCount) * 100 || 0).toFixed(1);

    // M:E ratio
    const meNumerator =
      cellCounts["Eos"] +
      cellCounts["Basos"] +
      cellCounts["Neuts"] +
      cellCounts["Metas"] +
      cellCounts["Myelo"];
    const meRatio =
      cellCounts["NRBCs"] > 0
        ? (meNumerator / cellCounts["NRBCs"]).toFixed(2)
        : "–";

    // Add rows
    addRow("Blasts", blasts, "0 – 3%");
    addExpandableNeutRow(neutsPrecursors);
    addRow("Eosinophils & Precursors", eos, "1 – 5%");
    addRow("Basophils & Precursors", basos, "0 – 1%");
    addRow("Monocytes", monos, "0 – 2%");
    addRow("Lymphocytes", lymphs, "10 – 15%");
    addRow("Plasma Cells", plasma, "0 – 1%");
    addRow("Other", others, "0%");
    addRow("Atypical", atyp, "0%");
    addRow("Erythroid Precursors", nrbcs, "15 – 27%");
    addRow("M:E Ratio", meRatio, "1.5 – 3.3");

    counterDisplay.appendChild(table);

    // Update total and ratio at the top
    document.getElementById(
      "aspirateTotal"
    ).textContent = `${totalCount} / ${MAX_COUNT}`;
    document.getElementById("aspirateRatio").textContent = meRatio;

    updateChart();
  }

  function createRemapArea() {
    // Add new types if not present
    ["Atypical", "Other"].forEach((type) => {
      if (!cellTypes.includes(type)) cellTypes.push(type);
    });

    remapArea.innerHTML = `
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
                    <select id="remap-select-${i}" style="width:120px;"></select>
                </td>
                </tr>
            `
            ).join("")}
            </table>
            <div id="unassignedHighlight" style="margin-top:10px;"></div>
        </div>
        </details>
    `;

    // Fill each select with cell types
    for (let i = 0; i <= 9; i++) {
      const select = document.getElementById(`remap-select-${i}`);
      cellTypes.forEach((type, idx) => {
        const option = document.createElement("option");
        option.value = idx;
        option.textContent = type;
        if (keyBindings[i] === idx) option.selected = true;
        select.appendChild(option);
      });
      select.onchange = function () {
        keyBindings[i] = parseInt(this.value);
        saveState();
        createRemapArea();
        createKeypad();
      };
    }
    // Highlight unassigned cell types
    const assignedIndexes = new Set(keyBindings);
    const unassigned = cellTypes.filter((_, idx) => !assignedIndexes.has(idx));
    const highlightDiv = document.getElementById("unassignedHighlight");
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

  window.aspirateUndoAll = function () {
    cellTypes.forEach((type) => (cellCounts[type] = 0));
    totalCount = 0;
    history = [];
    for (let k in snapshots) delete snapshots[k];
    log.value = "";
    document.getElementById("aspirateCaseNumber").value = "";
    document.getElementById("aspiratePathInitials").value = "";
    updateDisplay();
    saveState();
  };

  window.aspirateExportExcel = function () {
    const caseNumber = window.caseInfo.caseNumber || "Case";
    const initials = window.caseInfo.initials || "Path";
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const workbook = XLSX.utils.book_new();
    Object.keys(snapshots).forEach((label) => {
      const ws = XLSX.utils.json_to_sheet(snapshots[label]);
      XLSX.utils.book_append_sheet(workbook, ws, label);
    });
    const wbout = XLSX.write(workbook, { bookType: "xlsx", type: "array" });
    const blob = new Blob([wbout], { type: "application/octet-stream" });
    saveAs(blob, `${caseNumber}_${initials}.xlsx`);
  };

  log.addEventListener("input", () => {
    // Reset counts and history
    cellTypes.forEach((type) => (cellCounts[type] = 0));
    totalCount = 0;
    history = [];

    for (let char of log.value) {
      const keyNum = parseInt(char);
      if (!isNaN(keyNum) && keyNum >= 0 && keyNum <= 9) {
        const idx = keyBindings[keyNum];
        const type = cellTypes[idx];
        cellCounts[type]++;
        history.push(type);
        totalCount++;

        if (totalCount % 50 === 0) snapshotCounts(totalCount);

        if (totalCount % 100 === 0 && totalCount !== 0) {
          playSound(beep);
        } else {
          playSound(clickSound);
        }
      }
    }

    updateDisplay();
    saveState();

    if (totalCount === MAX_COUNT) {
      const aspirateApp = document.getElementById("aspirateApp");
      if (aspirateApp && aspirateApp.classList.contains("active")) {
        playSound(chime);
        aspirateExportExcel();
      }
    }
  });

  const ctx = document.getElementById("aspirateChart").getContext("2d");
  const chart = new Chart(ctx, {
    type: "pie",
    data: {
      labels: cellTypes,
      datasets: [
        {
          data: cellTypes.map((type) => cellCounts[type]),
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

  function updateChart() {
    chart.data.datasets[0].data = cellTypes.map((type) => cellCounts[type]);
    chart.update();
  }

  // Init
  loadState();
  updateDisplay();
  createKeypad();
  createRemapArea();

  window.onload = () => {
    const modal = document.getElementById("startupModal");
    const modalCase = document.getElementById("modalCaseNumber");
    const modalInitials = document.getElementById("modalInitials");
    const modalBtn = document.getElementById("modalSubmitBtn");

    modal.style.display = "flex";

    modalBtn.onclick = function () {
      const caseVal = modalCase.value.trim();
      const initialsVal = modalInitials.value.trim();

      if (!caseVal || !initialsVal) {
        alert("Please enter both the case number and pathologist initials.");
        return;
      }

      // Save in aspirate input
      document.getElementById("aspirateCaseNumber").value = caseVal;
      document.getElementById("aspiratePathInitials").value = initialsVal;

      // Store in localStorage for PB
      localStorage.setItem("sharedCaseNumber", caseVal);
      localStorage.setItem("sharedInitials", initialsVal);

      modal.style.display = "none";
    };
  };

  document.addEventListener("keydown", (e) => {
    if (document.activeElement === log) return;

    const caseNumber = document
      .getElementById("aspirateCaseNumber")
      .value.trim();
    const initials = document
      .getElementById("aspiratePathInitials")
      .value.trim();

    // if (!caseNumber || !initials) {
    //   if (!caseNumber) {
    //     document.getElementById("aspirateCaseNumber").style.border =
    //       "2px solid red";
    //   }
    //   if (!initials) {
    //     document.getElementById("aspiratePathInitials").style.border =
    //       "2px solid red";
    //   }
    //   alert(
    //     "Please enter both the case number and pathologist initials before starting."
    //   );
    //   return;
    // }

    const aspirateApp = document.getElementById("aspirateApp");
    if (!aspirateApp || !aspirateApp.classList.contains("active")) return;

    if (e.key >= "0" && e.key <= "9") {
      const keyNum = parseInt(e.key);
      const idx = keyBindings[keyNum];
      if (typeof idx === "number") handleInput(idx);
    } else if (e.key === "Escape") {
      e.preventDefault();
      aspirateUndoAll();
    }
  });
})();
