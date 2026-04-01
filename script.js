// ==================== FIREBASE SETUP ====================
// 🔧 REPLACE WITH YOUR FIREBASE PROJECT CONFIG
// Get from: Firebase Console → Project Settings → Your Apps → SDK setup & configuration
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, collection, addDoc, getDocs, deleteDoc,
  doc, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyD-WiJbP4Nlx1-vkLK2Nmiy35-jV-uar5w",
  authDomain:        "myfinancetracker-e6db1.firebaseapp.com",
  projectId:         "myfinancetracker-e6db1",
  storageBucket:     "myfinancetracker-e6db1.firebasestorage.app",
  messagingSenderId: "928025500246",
  appId:             "1:928025500246:web:317fff3290423eacfdf9f7"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// Firestore collection helpers
const txCol    = () => collection(db, 'transactions');
const accCol   = () => collection(db, 'accounts');
const goalsCol = () => collection(db, 'goals');

// ==================== DATA CACHE ====================
let transactions = [];
let accounts     = [];
let goals        = [];
const categories = [
  "Salary", "Food", "Rent", "Transport", "Shopping",
  "Bills & Utilities", "School Fees", "Healthcare", "Entertainment", "Others"
];

// ==================== CHART VARIABLES ====================
let pieChart = null;
let barChart = null;

// ==================== DOM ELEMENTS ====================
const form            = document.getElementById('transaction-form');
const transactionList = document.getElementById('transaction-list');
const totalBalanceEl  = document.getElementById('total-balance');
const totalIncomeEl   = document.getElementById('total-income');
const totalExpenseEl  = document.getElementById('total-expense');
const balanceMainEl   = document.getElementById('balance-main');
const accountFilter   = document.getElementById('account-filter');
const searchInput     = document.getElementById('search');
const exportBtn       = document.getElementById('export-csv');
const clearAllBtn     = document.getElementById('clear-all');
const themeToggle     = document.getElementById('theme-toggle');
const addAccountBtn   = document.getElementById('add-account-btn');
const addGoalBtn      = document.getElementById('add-goal-btn');
const accountModal    = document.getElementById('add-account-modal');
const goalModal       = document.getElementById('add-goal-modal');

// ==================== LOADING INDICATOR ====================
function setLoading(isLoading, message = 'Saving...') {
  // Silent background sync — no UI indicator shown
}

function showError(msg) {
  let el = document.getElementById('error-banner');
  if (!el) {
    el = document.createElement('div');
    el.id = 'error-banner';
    el.style.cssText = `
      background: #e74c3c; color: white; text-align: center;
      padding: 12px; font-size: 14px; position: sticky; top: 0; z-index: 1000;
    `;
    document.body.prepend(el);
  }
  el.textContent = '⚠️ ' + msg;
  el.style.display = 'block';
}

// ==================== DEFAULT ACCOUNTS (shown instantly) ====================
const DEFAULT_ACCOUNTS = [
  { id: 'mpesa',   name: 'M-Pesa',       type: 'Mobile Money' },
  { id: 'cash',    name: 'Cash',         type: 'Cash'         },
  { id: 'bank',    name: 'Bank Account', type: 'Bank'         },
];

