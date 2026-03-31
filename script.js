// ==================== DATA STORAGE ====================
let transactions = JSON.parse(localStorage.getItem('transactions')) || [];
let accounts = JSON.parse(localStorage.getItem('accounts')) || [
  { id: 1, name: "M-Pesa", type: "Mobile Money", balance: 0 },
  { id: 2, name: "Cash", type: "Cash", balance: 0 },
  { id: 3, name: "Bank Account", type: "Bank", balance: 0 }
];
let goals = JSON.parse(localStorage.getItem('goals')) || [];
let categories = ["Salary", "Food", "Rent", "Transport", "Shopping", "Bills & Utilities", "School Fees", "Healthcare", "Entertainment", "Others"];

// ==================== CHART VARIABLES ====================
let pieChart = null;
let barChart = null;

// ==================== DOM ELEMENTS ====================
const form = document.getElementById('transaction-form');
const transactionList = document.getElementById('transaction-list');
const totalBalanceEl = document.getElementById('total-balance');
const totalIncomeEl = document.getElementById('total-income');
const totalExpenseEl = document.getElementById('total-expense');
const balanceMainEl = document.getElementById('balance-main');
const accountFilter = document.getElementById('account-filter');
const searchInput = document.getElementById('search');
const exportBtn = document.getElementById('export-csv');
const clearAllBtn = document.getElementById('clear-all');
const themeToggle = document.getElementById('theme-toggle');
const addAccountBtn = document.getElementById('add-account-btn');
const addGoalBtn = document.getElementById('add-goal-btn');

// Modals
const accountModal = document.getElementById('add-account-modal');
const goalModal = document.getElementById('add-goal-modal');

// Install Button
const installBtn = document.getElementById('install-btn');

// PWA Install Prompt
let deferredPrompt;

// ==================== THEME TOGGLE ====================
themeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  themeToggle.textContent = document.body.classList.contains('dark-mode') ? '☀️' : '🌙';
});

// ==================== POPULATE SELECTS ====================
function populateAccounts() {
  const selects = [document.getElementById('account'), accountFilter];
  selects.forEach(select => {
    select.innerHTML = '<option value="">All Accounts</option>';
    accounts.forEach(acc => {
      const opt = document.createElement('option');
      opt.value = acc.id;
      opt.textContent = `${acc.name} (${acc.type})`;
      select.appendChild(opt);
    });
  });
}

function populateCategories() {
  const select = document.getElementById('category');
  select.innerHTML = '<option value="">Select Category</option>';
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
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
      .reduce((sum, t) => sum + t.amount, 0);

    grandTotal += balance;

    const div = document.createElement('div');
    div.className = 'account-card';
    div.innerHTML = `
      <strong>${acc.name}</strong><br>
      <small>${acc.type}</small>
      <div style="font-size:1.5rem; margin:12px 0; font-weight:bold; color:${balance >= 0 ? '#27ae60' : '#e74c3c'}">
        KSh ${balance.toFixed(2)}
      </div>
    `;
    container.appendChild(div);
  });

  totalBalanceEl.textContent = `Total Balance: KSh ${grandTotal.toFixed(2)}`;
  totalBalanceEl.style.color = grandTotal >= 0 ? '#27ae60' : '#e74c3c';
}

// ==================== PROFESSIONAL MODALS ====================

// Open Add Account Modal
addAccountBtn.addEventListener('click', () => {
  accountModal.style.display = 'flex';
  document.getElementById('new-account-name').focus();
});

// Open Add Goal Modal
addGoalBtn.addEventListener('click', () => {
  goalModal.style.display = 'flex';
  document.getElementById('new-goal-name').focus();
});

// Save New Account
document.getElementById('save-account-btn').addEventListener('click', () => {
  const name = document.getElementById('new-account-name').value.trim();
  const type = document.getElementById('new-account-type').value.trim();

  if (!name) {
    alert("Account name is required");
    return;
  }

  accounts.push({
    id: Date.now(),
    name: name,
    type: type || "Other",
    balance: 0
  });

  saveData();
  populateAccounts();
  renderAll();
  accountModal.style.display = 'none';
  
  document.getElementById('new-account-name').value = '';
  document.getElementById('new-account-type').value = '';
});

// Save New Goal
document.getElementById('save-goal-btn').addEventListener('click', () => {
  const name = document.getElementById('new-goal-name').value.trim();
  const target = parseFloat(document.getElementById('new-goal-target').value);

  if (!name || isNaN(target) || target <= 0) {
    alert("Please enter valid goal name and target amount");
    return;
  }

  goals.push({ 
    name: name, 
    target: target 
  });

  saveData();
  renderGoals();
  goalModal.style.display = 'none';
  
  document.getElementById('new-goal-name').value = '';
  document.getElementById('new-goal-target').value = '';
});

// Cancel Account Modal
document.getElementById('cancel-account-btn').addEventListener('click', () => {
  accountModal.style.display = 'none';
});

// Cancel Goal Modal
document.getElementById('cancel-goal-btn').addEventListener('click', () => {
  goalModal.style.display = 'none';
});

// Close modals when clicking outside
window.addEventListener('click', (e) => {
  if (e.target === accountModal) accountModal.style.display = 'none';
  if (e.target === goalModal) goalModal.style.display = 'none';
});

// ==================== PWA INSTALL BUTTON ====================
installBtn.addEventListener('click', () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        console.log('User accepted the install prompt');
      } else {
        console.log('User dismissed the install prompt');
      }
      deferredPrompt = null;
      installBtn.style.display = 'none';
    });
  }
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.style.display = 'inline-block';   // Show install button
});

