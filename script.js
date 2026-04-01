// ==================== FIREBASE SETUP ====================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, addDoc, getDocs,
  deleteDoc, doc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyD-WiJbP4Nlx1-vkLK2Nmiy35-jV-uar5w",
  authDomain:        "myfinancetracker-e6db1.firebaseapp.com",
  projectId:         "myfinancetracker-e6db1",
  storageBucket:     "myfinancetracker-e6db1.firebasestorage.app",
  messagingSenderId: "928025500246",
  appId:             "1:928025500246:web:317fff3290423eacfdf9f7"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ==================== MULTI-TENANT COLLECTIONS ====================
// Each user gets their own subcollection: users/{uid}/transactions etc.
let currentUser = null;
const userCol = (sub) => collection(db, 'users', currentUser.uid, sub);
const txCol    = () => userCol('transactions');
const accCol   = () => userCol('accounts');
const goalsCol = () => userCol('goals');

// ==================== DATA CACHE ====================
let transactions = [];
let accounts     = [];
let goals        = [];
const categories = [
  "Salary", "Food", "Rent", "Transport", "Shopping",
  "Bills & Utilities", "School Fees", "Healthcare", "Entertainment", "Others"
];

let pieChart = null;
let barChart = null;

// ==================== DEFAULT ACCOUNTS ====================
const DEFAULT_ACCOUNTS = [
  { name: 'M-Pesa',       type: 'Mobile Money' },
  { name: 'Cash',         type: 'Cash'         },
  { name: 'Bank Account', type: 'Bank'         },
];

// ==================== AUTH STATE OBSERVER ====================
onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUser = user;
    showDashboard(user);
    loadAllData();
  } else {
    currentUser = null;
    showAuthScreen();
  }
});

// ==================== SHOW / HIDE SCREENS ====================
function showDashboard(user) {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('dashboard').style.display   = 'block';

  const name = user.displayName || user.email.split('@')[0];
  document.getElementById('user-greeting').textContent = `Hi, ${name} 👋`;

  // Init UI
  populateCategories();
  document.getElementById('date').valueAsDate = new Date();
}

function showAuthScreen() {
  document.getElementById('auth-screen').style.display = 'flex';
  document.getElementById('dashboard').style.display   = 'none';
  // Reset data caches
  transactions = []; accounts = []; goals = [];
  if (pieChart) { pieChart.destroy(); pieChart = null; }
  if (barChart) { barChart.destroy(); barChart = null; }
}

// ==================== AUTH TAB SWITCHER ====================
window.switchTab = function(tab) {
  document.getElementById('login-form').style.display  = tab === 'login'  ? 'block' : 'none';
  document.getElementById('signup-form').style.display = tab === 'signup' ? 'block' : 'none';
  document.getElementById('tab-login').classList.toggle('active',  tab === 'login');
  document.getElementById('tab-signup').classList.toggle('active', tab === 'signup');
  clearAuthMessages();
};

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = '⚠️ ' + msg;
  el.style.display = 'block';
  document.getElementById('auth-success').style.display = 'none';
}

function showAuthSuccess(msg) {
  const el = document.getElementById('auth-success');
  el.textContent = '✅ ' + msg;
  el.style.display = 'block';
  document.getElementById('auth-error').style.display = 'none';
}

function clearAuthMessages() {
  document.getElementById('auth-error').style.display   = 'none';
  document.getElementById('auth-success').style.display = 'none';
}

function setAuthBtnLoading(btnId, loading, defaultText) {
  const btn = document.getElementById(btnId);
  btn.disabled    = loading;
  btn.textContent = loading ? 'Please wait…' : defaultText;
}

// ==================== SIGN UP ====================
document.getElementById('signup-btn').addEventListener('click', async () => {
  const name     = document.getElementById('signup-name').value.trim();
  const email    = document.getElementById('signup-email').value.trim();
  const password = document.getElementById('signup-password').value;

  if (!name || !email || !password) { showAuthError('All fields are required.'); return; }
  if (password.length < 6)           { showAuthError('Password must be at least 6 characters.'); return; }

  setAuthBtnLoading('signup-btn', true, 'Create Account');
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    // onAuthStateChanged fires automatically — no need to call showDashboard here
  } catch (err) {
    showAuthError(friendlyAuthError(err.code));
    setAuthBtnLoading('signup-btn', false, 'Create Account');
  }
});

