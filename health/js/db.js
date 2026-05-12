import {
  doc, collection, addDoc, getDoc, getDocs, setDoc, deleteDoc,
  query, where, orderBy, limit, onSnapshot, serverTimestamp, updateDoc
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';

function db() { return window._db; }

// ===== Date helpers =====
export function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

// ===== User Initialization =====
function generateFriendCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

export async function initUser(uid, displayName, email) {
  const ref = doc(db(), 'users', uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      displayName,
      email,
      heightCm: null,
      friendCode: generateFriendCode(),
      createdAt: serverTimestamp(),
      goals: {
        dailyCalories: 1800,
        dailyProtein: 60,
        dailyCarbs: 250,
        dailyFat: 65,
        dailyWaterMl: 2000
      }
    });
  }
}

export async function getUserProfile(uid) {
  const snap = await getDoc(doc(db(), 'users', uid));
  return snap.exists() ? { uid, ...snap.data() } : null;
}

export async function updateUserGoals(uid, goals, displayName, heightCm) {
  const updates = { goals };
  if (displayName) updates.displayName = displayName;
  if (heightCm) updates.heightCm = heightCm;
  await updateDoc(doc(db(), 'users', uid), updates);
}

// ===== Food Logs =====
export async function addFoodLog(uid, entry) {
  const ref = await addDoc(collection(db(), 'users', uid, 'foodLogs'), {
    ...entry,
    timestamp: serverTimestamp()
  });
  await _updateSharedStats(uid, entry.date);
  return ref.id;
}

