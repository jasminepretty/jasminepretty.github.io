import {
  getUserProfile, getUserByFriendCode, sendFriendRequest,
  respondToFriendRequest, removeFriend,
  getFriends, getPendingRequests,
  getSharedStats, updateSharePreference
} from './db.js';
import { showToast, showLoading, hideLoading } from './app.js';
import { todayStr } from './db.js';

let _uid = null;
let _myProfile = null;

export async function initFriends(uid) {
  _uid = uid;

  document.getElementById('btn-copy-code').onclick = copyCode;
  document.getElementById('btn-share-code').onclick = shareCode;
  document.getElementById('btn-add-friend').onclick = addFriend;
  document.getElementById('friend-code-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addFriend();
  });
  document.getElementById('privacy-toggle').onchange = e => {
    updateSharePreference(uid, e.target.checked)
      .then(() => showToast(e.target.checked ? '已開啟資料分享' : '已關閉資料分享'));
  };

  window._acceptFriend = acceptRequest;
  window._rejectFriend = rejectRequest;
  window._removeFriend = removeMyFriend;

  showLoading();
  try {
    _myProfile = await getUserProfile(uid);
    renderMyCode();

    if (_myProfile) {
      document.getElementById('privacy-toggle').checked =
        _myProfile.shareWithFriends !== false;
    }

    await Promise.all([loadPendingRequests(), loadFriendsList()]);
  } finally {
    hideLoading();
  }
}

function renderMyCode() {
  document.getElementById('my-friend-code').textContent =
    _myProfile?.friendCode || '載入中...';
}

function copyCode() {
  const code = _myProfile?.friendCode;
  if (!code) return;
  navigator.clipboard.writeText(code)
    .then(() => showToast('好友碼已複製！'))
    .catch(() => showToast('複製失敗，請手動複製', 'error'));
}

function shareCode() {
  const code = _myProfile?.friendCode;
  if (!code) return;
  const text = `加我的健康追蹤好友吧！我的好友碼是：${code}\n用健康追蹤 App 一起互相監督 💪`;
  if (navigator.share) {
    navigator.share({ title: '健康追蹤好友邀請', text }).catch(() => {});
  } else {
    navigator.clipboard.writeText(text).then(() => showToast('邀請文字已複製！'));
  }
}

async function addFriend() {
  const input = document.getElementById('friend-code-input');
  const code = input.value.trim().toUpperCase();
  if (code.length !== 8) { showToast('請輸入 8 碼好友碼', 'warning'); return; }
  if (code === _myProfile?.friendCode) { showToast('不能加自己為好友', 'warning'); return; }

  showLoading();
  try {
    const targetUser = await getUserByFriendCode(code);
    if (!targetUser) { showToast('找不到此好友碼，請確認後再試', 'error'); return; }

    await sendFriendRequest(_uid, targetUser.uid);
    input.value = '';
    showToast(`已送出好友邀請給 ${targetUser.displayName || '對方'}`);
    await loadPendingRequests();
  } catch (e) {
    if (e.message === 'already_friends') showToast('你們已經是好友了', 'warning');
    else if (e.message === 'already_pending') showToast('已送出邀請，等待對方確認', 'warning');
    else showToast('送出邀請失敗，請再試一次', 'error');
  } finally {
    hideLoading();
  }
}