// ==================== SIGN IN ====================
document.getElementById('login-btn').addEventListener('click', async () => {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  if (!email || !password) { showAuthError('Please enter your email and password.'); return; }

  setAuthBtnLoading('login-btn', true, 'Sign In');
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    showAuthError(friendlyAuthError(err.code));
    setAuthBtnLoading('login-btn', false, 'Sign In');
  }
});

// Allow pressing Enter in auth inputs
['login-email','login-password','signup-name','signup-email','signup-password'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const isLogin = document.getElementById('login-form').style.display !== 'none';
      document.getElementById(isLogin ? 'login-btn' : 'signup-btn').click();
    }
  });
});

// ==================== FORGOT PASSWORD ====================
document.getElementById('forgot-link').addEventListener('click', async (e) => {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  if (!email) { showAuthError('Enter your email address first.'); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    showAuthSuccess('Password reset email sent! Check your inbox.');
  } catch (err) {
    showAuthError(friendlyAuthError(err.code));
  }
});

// ==================== SIGN OUT ====================
document.getElementById('logout-btn').addEventListener('click', async () => {
  await signOut(auth);
});

// ==================== FRIENDLY ERROR MESSAGES ====================
function friendlyAuthError(code) {
  const map = {
    'auth/email-already-in-use':    'An account with this email already exists.',
    'auth/invalid-email':           'Please enter a valid email address.',
    'auth/weak-password':           'Password is too weak. Use at least 6 characters.',
    'auth/user-not-found':          'No account found with this email.',
    'auth/wrong-password':          'Incorrect password. Please try again.',
    'auth/invalid-credential':      'Incorrect email or password.',
    'auth/too-many-requests':       'Too many attempts. Please try again later.',
    'auth/network-request-failed':  'Network error. Check your connection.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}

// ==================== THEME TOGGLE ====================
document.getElementById('theme-toggle').addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  document.getElementById('theme-toggle').textContent =
    document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
});

// ==================== LOAD ALL DATA ====================
async function loadAllData() {
  try {
    const [txSnap, accSnap, goalSnap] = await Promise.all([
      getDocs(txCol()),
      getDocs(accCol()),
      getDocs(goalsCol()),
    ]);

    transactions = txSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    goals = goalSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (accSnap.empty) {
      await seedDefaultAccounts();
    } else {
      accounts = accSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    populateAccounts();
    renderAll();
  } catch (err) {
    console.error('Load error:', err);
    showDashboardError('Failed to load data: ' + err.message);
  }
}

async function seedDefaultAccounts() {
  accounts = [];
  for (const acc of DEFAULT_ACCOUNTS) {
    const ref = await addDoc(accCol(), { ...acc, createdAt: Date.now() });
    accounts.push({ id: ref.id, ...acc });
  }
}

function showDashboardError(msg) {
  let el = document.getElementById('dash-error');
  if (!el) {
    el = document.createElement('div');
    el.id = 'dash-error';
    el.style.cssText = 'background:#dc2626;color:white;padding:10px 16px;border-radius:8px;margin-bottom:12px;font-size:0.83rem;';
    document.getElementById('dashboard').prepend(el);
  }
  el.textContent = '⚠️ ' + msg;
}

// ==================== POPULATE SELECTS ====================
function populateAccounts() {
  const accountSelect = document.getElementById('account');
  const filterSelect  = document.getElementById('account-filter');

  accountSelect.innerHTML = '<option value="">-- Select Account --</option>';
  filterSelect.innerHTML  = '<option value="">All Accounts</option>';

  accounts.forEach(acc => {
    [accountSelect, filterSelect].forEach(sel => {
      const opt = document.createElement('option');
      opt.value = acc.id;
      opt.textContent = `${acc.name} (${acc.type})`;
      sel.appendChild(opt);
    });
  });
}

function populateCategories() {
  const select = document.getElementById('category');
  select.innerHTML = '<option value="">-- Select Category --</option>';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat; opt.textContent = cat;
    select.appendChild(opt);
  });
}

