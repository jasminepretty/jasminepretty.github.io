import { addWeightLog, getWeightLogs, deleteWeightLog } from './db.js';
import { showToast, showLoading, hideLoading, getProfile } from './app.js';
import { todayStr } from './db.js';

let _uid = null;
let _logs = [];
let _weightModal = null;
let _weightChart = null;

export async function initWeight(uid) {
  _uid = uid;
  _weightModal = new bootstrap.Modal(document.getElementById('modal-add-weight'));

  document.getElementById('btn-add-weight').onclick = openModal;
  document.getElementById('btn-save-weight').onclick = saveWeight;
  window._deleteWeight = deleteEntry;

  await loadWeights();
}

async function loadWeights() {
  showLoading();
  try {
    _logs = await getWeightLogs(_uid, 30);
    renderCurrentWeight();
    renderChart();
    renderLogList();
  } finally {
    hideLoading();
  }
}

function renderCurrentWeight() {
  if (_logs.length === 0) {
    document.getElementById('weight-current-val').textContent = '--';
    document.getElementById('bmi-display').classList.add('d-none');
    return;
  }
  const latest = _logs[_logs.length - 1];
  document.getElementById('weight-current-val').textContent = latest.weightKg.toFixed(1);

  const profile = getProfile();
  const heightCm = profile?.heightCm;
  if (heightCm && heightCm > 0) {
    const heightM = heightCm / 100;
    const bmi = latest.weightKg / (heightM * heightM);
    document.getElementById('bmi-val').textContent = bmi.toFixed(1);
    const bmiEl = document.getElementById('bmi-display');
    const catEl = document.getElementById('bmi-category');
    bmiEl.classList.remove('d-none');
    if (bmi < 18.5) { catEl.textContent = '體重過輕'; catEl.className = 'badge bg-info ms-1'; }
    else if (bmi < 24) { catEl.textContent = '正常體重'; catEl.className = 'badge bg-success ms-1'; }
    else if (bmi < 27) { catEl.textContent = '體重過重'; catEl.className = 'badge bg-warning ms-1'; }
    else { catEl.textContent = '肥胖'; catEl.className = 'badge bg-danger ms-1'; }
  } else {
    document.getElementById('bmi-display').classList.add('d-none');
  }
}

function renderChart() {
  const canvas = document.getElementById('chart-weight-30');
  if (_logs.length === 0) {
    if (_weightChart) { _weightChart.destroy(); _weightChart = null; }
    return;
  }

  const labels = _logs.map(l => {
    const d = new Date(l.date);
    return `${d.getMonth()+1}/${d.getDate()}`;
  });
  const data = _logs.map(l => l.weightKg);

  if (_weightChart) _weightChart.destroy();
  _weightChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: '#E91E63',
        backgroundColor: 'rgba(233,30,99,0.1)',
        fill: true,
        tension: 0.3,
        pointRadius: _logs.length > 14 ? 2 : 4,
        pointBackgroundColor: '#E91E63'
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          ticks: { font: { size: 9 } },
          grid: { color: '#f0f0f0' }
        },
        x: {
          ticks: {
            font: { size: 9 },
            maxTicksLimit: 7,
            maxRotation: 0
          }
        }
      }
    }
  });
}

function renderLogList() {
  const container = document.getElementById('weight-log-list');
  if (_logs.length === 0) {
    container.innerHTML = '<p class="text-muted small text-center py-3">尚無體重紀錄</p>';
    return;
  }
  container.innerHTML = _logs.slice().reverse().map(log => `
    <div class="weight-log-item">
      <span class="weight-log-date">${log.date}</span>
      <span class="weight-log-val">${log.weightKg.toFixed(1)} kg
        ${log.bodyFatPct ? `<small class="text-muted">（體脂 ${log.bodyFatPct}%）</small>` : ''}
      </span>
      <button class="weight-log-del" onclick="window._deleteWeight('${log.id}')">
        <i class="bi bi-x-lg"></i>
      </button>
    </div>`).join('');
}

function openModal() {
  document.getElementById('w-kg').value = '';
  document.getElementById('w-fat').value = '';
  document.getElementById('w-notes').value = '';
  _weightModal.show();
}

async function saveWeight() {
  const kg = parseFloat(document.getElementById('w-kg').value);
  if (!kg || kg < 20 || kg > 300) { showToast('請填寫有效的體重', 'warning'); return; }

  const entry = {
    date: todayStr(),
    weightKg: kg,
    bodyFatPct: parseFloat(document.getElementById('w-fat').value) || null,
    notes: document.getElementById('w-notes').value.trim() || null
  };

  showLoading();
  try {
    await addWeightLog(_uid, entry);
    _weightModal.hide();
    _logs = await getWeightLogs(_uid, 30);
    renderCurrentWeight();
    renderChart();
    renderLogList();
    showToast('已記錄體重');
  } catch (e) {
    showToast('儲存失敗，請再試一次', 'error');
  } finally {
    hideLoading();
  }
}

async function deleteEntry(logId) {
  if (!confirm('確定要刪除這筆紀錄嗎？')) return;
  showLoading();
  try {
    await deleteWeightLog(_uid, logId);
    _logs = _logs.filter(l => l.id !== logId);
    renderCurrentWeight();
    renderChart();
    renderLogList();
    showToast('已刪除');
  } finally {
    hideLoading();
  }
}
