<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Aspirate Counter</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js"></script>
  <link rel="stylesheet" href="style.css">
</head>
<body>

    <!-- Waffle Menu -->
  <div class="waffle-menu" id="waffleMenu">
    <a href="Cell_Counter_dev.html">
      <i class="fas fa-flask"></i>
      <span>Research Counter</span>
    </a>
    <a href="Counter_No_Save.html">
      <i class="fas fa-ban"></i>
      <span>Aspirate Counter</span>
    </a>
    <a href="PB_Counter_Full.html">
      <i class="fas fa-tint"></i>
      <span>PB Counter</span>
    </a>
  </div>

  <div class="container" id="appContainer">
    <h2>Aspirate Smear Counter</h2>

    <div class="keypad" id="keypad"></div>

    <div class="remap" id="remapArea"></div>

    <button onclick="resetKeyBindings()">Reset Key Mappings</button>
    <div id="unassignedWarning" style="color: red; font-weight: bold; margin-top: 6px;"></div>


    <div class="counter-display" id="counterDisplay"></div>

    <div><strong>Total:</strong> <span id="totalDisplay">0 / 500</span></div>
    <div><strong>M:E Ratio:</strong> <span id="meRatioDisplay">–</span></div>


    <button onclick="undoLast()">Undo</button>
    <button onclick="undoAll()">Undo All</button>
    <button onclick="exportCaseAsExcel()">Export Case to Excel</button>

    <textarea id="keystrokeLog" readonly></textarea>

    <div id="chartContainer">
      <canvas id="cellChart"></canvas>
    </div>
  </div>

  <script>
    const beep = new Audio('https://actions.google.com/sounds/v1/alarms/beep_short.ogg');
    const chime = new Audio('https://actions.google.com/sounds/v1/alarms/digital_watch_alarm_long.ogg');

    const cellTypes = ["Blasts", "NRBCs", "Eos", "Basos", "Lymphs", "Monos", "Neuts", "Metas", "Myelo", "Plasma"];
    let keyBindings = Array.from({ length: 10 }, (_, i) => i);
    const cellCounts = {};
    let totalCount = 0;
    const MAX_COUNT = 500;
    let history = [];
    const snapshots = {};

    cellTypes.forEach(type => cellCounts[type] = 0);

    const keypad = document.getElementById('keypad');
    const counterDisplay = document.getElementById('counterDisplay');
    const totalDisplay = document.getElementById('totalDisplay');
    const keystrokeLog = document.getElementById('keystrokeLog');
    const remapArea = document.getElementById('remapArea');

    function createKeypad() {
      keypad.innerHTML = '';
      const layout = [
        [7, 8, 9],
        [4, 5, 6],
        [1, 2, 3],
        [null, 0, null]
      ];

      layout.forEach(row => {
        row.forEach(i => {
          const key = document.createElement('div');
          if (i === null) {
            key.style.visibility = 'hidden';
          } else {
            const cellIndex = keyBindings[i];
            key.className = 'key';
            key.textContent = `${i}: ${cellTypes[cellIndex]}`;
            key.onclick = () => handleInput(cellIndex);
          }
          keypad.appendChild(key);
        });
      });
    }


    function createRemapArea() {
      remapArea.innerHTML = `
        <details>
          <summary><strong>Customize Key Mappings</strong></summary>
          <div style="margin-top: 10px;">
            <h4>Drag cell types onto number keys:</h4>
            <div id="dragArea" style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px;"></div>
            <div id="dropArea" style="display: flex; flex-wrap: wrap; gap: 6px;"></div>
          </div>
        </details>
      `;


      const dragArea = document.getElementById('dragArea');
      const dropArea = document.getElementById('dropArea');

      const assignedIndexes = new Set(keyBindings);

      cellTypes.forEach((type, idx) => {
        const dragItem = document.createElement('div');
        dragItem.className = 'key draggable';
        dragItem.textContent = type;
        dragItem.draggable = true;
        dragItem.dataset.index = idx;

        if (!assignedIndexes.has(idx)) {
          dragItem.classList.add('unassigned');
        }

        dragItem.ondragstart = (e) => {
          e.dataTransfer.setData("text/plain", e.target.dataset.index);
        };

        dragArea.appendChild(dragItem);
      });

      for (let i = 0; i <= 9; i++) {
        const dropSlot = document.createElement('div');
        dropSlot.className = 'key dropzone';
        dropSlot.textContent = `${i}: ${cellTypes[keyBindings[i]]}`;
        dropSlot.dataset.key = i;

        dropSlot.ondragover = (e) => e.preventDefault();
        dropSlot.ondrop = (e) => {
          e.preventDefault();
          const typeIndex = parseInt(e.dataTransfer.getData("text/plain"));
          const keyIndex = parseInt(e.currentTarget.dataset.key);
          keyBindings[keyIndex] = typeIndex;
          createRemapArea();
          createKeypad();
        };

        // Update unassigned warning
        const unassigned = cellTypes.filter((_, idx) => !assignedIndexes.has(idx));
        const warningDiv = document.getElementById('unassignedWarning');
        if (unassigned.length > 0) {
          warningDiv.textContent = `Warning: Unassigned cell types: ${unassigned.join(', ')}`;
        } else {
          warningDiv.textContent = '';
        }


        dropArea.appendChild(dropSlot);
      }
    }

    function updateDisplay() {
        counterDisplay.innerHTML = '';
        cellTypes.forEach(type => {
          const percent = totalCount > 0 ? ((cellCounts[type] / totalCount) * 100).toFixed(1) : '0.0';
          const row = document.createElement('div');
          row.innerHTML = `<span>${type}</span><span>${cellCounts[type]} (${percent}%)</span>`;
          counterDisplay.appendChild(row);
        });
        totalDisplay.textContent = `${totalCount} / ${MAX_COUNT}`;
        keystrokeLog.value = history.map(h => cellTypes.indexOf(h)).join('');
        updateChart();

        // M:E Ratio
        const meRatioDisplay = document.getElementById('meRatioDisplay');
        const eos = cellCounts["Eos"];
        const basos = cellCounts["Basos"];
        const neuts = cellCounts["Neuts"];
        const metas = cellCounts["Metas"];
        const myelos = cellCounts["Myelo"];
        const nrbc = cellCounts["NRBCs"];
        const meNumerator = eos + basos + neuts + metas + myelos;
        const meRatio = nrbc > 0 ? (meNumerator / nrbc).toFixed(2) : '–';
        meRatioDisplay.textContent = meRatio;
    }


    function handleInput(index) {
      const type = cellTypes[index];
      cellCounts[type]++;
      totalCount++;
      history.push(type);
      if (totalCount % 50 === 0) snapshotCounts(totalCount);
      if (totalCount % 100 === 0) beep.play();
      if (totalCount === 500) exportCaseAsExcel();
      updateDisplay();
    }

    function snapshotCounts(count) {
      const snapshot = cellTypes.map(type => ({
        CellType: type,
        Count: cellCounts[type],
        Percent: count > 0 ? ((cellCounts[type] / count) * 100).toFixed(1) + '%' : '0.0%'
      }));
      snapshots[`Count_${count}`] = snapshot;
    }

    function undoLast() {
      if (history.length === 0) return;
      const last = history.pop();
      cellCounts[last]--;
      totalCount--;
      updateDisplay();
    }

    function undoAll() {
      cellTypes.forEach(type => cellCounts[type] = 0);
      totalCount = 0;
      history = [];
      for (let k in snapshots) delete snapshots[k];
      updateDisplay();
    }

    function editKeystrokeLog(value) {
      undoAll();
      for (let char of value) {
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
    }

    function resetKeyBindings() {
      keyBindings = Array.from({ length: 10 }, (_, i) => i);
      createRemapArea();
      createKeypad();
    }


    const ctx = document.getElementById('cellChart').getContext('2d');
    const chart = new Chart(ctx, {
      type: 'pie',
      data: {
        labels: cellTypes,
        datasets: [{
          data: cellTypes.map(type => cellCounts[type]),
          backgroundColor: [
            '#00000','#660202','#e6194b','#911eb4','#f58231','#4363d8','#46f0f0','#f032e6','#bcf60c','#fabebe'
          ]
        }]
      },
      options: {
        plugins: {
          legend: { position: 'right' },
          tooltip: {
            callbacks: {
              label: function(context) {
                const total = context.dataset.data.reduce((a,b) => a + b, 0);
                const value = context.raw;
                const percent = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                return `${context.label}: ${value} (${percent}%)`;
              }
            }
          },
          title: {
            display: true,
            text: 'Cell Distribution'
          }
        }
      }
    });

    function updateChart() {
      chart.data.datasets[0].data = cellTypes.map(type => cellCounts[type]);
      chart.update();
    }

    function exportCaseAsExcel() {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const workbook = XLSX.utils.book_new();

      Object.keys(snapshots).forEach(label => {
        const ws = XLSX.utils.json_to_sheet(snapshots[label]);
        XLSX.utils.book_append_sheet(workbook, ws, label);
      });

      const wbout = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
      const blob = new Blob([wbout], { type: 'application/octet-stream' });
      saveAs(blob, `Aspirate_Case_${timestamp}.xlsx`);
    }

    // Initialize
    createKeypad();
    createRemapArea();
    updateDisplay();

    document.addEventListener('keydown', e => {
      if (e.key >= '0' && e.key <= '9') {
        const keyNum = parseInt(e.key);
        const idx = keyBindings[keyNum];
        if (typeof idx === 'number') handleInput(idx);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        undoLast();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        undoAll();
      }
    });
  </script>
</body>
</html>