// ==================== RENDER ACCOUNTS ====================
function renderAccounts() {
  const container = document.getElementById('accounts-list');
  container.innerHTML = '';
  let grandTotal = 0;

  accounts.forEach(acc => {
    const balance = transactions
      .filter(t => t.accountId === acc.id)
      .reduce((sum, t) => sum + parseFloat(t.amount), 0);
    grandTotal += balance;

    const div = document.createElement('div');
    div.className = 'account-card';
    div.innerHTML = `
      <strong>${acc.name}</strong>
      <small>${acc.type}</small>
      <div class="account-balance" style="color:${balance >= 0 ? 'var(--green)' : 'var(--red)'}">
        KSh ${balance.toFixed(2)}
      </div>
    `;
    container.appendChild(div);
  });

  const el = document.getElementById('total-balance');
  el.textContent = `Total Balance: KSh ${grandTotal.toFixed(2)}`;
  el.style.color = grandTotal >= 0 ? 'var(--green)' : 'var(--red)';
}

// ==================== MODALS ====================
const accountModal = document.getElementById('add-account-modal');
const goalModal    = document.getElementById('add-goal-modal');

document.getElementById('add-account-btn').addEventListener('click', () => {
  accountModal.style.display = 'flex';
  document.getElementById('new-account-name').focus();
});

document.getElementById('add-goal-btn').addEventListener('click', () => {
  goalModal.style.display = 'flex';
  document.getElementById('new-goal-name').focus();
});

document.getElementById('save-account-btn').addEventListener('click', async () => {
  const name = document.getElementById('new-account-name').value.trim();
  const type = document.getElementById('new-account-type').value.trim();
  if (!name) { alert('Account name is required'); return; }

  try {
    const ref = await addDoc(accCol(), { name, type: type || 'Other', createdAt: Date.now() });
    accounts.push({ id: ref.id, name, type: type || 'Other' });
    populateAccounts();
    renderAll();
    accountModal.style.display = 'none';
    document.getElementById('new-account-name').value = '';
    document.getElementById('new-account-type').value = '';
  } catch (err) { alert('Error: ' + err.message); }
});

document.getElementById('save-goal-btn').addEventListener('click', async () => {
  const name   = document.getElementById('new-goal-name').value.trim();
  const target = parseFloat(document.getElementById('new-goal-target').value);
  if (!name || isNaN(target) || target <= 0) { alert('Please enter a valid name and amount'); return; }

  try {
    const ref = await addDoc(goalsCol(), { name, target, createdAt: Date.now() });
    goals.push({ id: ref.id, name, target });
    renderGoals();
    goalModal.style.display = 'none';
    document.getElementById('new-goal-name').value   = '';
    document.getElementById('new-goal-target').value = '';
  } catch (err) { alert('Error: ' + err.message); }
});

document.getElementById('cancel-account-btn').addEventListener('click', () => { accountModal.style.display = 'none'; });
document.getElementById('cancel-goal-btn').addEventListener('click',   () => { goalModal.style.display = 'none'; });
window.addEventListener('click', e => {
  if (e.target === accountModal) accountModal.style.display = 'none';
  if (e.target === goalModal)    goalModal.style.display = 'none';
});

// ==================== ADD TRANSACTION ====================
document.getElementById('transaction-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const accountId   = document.getElementById('account').value;
  const description = document.getElementById('description').value.trim();
  const rawAmount   = parseFloat(document.getElementById('amount').value);
  const type        = document.getElementById('type').value;
  const category    = document.getElementById('category').value;
  const date        = document.getElementById('date').value;
  const recurring   = document.getElementById('recurring').checked;
  const note        = document.getElementById('note').value.trim();

  if (!accountId)                                      { alert('Please select an account'); return; }
  if (!description || isNaN(rawAmount) || !category || !date) { alert('Please fill all required fields'); return; }

  const amount = type === 'expense' ? -rawAmount : rawAmount;

  try {
    const ref = await addDoc(txCol(), {
      accountId, description, amount, type, category, date, recurring, note,
      createdAt: Date.now()
    });
    transactions.unshift({ id: ref.id, accountId, description, amount, type, category, date, recurring, note });
    renderAll();
    e.target.reset();
    document.getElementById('date').valueAsDate = new Date();
  } catch (err) { alert('Error saving: ' + err.message); }
});