// ==================== LOAD ALL DATA FROM FIREBASE ====================
async function loadAllData() {
  setLoading(true, 'Loading from Firebase...');
  try {
    const [txSnap, accSnap, goalSnap] = await Promise.all([
      getDocs(txCol()),
      getDocs(accCol()),
      getDocs(goalsCol()),
    ]);

    // Sort transactions client-side
    transactions = txSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    goals = goalSnap.docs.map(d => ({ id: d.id, ...d.data() }));

    if (accSnap.empty) {
      // Seed defaults into Firestore
      await seedDefaultAccounts();
    } else {
      accounts = accSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    setLoading(false);
    populateAccounts();
    renderAll();
    console.log('Firebase loaded OK — accounts:', accounts.length, 'transactions:', transactions.length);
  } catch (err) {
    console.error('Firebase load error:', err);
    setLoading(false);
    showError('Firebase error: ' + err.message + '. Using local defaults — data will not be saved to cloud.');
    // Fallback: use in-memory defaults so UI still works
    if (accounts.length === 0) {
      accounts = DEFAULT_ACCOUNTS;
      populateAccounts();
      renderAll();
    }
  }
}

async function seedDefaultAccounts() {
  accounts = [];
  for (const acc of DEFAULT_ACCOUNTS) {
    try {
      const ref = await addDoc(accCol(), { name: acc.name, type: acc.type, createdAt: Date.now() });
      accounts.push({ id: ref.id, name: acc.name, type: acc.type });
    } catch (e) {
      // If Firestore write fails, still use the default in memory
      accounts.push(acc);
      console.warn('Could not save default account to Firestore:', e.message);
    }
  }
}

// ==================== THEME TOGGLE ====================
themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  themeToggle.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
});

// ==================== POPULATE SELECTS ====================
function populateAccounts() {
  const accountSelect = document.getElementById('account');
  const filterSelect  = accountFilter;

  // Transaction form: "Select Account" as first option
  accountSelect.innerHTML = '<option value="">-- Select Account --</option>';
  accounts.forEach(acc => {
    const opt = document.createElement('option');
    opt.value = acc.id;
    opt.textContent = `${acc.name} (${acc.type})`;
    accountSelect.appendChild(opt);
  });

  // Filter dropdown: "All Accounts" as first option
  const prevFilter = filterSelect.value;
  filterSelect.innerHTML = '<option value="">All Accounts</option>';
  accounts.forEach(acc => {
    const opt = document.createElement('option');
    opt.value = acc.id;
    opt.textContent = `${acc.name} (${acc.type})`;
    filterSelect.appendChild(opt);
  });
  filterSelect.value = prevFilter;

  console.log('populateAccounts: loaded', accounts.length, 'accounts');
}