export async function getFoodLogs(uid, date) {
  const q = query(
    collection(db(), 'users', uid, 'foodLogs'),
    where('date', '==', date),
    orderBy('timestamp')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function deleteFoodLog(uid, logId, date) {
  await deleteDoc(doc(db(), 'users', uid, 'foodLogs', logId));
  await _updateSharedStats(uid, date);
}

// ===== Water Logs =====
export async function addWaterLog(uid, amountMl, date) {
  await addDoc(collection(db(), 'users', uid, 'waterLogs'), {
    date,
    amountMl,
    timestamp: serverTimestamp()
  });
  await _updateSharedStats(uid, date);
}

export async function getWaterLogs(uid, date) {
  const q = query(
    collection(db(), 'users', uid, 'waterLogs'),
    where('date', '==', date),
    orderBy('timestamp')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getWaterLogsRange(uid, dates) {
  const results = {};
  await Promise.all(dates.map(async date => {
    const logs = await getWaterLogs(uid, date);
    results[date] = logs.reduce((sum, l) => sum + l.amountMl, 0);
  }));
  return results;
}

export async function deleteWaterLog(uid, logId, date) {
  await deleteDoc(doc(db(), 'users', uid, 'waterLogs', logId));
  await _updateSharedStats(uid, date);
}

// ===== Exercise Logs =====
export async function addExerciseLog(uid, entry) {
  await addDoc(collection(db(), 'users', uid, 'exerciseLogs'), {
    ...entry,
    timestamp: serverTimestamp()
  });
  await _updateSharedStats(uid, entry.date);
}

export async function getExerciseLogs(uid, date) {
  const q = query(
    collection(db(), 'users', uid, 'exerciseLogs'),
    where('date', '==', date),
    orderBy('timestamp')
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function getExerciseLogsRange(uid, dates) {
  const results = {};
  await Promise.all(dates.map(async date => {
    const logs = await getExerciseLogs(uid, date);
    results[date] = logs.reduce((sum, l) => sum + (l.durationMinutes || 0), 0);
  }));
  return results;
}

export async function deleteExerciseLog(uid, logId, date) {
  await deleteDoc(doc(db(), 'users', uid, 'exerciseLogs', logId));
  await _updateSharedStats(uid, date);
}

// ===== Weight Logs =====
export async function addWeightLog(uid, entry) {
  await addDoc(collection(db(), 'users', uid, 'weightLogs'), {
    ...entry,
    timestamp: serverTimestamp()
  });
  await _updateSharedStats(uid, entry.date);
}

export async function getWeightLogs(uid, limitCount = 30) {
  const q = query(
    collection(db(), 'users', uid, 'weightLogs'),
    orderBy('date', 'desc'),
    limit(limitCount)
  );
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).reverse();
}

export async function deleteWeightLog(uid, logId) {
  await deleteDoc(doc(db(), 'users', uid, 'weightLogs', logId));
}

// ===== Shared Stats (denormalized daily summary) =====
async function _updateSharedStats(uid, date) {
  try {
    const [foods, waterLogs, exerciseLogs, weightLogs] = await Promise.all([
      getFoodLogs(uid, date),
      getWaterLogs(uid, date),
      getExerciseLogs(uid, date),
      getWeightLogs(uid, 1)
    ]);

    const totalCalories = foods.reduce((s, f) => s + (f.calories || 0), 0);
    const totalWaterMl = waterLogs.reduce((s, w) => s + (w.amountMl || 0), 0);
    const totalExerciseMinutes = exerciseLogs.reduce((s, e) => s + (e.durationMinutes || 0), 0);
    const latestWeight = weightLogs.length ? weightLogs[weightLogs.length - 1].weightKg : null;

    const userSnap = await getDoc(doc(db(), 'users', uid));
    const goals = userSnap.exists() ? (userSnap.data().goals || {}) : {};
    const isPublic = userSnap.exists() ? (userSnap.data().shareWithFriends !== false) : true;

    await setDoc(doc(db(), 'users', uid, 'sharedStats', date), {
      date,
      totalCalories,
      totalWaterMl,
      totalExerciseMinutes,
      weightKg: latestWeight,
      calorieGoalMet: goals.dailyCalories ? totalCalories >= goals.dailyCalories * 0.8 : false,
      waterGoalMet: goals.dailyWaterMl ? totalWaterMl >= goals.dailyWaterMl : false,
      isPublicToFriends: isPublic,
      lastUpdated: serverTimestamp()
    });
  } catch (_) {
    // non-critical
  }
}

export async function getSharedStats(uid, date) {
  const snap = await getDoc(doc(db(), 'users', uid, 'sharedStats', date));
  return snap.exists() ? snap.data() : null;
}

export function subscribeToFriendStats(friendUid, date, callback) {
  return onSnapshot(doc(db(), 'users', friendUid, 'sharedStats', date), snap => {
    callback(snap.exists() ? snap.data() : null);
  });
}

// ===== Friends =====
function friendshipId(uidA, uidB) {
  return [uidA, uidB].sort().join('_');
}

export async function getUserByFriendCode(code) {
  const q = query(collection(db(), 'users'), where('friendCode', '==', code.toUpperCase()));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const d = snap.docs[0];
  return { uid: d.id, ...d.data() };
}

export async function sendFriendRequest(fromUid, toUid) {
  const fid = friendshipId(fromUid, toUid);
  const ref = doc(db(), 'friendships', fid);
  const snap = await getDoc(ref);
  if (snap.exists()) {
    const status = snap.data().status;
    if (status === 'accepted') throw new Error('already_friends');
    if (status === 'pending') throw new Error('already_pending');
  }
  const [a, b] = [fromUid, toUid].sort();
  await setDoc(ref, {
    userA: a, userB: b,
    initiatedBy: fromUid,
    status: 'pending',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function respondToFriendRequest(fid, accept) {
  if (accept) {
    await updateDoc(doc(db(), 'friendships', fid), { status: 'accepted', updatedAt: serverTimestamp() });
  } else {
    await deleteDoc(doc(db(), 'friendships', fid));
  }
}

export async function removeFriend(uid, friendUid) {
  await deleteDoc(doc(db(), 'friendships', friendshipId(uid, friendUid)));
}

export async function getFriends(uid) {
  const [qA, qB] = [
    query(collection(db(), 'friendships'), where('userA', '==', uid), where('status', '==', 'accepted')),
    query(collection(db(), 'friendships'), where('userB', '==', uid), where('status', '==', 'accepted'))
  ];
  const [snapA, snapB] = await Promise.all([getDocs(qA), getDocs(qB)]);
  const friends = [];
  for (const d of [...snapA.docs, ...snapB.docs]) {
    const data = d.data();
    const friendUid = data.userA === uid ? data.userB : data.userA;
    const profile = await getUserProfile(friendUid);
    if (profile) friends.push({ fid: d.id, ...profile });
  }
  return friends;
}

export async function getPendingRequests(uid) {
  const [snapA, snapB] = await Promise.all([
    getDocs(query(collection(db(), 'friendships'), where('userA', '==', uid), where('status', '==', 'pending'))),
    getDocs(query(collection(db(), 'friendships'), where('userB', '==', uid), where('status', '==', 'pending')))
  ]);

  const incoming = [];
  const outgoing = [];
  const seen = new Set();

  for (const d of [...snapA.docs, ...snapB.docs]) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    const data = d.data();
    const friendUid = data.userA === uid ? data.userB : data.userA;
    const profile = await getUserProfile(friendUid);
    if (!profile) continue;
    if (data.initiatedBy === uid) {
      outgoing.push({ fid: d.id, ...profile });
    } else {
      incoming.push({ fid: d.id, ...profile });
    }
  }

  return { incoming, outgoing };
}

export async function updateSharePreference(uid, isPublic) {
  await updateDoc(doc(db(), 'users', uid), { shareWithFriends: isPublic });
}