// ==================== RENDER TRANSACTIONS ====================
function renderTransactions() {
  const list = document.getElementById('transaction-list');
  list.innerHTML = '';

  let filtered = transactions.slice();
  const selectedAccount = document.getElementById('account-filter').value;
  const searchTerm      = document.getElementById('search').value.toLowerCase().trim();

  if (selectedAccount) filtered = filtered.filter(t => t.accountId === selectedAccount);
  if (searchTerm)      filtered = filtered.filter(t =>
    t.description.toLowerCase().includes(searchTerm) ||
    t.category.toLowerCase().includes(searchTerm)
  );

  if (!filtered.length) {
    list.innerHTML = '<li class="empty-state">No transactions yet — add your first one above!</li>';
    return;
  }

  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  filtered.forEach(tx => {
    const acc = accounts.find(a => a.id === tx.accountId) || { name: 'Unknown' };
    const li  = document.createElement('li');
    li.innerHTML = `
      <div>
        <strong>${tx.description}</strong>
        <small>${acc.name} · ${tx.category} · ${tx.date}${tx.recurring ? ' · <span style="color:var(--blue)">Recurring</span>' : ''}${tx.note ? ' · ' + tx.note : ''}</small>
      </div>
      <div style="text-align:right;flex-shrink:0;">
        <div class="amount" style="color:${tx.amount > 0 ? 'var(--green)' : 'var(--red)'}">
          ${tx.amount > 0 ? '+' : ''}KSh ${Math.abs(tx.amount).toFixed(2)}
        </div>
        <button class="delete-btn" data-id="${tx.id}">Delete</button>
      </div>
    `;
    list.appendChild(li);
  });

  list.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this transaction?')) return;
      try {
        await deleteDoc(doc(db, 'users', currentUser.uid, 'transactions', btn.dataset.id));
        transactions = transactions.filter(t => t.id !== btn.dataset.id);
        renderAll();
      } catch (err) { alert('Error: ' + err.message); }
    });
  });
}

// ==================== UPDATE SUMMARY ====================
function updateSummary() {
  const income  = transactions.filter(t => t.amount > 0).reduce((s, t) => s + parseFloat(t.amount), 0);
  const expense = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
  const balance = income - expense;
  document.getElementById('total-income').textContent  = `KSh ${income.toFixed(2)}`;
  document.getElementById('total-expense').textContent = `KSh ${expense.toFixed(2)}`;
  const balEl = document.getElementById('balance-main');
  balEl.textContent  = `KSh ${balance.toFixed(2)}`;
  balEl.style.color  = balance >= 0 ? 'var(--green)' : 'var(--red)';
}

// ==================== CHARTS ====================
function renderCategoryPie() {
  const ctx = document.getElementById('category-pie');
  if (pieChart) pieChart.destroy();
  const expenseByCat = {};
  transactions.filter(t => t.amount < 0).forEach(t => {
    expenseByCat[t.category] = (expenseByCat[t.category] || 0) + Math.abs(t.amount);
  });
  if (!Object.keys(expenseByCat).length) return;
  pieChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: Object.keys(expenseByCat),
      datasets: [{ data: Object.values(expenseByCat),
        backgroundColor: ['#dc2626','#f59e0b','#2563eb','#16a34a','#7c3aed','#0891b2','#ea580c','#be185d'] }]
    },
    options: { responsive: true, maintainAspectRatio: true,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } } } }
  });
}

