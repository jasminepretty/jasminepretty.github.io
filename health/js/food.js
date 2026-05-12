import { addFoodLog, getFoodLogs, deleteFoodLog, saveCustomFood, getCustomFoods } from './db.js';
import { showToast, showLoading, hideLoading, getGoals } from './app.js';
import { searchFoods } from './food-database.js';
import { todayStr } from './db.js';

const MEAL_LABELS = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '點心' };
const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];

let _uid = null;
let _currentDate = todayStr();
let _allEntries = [];
let _activeMeal = 'breakfast';
let _selectedFood = null;
let _foodModal = null;
let _searchDebounce = null;
let _customFoods = [];

export function initFood(uid) {
  _uid = uid;
  _currentDate = todayStr();
  document.getElementById('food-date').value = _currentDate;

  _foodModal = new bootstrap.Modal(document.getElementById('modal-add-food'));

  document.getElementById('food-prev-day').onclick = () => shiftDay(-1);
  document.getElementById('food-next-day').onclick = () => shiftDay(1);
  document.getElementById('food-date').onchange = e => { _currentDate = e.target.value; loadDay(); };

  document.getElementById('food-search').addEventListener('input', e => {
    clearTimeout(_searchDebounce);
    _searchDebounce = setTimeout(() => renderSearchResults(e.target.value), 150);
  });

  document.getElementById('btn-save-food').onclick = saveFood;

  // Reset modal state when closed
  document.getElementById('modal-add-food').addEventListener('hidden.bs.modal', resetModal);

  loadDay();
  getCustomFoods(uid).then(foods => { _customFoods = foods; }).catch(() => {});
}

function shiftDay(delta) {
  const d = new Date(_currentDate);
  d.setDate(d.getDate() + delta);
  _currentDate = d.toISOString().slice(0, 10);
  document.getElementById('food-date').value = _currentDate;
  loadDay();
}

async function loadDay() {
  showLoading();
  try {
    _allEntries = await getFoodLogs(_uid, _currentDate);
    renderMeals();
    renderTotals();
  } finally {
    hideLoading();
  }
}

function renderMeals() {
  const container = document.getElementById('food-meals-container');
  container.innerHTML = MEAL_ORDER.map(meal => {
    const entries = _allEntries.filter(e => e.mealType === meal);
    const mealCal = entries.reduce((s, e) => s + (e.calories || 0), 0);
    return `
      <div class="meal-section">
        <div class="meal-header">
          <span class="meal-title">${MEAL_LABELS[meal]}</span>
          <span class="meal-total">${mealCal} kcal</span>
        </div>
        <div id="meal-entries-${meal}">
          ${entries.map(e => foodItemHTML(e)).join('')}
        </div>
        <button class="btn btn-outline-secondary btn-sm btn-add-meal mt-1"
          onclick="window._foodAddMeal('${meal}')">
          <i class="bi bi-plus me-1"></i>新增${MEAL_LABELS[meal]}
        </button>
      </div>`;
  }).join('');

  window._foodAddMeal = openAddFoodModal;
  window._foodDelete = deleteEntry;
}

function foodItemHTML(entry) {
  return `
    <div class="food-item">
      <div class="flex-grow-1">
        <div class="food-item-name">${escHtml(entry.name)}</div>
        <div class="food-item-macros">
          蛋白質 ${entry.protein||0}g・碳水 ${entry.carbs||0}g・脂肪 ${entry.fat||0}g
        </div>
      </div>
      <span class="food-item-cal">${entry.calories||0}</span>
      <button class="food-item-del" onclick="window._foodDelete('${entry.id}','${entry.mealType}')">
        <i class="bi bi-x-lg"></i>
      </button>
    </div>`;
}

function renderTotals() {
  const totals = _allEntries.reduce((acc, e) => {
    acc.cal += e.calories || 0;
    acc.prot += e.protein || 0;
    acc.carbs += e.carbs || 0;
    acc.fat += e.fat || 0;
    return acc;
  }, { cal: 0, prot: 0, carbs: 0, fat: 0 });

  document.getElementById('total-cal').textContent = totals.cal;
  document.getElementById('total-prot').textContent = totals.prot;
  document.getElementById('total-carbs').textContent = totals.carbs;
  document.getElementById('total-fat').textContent = totals.fat;

  const goals = getGoals();
  const calEl = document.getElementById('total-cal');
  calEl.style.color = totals.cal > goals.dailyCalories ? '#dc3545' : 'var(--color-primary)';
}

