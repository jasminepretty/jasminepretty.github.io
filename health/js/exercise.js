import { addExerciseLog, getExerciseLogs, getExerciseLogsRange, deleteExerciseLog } from './db.js';
import { showToast, showLoading, hideLoading } from './app.js';
import { todayStr } from './db.js';

const CATEGORY_ICONS = {
  cardio: '🏃',
  strength: '🏋️',
  flexibility: '🧘',
  sport: '⚽',
  other: '💪'
};
const CATEGORY_LABELS = {
  cardio: '有氧', strength: '重訓', flexibility: '柔軟', sport: '球類', other: '其他'
};

let _uid = null;
let _currentDate = todayStr();
let _logs = [];
let _exModal = null;
let _weekChart = null;

export async function initExercise(uid) {
  _uid = uid;
  _currentDate = todayStr();
  document.getElementById('ex-date').value = _currentDate;
  _exModal = new bootstrap.Modal(document.getElementById('modal-add-exercise'));

  document.getElementById('ex-prev-day').onclick = () => shiftDay(-1);
  document.getElementById('ex-next-day').onclick = () => shiftDay(1);
  document.getElementById('ex-date').onchange = e => { _currentDate = e.target.value; loadDay(); };
  document.getElementById('btn-add-exercise').onclick = openModal;
  document.getElementById('btn-save-exercise').onclick = saveExercise;

  window._deleteExercise = deleteEntry;
  await loadDay();
}

function shiftDay(delta) {
  const d = new Date(_currentDate);
  d.setDate(d.getDate() + delta);
  _currentDate = d.toISOString().slice(0, 10);
  document.getElementById('ex-date').value = _currentDate;
  loadDay();
}

async function loadDay() {
  showLoading();
  try {
    _logs = await getExerciseLogs(_uid, _currentDate);
    renderList();
    await renderWeekChart();
  } finally {
    hideLoading();
  }
}

function renderList() {
  const container = document.getElementById('exercise-log-list');
  if (_logs.length === 0) {
    container.innerHTML = '<p class="text-muted small text-center py-3">今天還沒有運動紀錄<br><small>加油！動起來 💪</small></p>';
    return;
  }
  const totalMins = _logs.reduce((s, l) => s + (l.durationMinutes || 0), 0);
  const totalCal = _logs.reduce((s, l) => s + (l.caloriesBurned || 0), 0);
  container.innerHTML = `
    <div class="d-flex gap-3 mb-2 small text-muted">
      <span>共 ${totalMins} 分鐘</span>
      ${totalCal ? `<span>消耗 ${totalCal} kcal</span>` : ''}
    </div>
    ${_logs.map(log => `
      <div class="exercise-item">
        <div class="exercise-icon">${CATEGORY_ICONS[log.category] || '💪'}</div>
        <div class="flex-grow-1">
          <div class="exercise-name">${escHtml(log.name)}</div>
          <div class="exercise-meta">
            ${CATEGORY_LABELS[log.category] || '其他'}・${log.durationMinutes} 分鐘
            ${log.caloriesBurned ? `・消耗 ${log.caloriesBurned} kcal` : ''}
            ${log.notes ? `・${escHtml(log.notes)}` : ''}
          </div>
        </div>
        <button class="exercise-del" onclick="window._deleteExercise('${log.id}')">
          <i class="bi bi-x-lg"></i>
        </button>
      </div>`).join('')}`;
}

function openModal() {
  document.getElementById('ex-name').value = '';
  document.getElementById('ex-category').value = 'cardio';
  document.getElementById('ex-duration').value = '';
  document.getElementById('ex-calories').value = '';
  document.getElementById('ex-notes').value = '';
  _exModal.show();
}

async function saveExercise() {
  const name = document.getElementById('ex-name').value.trim();
  const duration = Number(document.getElementById('ex-duration').value);
  if (!name) { showToast('請填寫運動名稱', 'warning'); return; }
  if (!duration || duration <= 0) { showToast('請填寫運動時間', 'warning'); return; }

  const entry = {
    date: _currentDate,
    name,
    category: document.getElementById('ex-category').value,
    durationMinutes: duration,
    caloriesBurned: Number(document.getElementById('ex-calories').value) || 0,
    notes: document.getElementById('ex-notes').value.trim() || null
  };

  showLoading();
  try {
    await addExerciseLog(_uid, entry);
    _exModal.hide();
    _logs = await getExerciseLogs(_uid, _currentDate);
    renderList();
    await renderWeekChart();
    showToast('已記錄運動！💪');
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
    await deleteExerciseLog(_uid, logId, _currentDate);
    _logs = _logs.filter(l => l.id !== logId);
    renderList();
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
  const minutesMap = await getExerciseLogsRange(_uid, dates);
  const data = dates.map(d => minutesMap[d] || 0);

  const canvas = document.getElementById('chart-exercise-week');
  if (_weekChart) _weekChart.destroy();
  _weekChart = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: data.map(v => v > 0 ? '#FF9800' : '#FFE0B2'),
        borderRadius: 4
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, ticks: { font: { size: 9 } }, grid: { color: '#f0f0f0' } },
        x: { ticks: { font: { size: 9 } } }
      }
    }
  });
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
