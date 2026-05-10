import { getFoodLogs, getWaterLogs, getExerciseLogs, getWeightLogs, getFriends, subscribeToFriendStats } from './db.js';
import { getGoals } from './app.js';
import { todayStr } from './db.js';

let _macroChart = null;
let _weightChart = null;
let _friendUnsubs = [];

export async function initDashboard(uid) {
  // Date display
  const today = new Date();
  document.getElementById('dashboard-date').textContent =
    today.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'long' });

  const todayDate = todayStr();

  // Load all data in parallel
  const [foods, waterLogs, exerciseLogs, weightLogs] = await Promise.all([
    getFoodLogs(uid, todayDate),
    getWaterLogs(uid, todayDate),
    getExerciseLogs(uid, todayDate),
    getWeightLogs(uid, 7)
  ]);

  const goals = getGoals();

  // Totals
  const totalCal = foods.reduce((s, f) => s + (f.calories || 0), 0);
  const totalWater = waterLogs.reduce((s, w) => s + (w.amountMl || 0), 0);
  const totalExMin = exerciseLogs.reduce((s, e) => s + (e.durationMinutes || 0), 0);

  renderRing('ring-cal-val', 'ring-calories-fg', 'ring-cal-sub',
    totalCal, goals.dailyCalories, `/ ${goals.dailyCalories} kcal`);
  renderRing('ring-water-val', 'ring-water-fg', 'ring-water-sub',
    totalWater, goals.dailyWaterMl, `/ ${goals.dailyWaterMl} ml`);
  renderRingSimple('ring-ex-val', 'ring-exercise-fg', totalExMin, 60);

  renderMacroDoughnut(foods);
  renderWeightSparkline(weightLogs);
  await renderFriendFeed(uid, todayDate);
}

export function cleanupDashboard() {
  _friendUnsubs.forEach(unsub => unsub());
  _friendUnsubs = [];
}

function renderRing(valId, fgClass, subId, current, goal, subText) {
  const pct = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;
  const circumference = 2 * Math.PI * 15.9;
  const dash = (pct / 100) * circumference;
  document.getElementById(valId).textContent = current > 999 ? `${(current/1000).toFixed(1)}k` : current;
  document.querySelector(`.${fgClass}`).setAttribute('stroke-dasharray', `${dash.toFixed(1)} ${circumference.toFixed(1)}`);
  if (subId) document.getElementById(subId).textContent = subText;
}

function renderRingSimple(valId, fgClass, current, goal) {
  const pct = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;
  const circumference = 2 * Math.PI * 15.9;
  const dash = (pct / 100) * circumference;
  document.getElementById(valId).textContent = current;
  document.querySelector(`.${fgClass}`).setAttribute('stroke-dasharray', `${dash.toFixed(1)} ${circumference.toFixed(1)}`);
}

function renderMacroDoughnut(foods) {
  const protein = foods.reduce((s, f) => s + (f.protein || 0), 0);
  const carbs = foods.reduce((s, f) => s + (f.carbs || 0), 0);
  const fat = foods.reduce((s, f) => s + (f.fat || 0), 0);
  const total = protein + carbs + fat;

  const canvas = document.getElementById('chart-macros');
  if (_macroChart) _macroChart.destroy();

  if (total === 0) {
    _macroChart = new Chart(canvas, {
      type: 'doughnut',
      data: { datasets: [{ data: [1], backgroundColor: ['#e9ecef'] }] },
      options: { plugins: { legend: { display: false } }, cutout: '70%' }
    });
    document.getElementById('macros-legend').innerHTML =
      '<div class="text-muted small text-center">尚無飲食紀錄</div>';
    return;
  }

  _macroChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      datasets: [{
        data: [protein, carbs, fat],
        backgroundColor: ['#4CAF50', '#2196F3', '#FF9800'],
        borderWidth: 0
      }]
    },
    options: { plugins: { legend: { display: false } }, cutout: '65%' }
  });

  document.getElementById('macros-legend').innerHTML = [
    ['#4CAF50', `蛋白質 ${protein}g`],
    ['#2196F3', `碳水 ${carbs}g`],
    ['#FF9800', `脂肪 ${fat}g`]
  ].map(([color, label]) =>
    `<div class="macros-legend-item">
      <div class="macros-legend-dot" style="background:${color}"></div>${label}
    </div>`
  ).join('');
}

function renderWeightSparkline(weightLogs) {
  const canvas = document.getElementById('chart-weight');
  if (_weightChart) _weightChart.destroy();

  if (weightLogs.length === 0) {
    document.getElementById('weight-no-data').classList.remove('d-none');
    return;
  }
  document.getElementById('weight-no-data').classList.add('d-none');

  const labels = weightLogs.map(l => {
    const d = new Date(l.date);
    return `${d.getMonth()+1}/${d.getDate()}`;
  });
  const data = weightLogs.map(l => l.weightKg);

  _weightChart = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data,
        borderColor: '#E91E63',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.3
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { font: { size: 8 } }, grid: { color: '#f0f0f0' } },
        x: { ticks: { font: { size: 8 }, maxTicksLimit: 4 } }
      }
    }
  });
}

async function renderFriendFeed(uid, date) {
  const feed = document.getElementById('friend-feed');

  let friends;
  try {
    friends = await getFriends(uid);
  } catch (_) {
    friends = [];
  }

  if (friends.length === 0) {
    feed.innerHTML = `<div class="text-muted small text-center py-3">
      尚未新增好友，<button class="btn btn-link btn-sm p-0" onclick="app.navigate('friends')">立即邀請朋友</button>
    </div>`;
    return;
  }

  feed.innerHTML = friends.map(f =>
    `<div class="friend-feed-item" id="feed-${f.uid}">
      <div class="friend-avatar">${(f.displayName || '?')[0].toUpperCase()}</div>
      <div class="flex-grow-1">
        <div class="friend-feed-name">${escHtml(f.displayName || '朋友')}</div>
        <div class="friend-feed-stats" id="feed-stats-${f.uid}">載入中...</div>
      </div>
      <div class="friend-feed-badges" id="feed-badges-${f.uid}"></div>
    </div>`
  ).join('');

  friends.forEach(friend => {
    const unsub = subscribeToFriendStats(friend.uid, date, stats => {
      updateFriendFeedItem(friend.uid, stats);
    });
    _friendUnsubs.push(unsub);
  });
}

function updateFriendFeedItem(friendUid, stats) {
  const statsEl = document.getElementById(`feed-stats-${friendUid}`);
  const badgesEl = document.getElementById(`feed-badges-${friendUid}`);
  if (!statsEl) return;

  if (!stats || stats.isPublicToFriends === false) {
    statsEl.textContent = '（資料未公開）';
    badgesEl.innerHTML = '';
    return;
  }

  statsEl.textContent = `熱量 ${stats.totalCalories || 0} kcal・水 ${stats.totalWaterMl || 0} ml・運動 ${stats.totalExerciseMinutes || 0} 分`;
  badgesEl.innerHTML = `
    ${stats.calorieGoalMet ? '<span class="badge bg-success" title="達到熱量目標">🔥</span>' : '<span class="badge bg-light text-muted" title="未達熱量目標">🔥</span>'}
    ${stats.waterGoalMet ? '<span class="badge bg-primary" title="達到喝水目標">💧</span>' : '<span class="badge bg-light text-muted" title="未達喝水目標">💧</span>'}
  `;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