async function loadPendingRequests() {
  const { incoming, outgoing } = await getPendingRequests(_uid);
  const section = document.getElementById('pending-requests-section');
  const container = document.getElementById('pending-requests-list');

  if (incoming.length === 0 && outgoing.length === 0) {
    section.classList.add('d-none');
    return;
  }
  section.classList.remove('d-none');

  let html = '';
  if (incoming.length > 0) {
    html += '<p class="small text-muted mb-1">收到的邀請</p>';
    html += incoming.map(req => `
      <div class="friend-request-card">
        <div class="d-flex align-items-center justify-content-between">
          <div>
            <strong>${escHtml(req.displayName || '使用者')}</strong>
            <div class="text-muted small">想加你為好友</div>
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-sm btn-success" onclick="window._acceptFriend('${req.fid}')">接受</button>
            <button class="btn btn-sm btn-outline-danger" onclick="window._rejectFriend('${req.fid}')">拒絕</button>
          </div>
        </div>
      </div>`).join('');
  }
  if (outgoing.length > 0) {
    html += '<p class="small text-muted mb-1 mt-2">送出的邀請</p>';
    html += outgoing.map(req => `
      <div class="friend-request-card">
        <div class="d-flex align-items-center justify-content-between">
          <div>
            <strong>${escHtml(req.displayName || '使用者')}</strong>
            <div class="text-muted small">等待對方確認...</div>
          </div>
          <button class="btn btn-sm btn-outline-secondary" onclick="window._rejectFriend('${req.fid}')">取消</button>
        </div>
      </div>`).join('');
  }
  container.innerHTML = html;
}

async function loadFriendsList() {
  const friendsContainer = document.getElementById('friends-list');
  const friends = await getFriends(_uid);

  if (friends.length === 0) {
    friendsContainer.innerHTML = '<div class="text-muted small text-center py-3">還沒有好友，分享你的好友碼邀請朋友吧！</div>';
    return;
  }

  const today = todayStr();
  const statsPromises = friends.map(f => getSharedStats(f.uid, today));
  const statsArr = await Promise.all(statsPromises);

  friendsContainer.innerHTML = friends.map((friend, i) => {
    const stats = statsArr[i];
    const calBadge = stats?.calorieGoalMet
      ? '<span class="badge bg-success">🔥 熱量</span>'
      : '<span class="badge bg-light text-muted">🔥</span>';
    const waterBadge = stats?.waterGoalMet
      ? '<span class="badge bg-primary">💧 喝水</span>'
      : '<span class="badge bg-light text-muted">💧</span>';

    const statsText = stats && stats.isPublicToFriends !== false
      ? `熱量 ${stats.totalCalories||0} kcal・水 ${stats.totalWaterMl||0} ml・運動 ${stats.totalExerciseMinutes||0} 分`
      : '（資料未公開）';

    return `
      <div class="friend-list-item">
        <div class="friend-avatar">${(friend.displayName || '?')[0].toUpperCase()}</div>
        <div class="flex-grow-1">
          <div class="fw-semibold small">${escHtml(friend.displayName || '使用者')}</div>
          <div class="text-muted" style="font-size:0.7rem">${statsText}</div>
        </div>
        <div class="d-flex gap-1 align-items-center">
          ${stats && stats.isPublicToFriends !== false ? `${calBadge}${waterBadge}` : ''}
          <button class="btn btn-sm btn-outline-danger ms-1 p-1" onclick="window._removeFriend('${friend.uid}','${escHtml(friend.displayName||'好友')}')">
            <i class="bi bi-person-x"></i>
          </button>
        </div>
      </div>`;
  }).join('');
}

async function acceptRequest(fid) {
  showLoading();
  try {
    await respondToFriendRequest(fid, true);
    showToast('已接受好友邀請 🎉');
    await Promise.all([loadPendingRequests(), loadFriendsList()]);
  } catch (e) {
    showToast('操作失敗', 'error');
  } finally {
    hideLoading();
  }
}

async function rejectRequest(fid) {
  showLoading();
  try {
    await respondToFriendRequest(fid, false);
    showToast('已拒絕邀請');
    await loadPendingRequests();
  } catch (e) {
    showToast('操作失敗', 'error');
  } finally {
    hideLoading();
  }
}

async function removeMyFriend(friendUid, friendName) {
  if (!confirm(`確定要移除好友「${friendName}」嗎？`)) return;
  showLoading();
  try {
    await removeFriend(_uid, friendUid);
    showToast('已移除好友');
    await loadFriendsList();
  } catch (e) {
    showToast('操作失敗', 'error');
  } finally {
    hideLoading();
  }
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