function populateCategories() {
  const select = document.getElementById('category');
  select.innerHTML = '<option value="">-- Select Category --</option>';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  });
  console.log('populateCategories: loaded', categories.length, 'categories');
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
      <strong>${acc.name}</strong><br>
      <small>${acc.type}</small>
      <div style="font-size:1.5rem;margin:12px 0;font-weight:bold;color:${balance >= 0 ? '#27ae60' : '#e74c3c'}">
        KSh ${balance.toFixed(2)}
      </div>
    `;
    container.appendChild(div);
  });

  totalBalanceEl.textContent = `Total Balance: KSh ${grandTotal.toFixed(2)}`;
  totalBalanceEl.style.color = grandTotal >= 0 ? '#27ae60' : '#e74c3c';
}

// ==================== MODALS ====================
addAccountBtn.addEventListener('click', () => {
  accountModal.style.display = 'flex';
  document.getElementById('new-account-name').focus();
});

addGoalBtn.addEventListener('click', () => {
  goalModal.style.display = 'flex';
  document.getElementById('new-goal-name').focus();
});

document.getElementById('save-account-btn').addEventListener('click', async () => {
  const name = document.getElementById('new-account-name').value.trim();
  const type = document.getElementById('new-account-type').value.trim();
  if (!name) { alert('Account name is required'); return; }

  setLoading(true, 'Creating account...');
  try {
    const ref = await addDoc(accCol(), { name, type: type || 'Other', createdAt: Date.now() });
    accounts.push({ id: ref.id, name, type: type || 'Other' });
    setLoading(false);
    populateAccounts();
    renderAll();
    accountModal.style.display = 'none';
    document.getElementById('new-account-name').value = '';
    document.getElementById('new-account-type').value = '';
  } catch (err) {
    alert('Error saving account: ' + err.message);
    setLoading(false);
  }
});

document.getElementById('save-goal-btn').addEventListener('click', async () => {
  const name   = document.getElementById('new-goal-name').value.trim();
  const target = parseFloat(document.getElementById('new-goal-target').value);
  if (!name || isNaN(target) || target <= 0) {
    alert('Please enter a valid goal name and target amount');
    return;
  }

  setLoading(true, 'Saving goal...');
  try {
    const ref = await addDoc(goalsCol(), { name, target, createdAt: Date.now() });
    goals.push({ id: ref.id, name, target });
    setLoading(false);
    renderGoals();
    goalModal.style.display = 'none';
    document.getElementById('new-goal-name').value = '';
    document.getElementById('new-goal-target').value = '';
  } catch (err) {
    alert('Error saving goal: ' + err.message);
    setLoading(false);
  }
});

document.getElementById('cancel-account-btn').addEventListener('click', () => { accountModal.style.display = 'none'; });
document.getElementById('cancel-goal-btn').addEventListener('click',   () => { goalModal.style.display = 'none'; });
window.addEventListener('click', e => {
  if (e.target === accountModal) accountModal.style.display = 'none';
  if (e.target === goalModal)    goalModal.style.display = 'none';
});

// ==================== ADD TRANSACTION ====================
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const accountId = document.getElementById('account').value;
  if (!accountId) { alert('Please select an account'); return; }

  const description = document.getElementById('description').value.trim();
  const rawAmount   = parseFloat(document.getElementById('amount').value);
  const type        = document.getElementById('type').value;
  const category    = document.getElementById('category').value;
  const date        = document.getElementById('date').value;
  const recurring   = document.getElementById('recurring').checked;
  const note        = document.getElementById('note').value.trim();

  if (!description || isNaN(rawAmount) || !category || !date) {
    alert('Please fill all required fields correctly');
    return;
  }

  const amount = type === 'expense' ? -rawAmount : rawAmount;

  setLoading(true, 'Saving transaction...');
  try {
    const ref = await addDoc(txCol(), {
      accountId, description, amount, type, category, date, recurring, note,
      createdAt: Date.now()
    });
    transactions.unshift({ id: ref.id, accountId, description, amount, type, category, date, recurring, note });
    setLoading(false);
    renderAll();
    form.reset();
    document.getElementById('date').valueAsDate = new Date();
  } catch (err) {
    alert('Error saving transaction: ' + err.message);
    setLoading(false);
  }
});

// ==================== RENDER TRANSACTIONS ====================
function renderTransactions() {
  transactionList.innerHTML = '';
  let filtered = transactions.slice();

  const selectedAccount = accountFilter.value;
  const searchTerm = searchInput.value.toLowerCase().trim();

  if (selectedAccount) filtered = filtered.filter(t => t.accountId === selectedAccount);
  if (searchTerm) {
    filtered = filtered.filter(t =>
      t.description.toLowerCase().includes(searchTerm) ||
      t.category.toLowerCase().includes(searchTerm)
    );
  }

  if (!filtered.length) {
    transactionList.innerHTML = '<li style="justify-content:center;color:#777;padding:20px;">No transactions found</li>';
    return;
  }

  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  filtered.forEach(tx => {
    const acc = accounts.find(a => a.id === tx.accountId) || { name: 'Unknown' };
    const li  = document.createElement('li');
    li.innerHTML = `
      <div>
        <strong>${tx.description}</strong><br>
        <small>${acc.name} • ${tx.category} • ${tx.date}</small>
        ${tx.note ? `<br><small>Note: ${tx.note}</small>` : ''}
        ${tx.recurring ? ' <span style="color:#3498db;">(Recurring)</span>' : ''}
      </div>
      <div style="text-align:right">
        <div class="amount" style="color:${tx.amount > 0 ? '#27ae60' : '#e74c3c'}">
          ${tx.amount > 0 ? '+' : ''}KSh ${Math.abs(tx.amount).toFixed(2)}
        </div>
        <button class="delete-btn" data-id="${tx.id}">Delete</button>
      </div>
    `;
    transactionList.appendChild(li);
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Delete this transaction?')) return;
      setLoading(true, 'Deleting...');
      try {
        await deleteDoc(doc(db, 'transactions', btn.dataset.id));
        transactions = transactions.filter(t => t.id !== btn.dataset.id);
        setLoading(false);
        renderAll();
      } catch (err) {
        alert('Error deleting: ' + err.message);
        setLoading(false);
      }
    });
  });
}

// ==================== UPDATE SUMMARY ====================
function updateSummary() {
  const income  = transactions.filter(t => t.amount > 0).reduce((s, t) => s + parseFloat(t.amount), 0);
  const expense = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(parseFloat(t.amount)), 0);
  const balance = income - expense;

  totalIncomeEl.textContent  = `KSh ${income.toFixed(2)}`;
  totalExpenseEl.textContent = `KSh ${expense.toFixed(2)}`;
  balanceMainEl.textContent  = `KSh ${balance.toFixed(2)}`;
  balanceMainEl.style.color  = balance >= 0 ? '#27ae60' : '#e74c3c';
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
      datasets: [{ data: Object.values(expenseByCat), backgroundColor: ['#e74c3c','#f39c12','#3498db','#2ecc71','#9b59b6','#1abc9c','#ff6d00'] }]
    },
    options: { responsive: true, maintainAspectRatio: true }
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
    data: {
      labels,
      datasets: [
        { label: 'Income',  data: labels.map(m => monthly[m].income  || 0), backgroundColor: '#27ae60' },
        { label: 'Expense', data: labels.map(m => monthly[m].expense || 0), backgroundColor: '#e74c3c' }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } }
  });
}

// ==================== RENDER GOALS ====================
function renderGoals() {
  const container = document.getElementById('goals-list');
  container.innerHTML = '';
  if (!goals.length) {
    container.innerHTML = '<p style="color:#777;">No goals set yet. Click "+ Add New Goal" to create one.</p>';
    return;
  }
  goals.forEach(goal => {
    const div = document.createElement('div');
    div.style.marginBottom = '15px';
    div.innerHTML = `
      <strong>${goal.name}</strong><br>
      Target: KSh ${parseFloat(goal.target).toFixed(0)}
      <div style="background:#eee;height:12px;border-radius:6px;margin:8px 0;">
        <div style="width:65%;height:100%;background:#27ae60;border-radius:6px;"></div>
      </div>
    `;
    container.appendChild(div);
  });
}

// ==================== EXPORT CSV ====================
exportBtn.addEventListener('click', () => {
  let csv = "Date,Account,Description,Category,Type,Amount,Note\n";
  transactions.forEach(t => {
    const acc = accounts.find(a => a.id === t.accountId);
    csv += `${t.date},${acc ? acc.name : ''},${t.description},${t.category},${t.type},${Math.abs(t.amount)},${t.note || ''}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ksh-finance-${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
});

