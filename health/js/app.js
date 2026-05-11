import { initDashboard, cleanupDashboard } from './dashboard.js';
import { initFood } from './food.js';
import { initWater } from './water.js';
import { initExercise } from './exercise.js';
import { initWeight } from './weight.js';
import { initFriends } from './friends.js';
import { getUserProfile, updateUserGoals } from './db.js';

const SCREEN_TITLES = {
  dashboard: '首頁',
  food: '飲食日誌',
  water: '喝水追蹤',
  exercise: '運動紀錄',
  weight: '體重紀錄',
  friends: '好友管理',
  settings: '個人設定'
};

let currentScreen = 'dashboard';
let currentUser = null;
let userProfile = null;

// ===== Global Toast =====
let _toastInstance = null;
export function showToast(msg, type = 'success') {
  const toastEl = document.getElementById('app-toast');
  const body = document.getElementById('toast-body');
  body.textContent = msg;
  toastEl.className = `toast align-items-center border-0 text-white bg-${type === 'error' ? 'danger' : type === 'warning' ? 'warning' : 'success'}`;
  if (!_toastInstance) _toastInstance = new bootstrap.Toast(toastEl, { delay: 2500 });
  _toastInstance.show();
}

// ===== Loading =====
export function showLoading() { document.getElementById('loading-overlay').classList.remove('d-none'); }
export function hideLoading() { document.getElementById('loading-overlay').classList.add('d-none'); }

// ===== User Profile Cache =====
export function getUser() { return currentUser; }
export function getProfile() { return userProfile; }
export function getGoals() {
  return userProfile?.goals || {
    dailyCalories: 1800,
    dailyProtein: 60,
    dailyCarbs: 250,
    dailyFat: 65,
    dailyWaterMl: 2000
  };
}

// ===== Auth State Handler (called by auth.js) =====
export function onUserReady(user) {
  currentUser = user;
  if (user) {
    document.getElementById('screen-auth').classList.add('d-none');
    document.getElementById('app-shell').classList.remove('d-none');
    loadProfileAndNavigate();
  } else {
    document.getElementById('screen-auth').classList.remove('d-none');
    document.getElementById('app-shell').classList.add('d-none');
    currentScreen = 'dashboard';
  }
}

async function loadProfileAndNavigate() {
  try {
    userProfile = await getUserProfile(currentUser.uid);
  } catch (_) {
    userProfile = null;
  }
  navigateTo('dashboard');
}

// ===== Navigation =====
export function navigate(screen) { navigateTo(screen); }

function navigateTo(screen) {
  if (!SCREEN_TITLES[screen]) screen = 'dashboard';

  if (currentScreen === 'dashboard') cleanupDashboard();

  document.querySelectorAll('.app-screen').forEach(el => el.classList.add('d-none'));
  document.getElementById(`screen-${screen}`).classList.remove('d-none');

  document.getElementById('app-bar-title').textContent = SCREEN_TITLES[screen];

  const backBtn = document.getElementById('btn-back');
  const settingsBtn = document.getElementById('btn-settings');
  if (screen === 'friends' || screen === 'settings') {
    backBtn.classList.remove('d-none');
    settingsBtn.classList.add('d-none');
  } else {
    backBtn.classList.add('d-none');
    settingsBtn.classList.remove('d-none');
  }

  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.screen === screen);
  });

  currentScreen = screen;

  switch (screen) {
    case 'dashboard': initDashboard(currentUser.uid); break;
    case 'food': initFood(currentUser.uid); break;
    case 'water': initWater(currentUser.uid); break;
    case 'exercise': initExercise(currentUser.uid); break;
    case 'weight': initWeight(currentUser.uid); break;
    case 'friends': initFriends(currentUser.uid); break;
    case 'settings': initSettings(); break;
  }
}

// ===== Settings =====
function initSettings() {
  const profile = userProfile || {};
  const goals = profile.goals || {};

  document.getElementById('settings-name').value = profile.displayName || currentUser.displayName || '';
  document.getElementById('settings-height').value = profile.heightCm || '';
  document.getElementById('goal-calories').value = goals.dailyCalories || 1800;
  document.getElementById('goal-protein').value = goals.dailyProtein || 60;
  document.getElementById('goal-carbs').value = goals.dailyCarbs || 250;
  document.getElementById('goal-fat').value = goals.dailyFat || 65;
  document.getElementById('goal-water').value = goals.dailyWaterMl || 2000;
}

async function saveSettings() {
  const newGoals = {
    dailyCalories: Number(document.getElementById('goal-calories').value) || 1800,
    dailyProtein: Number(document.getElementById('goal-protein').value) || 60,
    dailyCarbs: Number(document.getElementById('goal-carbs').value) || 250,
    dailyFat: Number(document.getElementById('goal-fat').value) || 65,
    dailyWaterMl: Number(document.getElementById('goal-water').value) || 2000
  };
  const newName = document.getElementById('settings-name').value.trim();
  const newHeight = Number(document.getElementById('settings-height').value) || null;

  showLoading();
  try {
    await updateUserGoals(currentUser.uid, newGoals, newName, newHeight);
    userProfile = await getUserProfile(currentUser.uid);
    showToast('設定已儲存');
  } catch (e) {
    showToast('儲存失敗，請再試一次', 'error');
  } finally {
    hideLoading();
  }
}

// ===== App Init =====
export function initApp() {
  // Bottom nav
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.screen));
  });

  // Back button
  document.getElementById('btn-back').addEventListener('click', () => navigateTo('dashboard'));

  // Settings gear
  document.getElementById('btn-settings').addEventListener('click', () => navigateTo('settings'));

  // Save settings
  document.getElementById('btn-save-settings').addEventListener('click', saveSettings);

  // Expose navigate globally for inline onclick in HTML
  window.app = { navigate };
}
