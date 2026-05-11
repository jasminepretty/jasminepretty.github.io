import { addWaterLog, getWaterLogs, getWaterLogsRange, deleteWaterLog } from './db.js';
import { showToast, showLoading, hideLoading, getGoals } from './app.js';
import { todayStr } from './db.js';

let _uid = null;
let _todayLogs = [];
let _customModal = null;
let _weekChart = null;

export async function initWater(uid) {
  _uid = uid;
  _customModal = new bootstrap.Modal(document.getElementById('modal-custom-water'));

  document.querySelectorAll('.water-add-btn').forEach(btn => {
    btn.onclick = () => {
      const ml = btn.dataset.ml;
      if (ml === 'custom') {
        document.getElementById('custom-water-ml').value = '';
        _customModal.show();
      } else {
        addWater(Number(ml));
      }
    };
  });

  document.getElementById('btn-save-custom-water').onclick = () => {
    const ml = Number(document.getElementById('custom-water-ml').value);
    if (!ml || ml <= 0) { showToast('請輸入有效的喝水量', 'warning'); return; }
    _customModal.hide();
    addWater(ml);
  };

  window._deleteWater = deleteWaterEntry;
  await loadWater();
}

async function loadWater() {
  showLoading();
  try {
    const today = todayStr();
    _todayLogs = await getWaterLogs(_uid, today);
    renderRing();
    renderLogList();
    await renderWeekChart();
  } finally {
    hideLoading();
  }
}

function getTotalMl() {
  return _todayLogs.reduce((s, l) => s + (l.amountMl || 0), 0);
}

function renderRing() {
  const goals = getGoals();
  const total = getTotalMl();
  const goalMl = goals.dailyWaterMl || 2000;
  const pct = Math.min(100, Math.round((total / goalMl) * 100));
  const circumference = 2 * Math.PI * 52;
  const dash = (pct / 100) * circumference;

  document.getElementById('water-current').textContent = total;
  document.getElementById('water-goal-text').textContent = `目標：${goalMl} ml（${pct}%）`;
  document.getElementById('water-big-ring').setAttribute('stroke-dasharray', `${dash.toFixed(1)} ${circumference.toFixed(1)}`);
}

function renderLogList() {
  const container = document.getElementById('water-log-list');
  if (_todayLogs.length === 0) {
    container.innerHTML = '<p class="text-muted small text-center py-2">今天還沒有喝水紀錄</p>';
    return;
  }
  container.innerHTML = _todayLogs.slice().reverse().map(log => {
    const time = log.timestamp?.toDate ? log.timestamp.toDate().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) : '--:--';
    return `
      <div class="water-log-item">
        <span class="water-log-time">${time}</span>
        <span class="water-log-amount">${log.amountMl} ml</span>
        <button class="water-log-del" onclick="window._deleteWater('${log.id}')">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>`;
  }).join('');
}

async function addWater(ml) {
  showLoading();
  try {
    const today = todayStr();
    await addWaterLog(_uid, ml, today);
    _todayLogs = await getWaterLogs(_uid, today);
    renderRing();
    renderLogList();
    const goals = getGoals();
    const total = getTotalMl();
    if (total >= goals.dailyWaterMl) showToast('達成今日喝水目標！💧', 'success');
    else showToast(`已記錄 ${ml} ml`);
    await renderWeekChart();
  } finally {
    hideLoading();
  }
}

async function deleteWaterEntry(logId) {
  if (!confirm('確定要刪除這筆紀錄嗎？')) return;
  showLoading();
  try {
    const today = todayStr();
    await deleteWaterLog(_uid, logId, today);
    _todayLogs = _todayLogs.filter(l => l.id !== logId);
    renderRing();
    renderLogList();
    showToast('已刪除');
  } finally {
    hideLoading();
  }
}

async function renderWeekChart() {
  const dates = [];
  const labels = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
    labels.push(`${d.getMonth() + 1}/${d.getDate()}`);
  }

  const totalsMap = await getWaterLogsRange(_uid, dates);
  const data = dates.map(d => totalsMap[d] || 0);
  const goals = getGoals();
  const goalMl = goals.dailyWaterMl || 2000;

  const canvas = document.getElementById('chart-water-week');
  if (_weekChart) _weekChart.destroy();
  _weekChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: data.map(v => v >= goalMl ? '#2196F3' : '#90CAF9'),
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { font: { size: 9 } },
          grid: { color: '#f0f0f0' }
        },
        x: { ticks: { font: { size: 9 } } }
      }
    }
  });
}
