import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

import { initUser } from './db.js';
import { showToast, showLoading, hideLoading, onUserReady } from './app.js';

const AUTH_ERRORS = {
  'auth/invalid-email': '電子郵件格式不正確',
  'auth/user-not-found': '找不到此帳號',
  'auth/wrong-password': '密碼錯誤',
  'auth/email-already-in-use': '此電子郵件已被使用',
  'auth/weak-password': '密碼至少需要 6 個字元',
  'auth/too-many-requests': '嘗試次數過多，請稍後再試',
  'auth/popup-closed-by-user': '視窗已關閉，請重試',
  'auth/invalid-credential': '帳號或密碼不正確'
};

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  el.classList.remove('d-none');
}

function clearAuthError() {
  document.getElementById('auth-error').classList.add('d-none');
}

export async function initAuth() {
  const auth = window._auth;

  // Toggle login / register forms
  document.getElementById('btn-show-register').addEventListener('click', () => {
    document.getElementById('auth-login-form').classList.add('d-none');
    document.getElementById('auth-register-form').classList.remove('d-none');
    clearAuthError();
  });
  document.getElementById('btn-show-login').addEventListener('click', () => {
    document.getElementById('auth-register-form').classList.add('d-none');
    document.getElementById('auth-login-form').classList.remove('d-none');
    clearAuthError();
  });

  // Login
  document.getElementById('btn-login').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) { showAuthError('請填寫電子郵件和密碼'); return; }
    showLoading();
    try {
      await signInWithEmailAndPassword(auth, email, password);
      clearAuthError();
    } catch (e) {
      showAuthError(AUTH_ERRORS[e.code] || '登入失敗，請再試一次');
    } finally {
      hideLoading();
    }
  });

  // Google login
  document.getElementById('btn-google-login').addEventListener('click', async () => {
    showLoading();
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      await initUser(result.user.uid, result.user.displayName || '使用者', result.user.email);
      clearAuthError();
    } catch (e) {
      showAuthError(AUTH_ERRORS[e.code] || 'Google 登入失敗');
    } finally {
      hideLoading();
    }
  });

  // Register
  document.getElementById('btn-register').addEventListener('click', async () => {
    const name = document.getElementById('reg-name').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    if (!name || !email || !password) { showAuthError('請填寫所有欄位'); return; }
    showLoading();
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      await initUser(cred.user.uid, name, email);
      clearAuthError();
    } catch (e) {
      showAuthError(AUTH_ERRORS[e.code] || '註冊失敗，請再試一次');
    } finally {
      hideLoading();
    }
  });

  // Forgot password
  document.getElementById('btn-forgot-password').addEventListener('click', async () => {
    const email = document.getElementById('login-email').value.trim();
    if (!email) { showAuthError('請先填寫電子郵件'); return; }
    showLoading();
    try {
      await sendPasswordResetEmail(auth, email);
      showToast('重設密碼信已寄出，請檢查信箱', 'success');
    } catch (e) {
      showAuthError(AUTH_ERRORS[e.code] || '寄送失敗');
    } finally {
      hideLoading();
    }
  });

  // Logout
  document.getElementById('btn-logout').addEventListener('click', async () => {
    if (!confirm('確定要登出嗎？')) return;
    await signOut(auth);
  });

  // Auth state change → handed off to app.js
  return new Promise(resolve => {
    onAuthStateChanged(auth, user => {
      onUserReady(user);
      resolve();
    });
  });
}
