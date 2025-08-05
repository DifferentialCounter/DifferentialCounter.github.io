// aspirate.js
(function renderAspirate(containerId = "aspirateContainer") {
  const container = document.getElementById(containerId);
  container.innerHTML = `
    <h2>Aspirate Smear Counter</h2>
    <div style="margin-bottom: 16px;">
        <label for="aspirateCaseNumber"><strong>Case Number:</strong></label>
        <input type="text" id="aspirateCaseNumber" style="margin-right: 20px; width: 120px;">
        <label for="aspiratePathInitials"><strong>Pathologist Initials:</strong></label>
        <input type="text" id="aspiratePathInitials" style="width: 80px;">
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
      Object.assign(cellCounts, state.cellCounts);
      totalCount = state.totalCount || 0;
      history = state.history || [];
      keyBindings = state.keyBindings || keyBindings;
    } catch (e) {
      console.error("Failed to load Aspirate state:", e);
    }
  }

  function saveState() {
    const state = { cellCounts, totalCount, history, keyBindings };
    localStorage.setItem("aspirateState", JSON.stringify(state));
  }

  function snapshotCounts(count) {
    const snap = cellTypes.map((type) => ({
      CellType: type,
      Count: cellCounts[type],
      Percent:
        count > 0
          ? ((cellCounts[type] / count) * 100).toFixed(1) + "%"
          : "0.0%",
    }));
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
    counterDisplay.innerHTML = "";
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

    displayOrder.forEach((type) => {
      if (type === "Neuts and Precursors") {
        const sum =
          cellCounts["Neuts"] + cellCounts["Metas"] + cellCounts["Myelo"];
        const percent =
          totalCount > 0 ? ((sum / totalCount) * 100).toFixed(1) : "0.0";
        const row = document.createElement("div");
        row.innerHTML = `<span>${type}</span><span> - ${sum} (${percent}%)</span>`;
        counterDisplay.appendChild(row);

        const subRow = document.createElement("div");
        subRow.style.fontSize = "0.95em";
        subRow.style.marginLeft = "1em";
        subRow.innerHTML = `
            <span style="color:#4363d8;">Neuts: ${cellCounts["Neuts"]}</span>
            <span style="margin-left:1em;color:#f58231;">Metas: ${cellCounts["Metas"]}</span>
            <span style="margin-left:1em;color:#46f0f0;">Myelo: ${cellCounts["Myelo"]}</span>
        `;
        counterDisplay.appendChild(subRow);
      } else {
        const percent =
          totalCount > 0
            ? ((cellCounts[type] / totalCount) * 100).toFixed(1)
            : "0.0";
        const row = document.createElement("div");
        row.innerHTML = `<span>${type}</span><span> - ${cellCounts[type]} (${percent}%)</span>`;
        counterDisplay.appendChild(row);
      }
    });

    totalDisplay.textContent = `${totalCount} / ${MAX_COUNT}`;

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
    ratioDisplay.textContent = meRatio;

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
    const caseNumber =
      document.getElementById("aspirateCaseNumber").value.trim() || "Case";
    const initials =
      document.getElementById("aspiratePathInitials").value.trim() || "Path";
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
    // Reset counts and history, but DO NOT clear the textbox!
    cellTypes.forEach((type) => (cellCounts[type] = 0));
    totalCount = 0;
    history = [];
    for (let char of log.value) {
      const keyNum = parseInt(char);
      if (!isNaN(keyNum) && keyNum >= 0 && keyNum <= 9) {
        const idx = keyBindings[keyNum];
        const type = cellTypes[idx];
        cellCounts[type]++;
        totalCount++;
        history.push(type);
        if (totalCount % 50 === 0) snapshotCounts(totalCount);
      }
    }
    updateDisplay();
    saveState();

    if (totalCount === 500) {
      chime.play();
      aspirateExportExcel();
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

  document.addEventListener("keydown", (e) => {
    if (document.activeElement === log) return;
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