function openAddFoodModal(meal) {
  _activeMeal = meal;
  _selectedFood = null;
  document.getElementById('food-meal-badge').textContent = MEAL_LABELS[meal];
  document.getElementById('food-search').value = '';
  document.getElementById('food-search-results').innerHTML = '';
  document.getElementById('food-selected-preview').classList.add('d-none');
  document.getElementById('manual-name').value = '';
  document.getElementById('manual-cal').value = '';
  document.getElementById('manual-prot').value = '';
  document.getElementById('manual-carbs').value = '';
  document.getElementById('manual-fat').value = '';

  // Show top results initially
  renderSearchResults('');
  _foodModal.show();
}

function renderSearchResults(query) {
  const q = (query || '').trim().toLowerCase();
  const dbResults = searchFoods(query);

  const matchedCustom = q
    ? _customFoods.filter(f => f.name.toLowerCase().includes(q))
    : _customFoods.slice(0, 5);

  // Custom foods first, then db foods (deduplicate by name)
  const customNames = new Set(matchedCustom.map(f => f.name));
  const combined = [
    ...matchedCustom,
    ...dbResults.filter(f => !customNames.has(f.name))
  ].slice(0, 20);

  const container = document.getElementById('food-search-results');
  if (combined.length === 0) {
    container.innerHTML = '<p class="text-muted small text-center py-2">找不到相符食物</p>';
    return;
  }

  if (!q && _customFoods.length > 0) {
    container.innerHTML = '<p class="text-muted small mb-1" style="font-size:0.7rem">⭐ 最近使用</p>' +
      combined.map(f => foodResultHTML(f)).join('');
  } else {
    container.innerHTML = combined.map(f => foodResultHTML(f)).join('');
  }

  window._selectFood = (id) => {
    const food = combined.find(f => f.id === id);
    if (!food) return;
    _selectedFood = food;
    document.getElementById('food-selected-name').textContent =
      `已選：${food.name}（${food.calories} kcal · 蛋白質${food.protein}g · 碳水${food.carbs}g · 脂肪${food.fat}g）`;
    document.getElementById('food-selected-preview').classList.remove('d-none');
    renderSearchResults(document.getElementById('food-search').value);
  };
}

function foodResultHTML(f) {
  const customBadge = f.isCustom ? '<span class="badge bg-secondary ms-1" style="font-size:0.6rem">我的</span>' : '';
  return `
    <div class="food-result-item ${_selectedFood?.id === f.id ? 'selected' : ''}"
      onclick="window._selectFood('${f.id}')">
      <div>
        <div>${escHtml(f.name)}${customBadge}</div>
        <div class="text-muted" style="font-size:0.7rem">${f.serving || '自訂份量'}</div>
      </div>
      <span class="food-result-cal">${f.calories} kcal</span>
    </div>`;
}

async function saveFood() {
  const activeTab = document.querySelector('#food-modal-tabs .nav-link.active')?.getAttribute('href');
  let entry;

  if (activeTab === '#tab-db') {
    if (!_selectedFood) { showToast('請先選擇一項食物', 'warning'); return; }
    entry = {
      name: _selectedFood.name,
      calories: _selectedFood.calories,
      protein: _selectedFood.protein,
      carbs: _selectedFood.carbs,
      fat: _selectedFood.fat,
      source: 'database',
      dbFoodId: _selectedFood.id
    };
  } else {
    const name = document.getElementById('manual-name').value.trim();
    if (!name) { showToast('請填寫食物名稱', 'warning'); return; }
    entry = {
      name,
      calories: Number(document.getElementById('manual-cal').value) || 0,
      protein: Number(document.getElementById('manual-prot').value) || 0,
      carbs: Number(document.getElementById('manual-carbs').value) || 0,
      fat: Number(document.getElementById('manual-fat').value) || 0,
      source: 'manual',
      dbFoodId: null
    };
  }

  entry.date = _currentDate;
  entry.mealType = _activeMeal;

  showLoading();
  try {
    await addFoodLog(_uid, entry);
    if (entry.source === 'manual') {
      saveCustomFood(_uid, entry).then(async () => {
        _customFoods = await getCustomFoods(_uid).catch(() => _customFoods);
      });
    }
    _foodModal.hide();
    _allEntries = await getFoodLogs(_uid, _currentDate);
    renderMeals();
    renderTotals();
    showToast('已新增飲食紀錄');
  } catch (e) {
    showToast('儲存失敗，請再試一次', 'error');
  } finally {
    hideLoading();
  }
}

async function deleteEntry(logId, mealType) {
  if (!confirm('確定要刪除這筆紀錄嗎？')) return;
  showLoading();
  try {
    await deleteFoodLog(_uid, logId, _currentDate);
    _allEntries = _allEntries.filter(e => e.id !== logId);
    renderMeals();
    renderTotals();
    showToast('已刪除');
  } catch (e) {
    showToast('刪除失敗', 'error');
  } finally {
    hideLoading();
  }
}

function resetModal() {
  _selectedFood = null;
  document.getElementById('food-selected-preview').classList.add('d-none');
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