// ==================== CLEAR ALL DATA ====================
clearAllBtn.addEventListener('click', async () => {
  if (!confirm('⚠️ Delete ALL Firebase data? This cannot be undone.')) return;
  setLoading(true, 'Clearing all data...');
  try {
    const batch = writeBatch(db);
    const [txSnap, goalSnap] = await Promise.all([getDocs(txCol()), getDocs(goalsCol())]);
    txSnap.docs.forEach(d   => batch.delete(d.ref));
    goalSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
    transactions = [];
    goals        = [];
    setLoading(false);
    renderAll();
  } catch (err) {
    alert('Error clearing data: ' + err.message);
    setLoading(false);
  }
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
accountFilter.addEventListener('change', renderAll);
searchInput.addEventListener('input',   renderAll);

// ==================== INITIAL LOAD ====================
window.addEventListener('load', () => {
  // Step 1: Populate UI immediately with local data (no Firebase needed)
  populateCategories();
  document.getElementById('date').valueAsDate = new Date();

  // Step 2: Show default accounts instantly so dropdowns are never empty
  accounts = DEFAULT_ACCOUNTS;
  populateAccounts();

  // Step 3: Load real data from Firebase in background (replaces defaults if found)
  loadAllData().catch(err => {
    console.error('Top-level Firebase error:', err);
    showError('Firebase failed to load: ' + err.message);
  });
});

// ==================== PWA Install Prompt ====================
let deferredPrompt;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredPrompt = e;
});