window.addEventListener('appinstalled', () => {
  installBtn.style.display = 'none';
  console.log('PWA was installed');
});

// ==================== ADD TRANSACTION ====================
form.addEventListener('submit', (e) => {
  e.preventDefault();
  const accountId = parseInt(document.getElementById('account').value);
  if (!accountId) return alert("Please select an account");

  const description = document.getElementById('description').value.trim();
  const amount = parseFloat(document.getElementById('amount').value);
  const type = document.getElementById('type').value;
  const category = document.getElementById('category').value;
  const date = document.getElementById('date').value;
  const recurring = document.getElementById('recurring').checked;
  const note = document.getElementById('note').value.trim();

  if (!description || isNaN(amount) || !category || !date) {
    alert("Please fill all required fields correctly");
    return;
  }

  transactions.push({
    id: Date.now(),
    accountId,
    description,
    amount: type === 'expense' ? -amount : amount,
    type,
    category,
    date,
    recurring,
    note
  });

  saveData();
  renderAll();
  form.reset();
  document.getElementById('date').valueAsDate = new Date();
});

// ==================== RENDER TRANSACTIONS ====================
function renderTransactions() {
  transactionList.innerHTML = '';
  let filtered = transactions.slice();

  const selectedAccount = parseInt(accountFilter.value);
  const searchTerm = searchInput.value.toLowerCase().trim();

  if (selectedAccount) filtered = filtered.filter(t => t.accountId === selectedAccount);
  if (searchTerm) {
    filtered = filtered.filter(t =>
      t.description.toLowerCase().includes(searchTerm) ||
      t.category.toLowerCase().includes(searchTerm)
    );
  }

  if (filtered.length === 0) {
    transactionList.innerHTML = '<li style="justify-content:center;color:#777;padding:20px;">No transactions found</li>';
    return;
  }

  filtered.sort((a, b) => new Date(b.date) - new Date(a.date));

  filtered.forEach(tx => {
    const acc = accounts.find(a => a.id === tx.accountId) || { name: 'Unknown' };
    const li = document.createElement('li');
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
    btn.addEventListener('click', () => {
      if (confirm('Delete this transaction?')) {
        transactions = transactions.filter(t => t.id !== parseInt(btn.dataset.id));
        saveData();
        renderAll();
      }
    });
  });
}

// ==================== UPDATE SUMMARY ====================
function updateSummary() {
  const income = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const balance = income - expense;

  totalIncomeEl.textContent = `KSh ${income.toFixed(2)}`;
  totalExpenseEl.textContent = `KSh ${expense.toFixed(2)}`;
  balanceMainEl.textContent = `KSh ${balance.toFixed(2)}`;
  balanceMainEl.style.color = balance >= 0 ? '#27ae60' : '#e74c3c';
}

// ==================== CHARTS ====================
function renderCategoryPie() {
  const ctx = document.getElementById('category-pie');
  if (pieChart) pieChart.destroy();

  const expenseByCat = {};
  transactions.filter(t => t.amount < 0).forEach(t => {
    expenseByCat[t.category] = (expenseByCat[t.category] || 0) + Math.abs(t.amount);
  });

  if (Object.keys(expenseByCat).length === 0) return;

  pieChart = new Chart(ctx, {
    type: 'pie',
    data: {
      labels: Object.keys(expenseByCat),
      datasets: [{
        data: Object.values(expenseByCat),
        backgroundColor: ['#e74c3c','#f39c12','#3498db','#2ecc71','#9b59b6','#1abc9c']
      }]
    },
    options: { responsive: true, maintainAspectRatio: true }
  });
}

function renderTrendsBar() {
  const ctx = document.getElementById('trends-bar');
  if (barChart) barChart.destroy();

  const monthly = {};
  transactions.forEach(t => {
    const monthKey = t.date.substring(0, 7);
    if (!monthly[monthKey]) monthly[monthKey] = {income: 0, expense: 0};
    if (t.amount > 0) monthly[monthKey].income += t.amount;
    else monthly[monthKey].expense += Math.abs(t.amount);
  });

  const labels = Object.keys(monthly).sort().slice(-6);
  if (labels.length === 0) return;

  const incomeData = labels.map(m => monthly[m].income || 0);
  const expenseData = labels.map(m => monthly[m].expense || 0);

  barChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: 'Income', data: incomeData, backgroundColor: '#27ae60' },
        { label: 'Expense', data: expenseData, backgroundColor: '#e74c3c' }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true } }
    }
  });
}

// ==================== RENDER GOALS ====================
function renderGoals() {
  const container = document.getElementById('goals-list');
  container.innerHTML = '';
  if (goals.length === 0) {
    container.innerHTML = '<p style="color:#777;">No goals set yet. Click "+ Add New Goal" to create one.</p>';
    return;
  }
  goals.forEach(goal => {
    const div = document.createElement('div');
    div.style.marginBottom = '15px';
    div.innerHTML = `
      <strong>${goal.name}</strong><br>
      Target: KSh ${goal.target.toFixed(0)}
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
clearAllBtn.addEventListener('click', () => {
  if (confirm("Delete ALL data? This action cannot be undone.")) {
    localStorage.clear();
    location.reload();
  }
});

// ==================== SAVE DATA ====================
function saveData() {
  localStorage.setItem('transactions', JSON.stringify(transactions));
  localStorage.setItem('accounts', JSON.stringify(accounts));
  localStorage.setItem('goals', JSON.stringify(goals));
}

// ==================== MAIN RENDER FUNCTION ====================
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
searchInput.addEventListener('input', renderAll);

// ==================== INITIAL LOAD ====================
window.addEventListener('load', () => {
  populateAccounts();
  populateCategories();
  renderAll();
});
