// pb.js
(function renderPB(containerId = "pbContainer") {
  const container = document.getElementById(containerId);
  container.innerHTML = `
    <h2>Peripheral Blood Smear Counter</h2>
    <div class="keypad" id="pbKeypad"></div>
    <div class="remap" id="pbRemap"></div>
    <div id="pbUnassignedWarning" style="color: red; font-weight: bold; margin-top: 6px;"></div>
    <div class="counter-display" id="pbDisplay"></div>
    <div><strong>Total (excluding NRBCs):</strong> <span id="pbTotal">0 / 200</span></div>
    <div><strong>NRBCs counted separately:</strong> <span id="pbNRBC">0</span></div>
    <button onclick="pbUndoAll()">Undo All</button>
    <textarea id="pbLog"></textarea>
    <div id="pbChartContainer">
      <canvas id="pbChart"></canvas>
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
    "Promyelo",
  ];
  let keyBindings = [0, 1, 2, 3, 6, 4, 5, 7, 8, 9];
  const cellCounts = {};
  let totalCount_PB = 0;
  let nrbcCount = 0;
  let history = [];
  const snapshots = {};
  const MAX_COUNT = 200;

  cellTypes.forEach((type) => (cellCounts[type] = 0));

  const keypad = document.getElementById("pbKeypad");
  const counterDisplay = document.getElementById("pbDisplay");
  const totalDisplay = document.getElementById("pbTotal");
  const nrbcDisplay = document.getElementById("pbNRBC");
  const log = document.getElementById("pbLog");
  const remapArea = document.getElementById("pbRemap");
  const warning = document.getElementById("pbUnassignedWarning");

  function loadState() {
    const saved = localStorage.getItem("pbState");
    if (!saved) return;
    try {
      const state = JSON.parse(saved);
      Object.assign(cellCounts, state.cellCounts);
      totalCount_PB = state.totalCount_PB || 0;
      history = state.history || [];
      nrbcCount = state.nrbcCount || 0;
      keyBindings = state.keyBindings || keyBindings;
    } catch (e) {
      console.error("Failed to load PB state:", e);
    }
  }

  function saveState() {
    const state = {
      cellCounts,
      totalCount_PB,
      history,
      nrbcCount,
      keyBindings,
    };
    localStorage.setItem("pbState", JSON.stringify(state));
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
      "Promyelo",
      "Myelo",
      "Metas",
      "Neuts",
      "Lymphs",
      "Monos",
      "Eos",
      "Basos",
    ];
    displayOrder.forEach((type) => {
      const count = cellCounts[type] || 0;
      const percent =
        totalCount_PB > 0 ? ((count / totalCount_PB) * 100).toFixed(1) : "0.0";
      const row = document.createElement("div");
      row.innerHTML = `<span>${type}</span><span> - ${count} (${percent}%)</span>`;
      counterDisplay.appendChild(row);
    });
    const nrbcRow = document.createElement("div");
    nrbcRow.innerHTML = `<span>NRBCs</span><span> - ${nrbcCount}</span>`;
    counterDisplay.appendChild(nrbcRow);

    totalDisplay.textContent = `${totalCount_PB} / ${MAX_COUNT}`;
    nrbcDisplay.textContent = nrbcCount;

    updateChart();
  }

  function handleInput(index) {
    const type = cellTypes[index];
    cellCounts[type]++;
    history.push(type);
    if (type === "NRBCs") {
      nrbcCount++;
    } else {
      totalCount_PB++;
    }

    clickSound.currentTime = 0;
    clickSound.play();

    if (totalCount_PB === MAX_COUNT) {
      chime.play();
    } else if (totalCount_PB % 100 === 0) {
      beep.play();
    }

    updateDisplay();
    saveState();
  }

  function createRemapArea() {
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

  window.pbUndoAll = function () {
    for (let type in cellCounts) cellCounts[type] = 0;
    history = [];
    totalCount_PB = 0;
    nrbcCount = 0;
    log.value = "";
    updateDisplay();
    saveState();
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
  });

  const ctx = document.getElementById("pbChart").getContext("2d");
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
      pbUndoAll();
    }
  });
})();