function renderTrendsBar() {
  const ctx = document.getElementById('trends-bar');
  if (barChart) barChart.destroy();
  const monthly = {};
  transactions.forEach(t => {
    const key = t.date.substring(0, 7);
    if (!monthly[key]) monthly[key] = { income: 0, expense: 0 };
    if (t.amount > 0) monthly[key].income  += parseFloat(t.amount);
    else              monthly[key].expense += Math.abs(parseFloat(t.amount));
  });
  const labels = Object.keys(monthly).sort().slice(-6);
  if (!labels.length) return;
  barChart = new Chart(ctx, {
    type: 'bar',
    data: { labels,
      datasets: [
        { label: 'Income',  data: labels.map(m => monthly[m].income  || 0), backgroundColor: '#16a34a', borderRadius: 4 },
        { label: 'Expense', data: labels.map(m => monthly[m].expense || 0), backgroundColor: '#dc2626', borderRadius: 4 }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.05)' } } },
      plugins: { legend: { labels: { font: { size: 11 } } } }
    }
  });
}

// ==================== RENDER GOALS ====================
function renderGoals() {
  const container = document.getElementById('goals-list');
  container.innerHTML = '';
  if (!goals.length) {
    container.innerHTML = '<p class="empty-state">No goals yet. Set one to start saving!</p>';
    return;
  }
  const totalBalance = transactions.reduce((s, t) => s + parseFloat(t.amount), 0);
  goals.forEach(goal => {
    const pct     = Math.min(100, Math.max(0, (totalBalance / goal.target) * 100)).toFixed(0);
    const div     = document.createElement('div');
    div.className = 'goal-item';
    div.innerHTML = `
      <div class="goal-header">
        <strong>${goal.name}</strong>
        <span class="goal-pct">${pct}%</span>
      </div>
      <div class="goal-bar-bg">
        <div class="goal-bar-fill" style="width:${pct}%"></div>
      </div>
      <small>Target: KSh ${parseFloat(goal.target).toLocaleString()}</small>
    `;
    container.appendChild(div);
  });
}

// ==================== EXPORT CSV ====================
document.getElementById('export-csv').addEventListener('click', () => {
  let csv = "Date,Account,Description,Category,Type,Amount,Note\n";
  transactions.forEach(t => {
    const acc = accounts.find(a => a.id === t.accountId);
    csv += `${t.date},"${acc ? acc.name : ''}","${t.description}",${t.category},${t.type},${Math.abs(t.amount)},"${t.note || ''}"\n`;
  });
  const a = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `finance-${currentUser.uid.slice(0,6)}-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
});

// ==================== CLEAR ALL DATA ====================
document.getElementById('clear-all').addEventListener('click', async () => {
  if (!confirm('⚠️ This will permanently delete ALL your transactions and goals. Continue?')) return;
  try {
    const batch = writeBatch(db);
    const [txSnap, goalSnap] = await Promise.all([getDocs(txCol()), getDocs(goalsCol())]);
    txSnap.docs.forEach(d   => batch.delete(d.ref));
    goalSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    transactions = []; goals = [];
    renderAll();
  } catch (err) { alert('Error: ' + err.message); }
});

// ==================== MAIN RENDER ====================
function renderAll() {
  renderAccounts();
  renderTransactions();
  updateSummary();
  renderCategoryPie();
  renderTrendsBar();
  renderGoals();
}

// ==================== FILTER LISTENERS ====================
document.getElementById('account-filter').addEventListener('change', renderAll);
document.getElementById('search').addEventListener('input', renderAll);

// ==================== PWA INSTALL PROMPT ====================
let deferredPrompt = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;

  // Show the install banner after a short delay
  setTimeout(() => {
    const banner = document.getElementById('install-banner');
    if (banner) banner.style.display = 'block';
  }, 3000);
});

document.getElementById('install-accept-btn').addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;
  document.getElementById('install-banner').style.display = 'none';
  console.log('PWA install outcome:', outcome);
});

document.getElementById('install-dismiss-btn').addEventListener('click', () => {
  document.getElementById('install-banner').style.display = 'none';
});

window.addEventListener('appinstalled', () => {
  document.getElementById('install-banner').style.display = 'none';
  deferredPrompt = null;
});
