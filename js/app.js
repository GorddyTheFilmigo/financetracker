// =============================================
// app.js — Main Application
// Progressive Web App — Pesa Tracker
// =============================================

import { openDB, saveTransaction, getAllTransactions, seedDemoData, getAllBudgets } from './db.js';
import { parseMpesaSMS, SAMPLES, TYPE_LABELS } from './parser.js';

// =============================================
// STATE
// =============================================
let state = {
  transactions: [],
  budgets: [],
  activePage: 'home',
  filter: 'all',
  entryType: 'expense',
  entryCat: 'food',
  parsedSMS: null,
  installPrompt: null,
  isOnline: navigator.onLine,
};

// =============================================
// INIT
// =============================================
document.addEventListener('DOMContentLoaded', async () => {
  await openDB();
  await seedDemoData();
  state.transactions = await getAllTransactions();
  state.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
  state.budgets = await getAllBudgets();

  renderAll();
  setupNav();
  setupPWA();
  setupOffline();
  checkInstallBanner();
  navigateTo('home');
});

// =============================================
// NAVIGATION
// =============================================
function setupNav() {
  document.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.page));
  });
}

window.navigateTo = function(page) {
  state.activePage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('[data-page]').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + page)?.classList.add('active');
  document.querySelectorAll(`[data-page="${page}"]`).forEach(b => b.classList.add('active'));

  // Render page-specific content
  if (page === 'home')    renderHome();
  if (page === 'txns')    renderTransactions();
  if (page === 'sms')     renderSMSPage();
  if (page === 'manual')  renderManualPage();
  if (page === 'insights')renderInsights();
};

// =============================================
// RENDER: HOME
// =============================================
function renderHome() {
  const txs = state.transactions;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthTxs = txs.filter(t => t.date?.startsWith(thisMonth));
  const income   = monthTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense  = monthTxs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const balance  = txs.reduce((s, t) => s + t.amount, 0);
  const mpesaCount = txs.filter(t => t.source === 'mpesa').length;

  set('balance-amount', `<span class="balance-currency">Ksh</span>${fmt(balance)}`);
  set('balance-income',  '+Ksh ' + fmt(income));
  set('balance-expense', '-Ksh ' + fmt(expense));
  set('mpesa-count', mpesaCount);

  // Chart
  renderWeekChart();

  // Recent transactions (last 5)
  const recent = txs.slice(0, 5);
  set('recent-tx', renderTxList(recent));
}

// =============================================
// RENDER: WEEK CHART
// =============================================
function renderWeekChart() {
  const days = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
  const today = new Date();
  const data = days.map((label, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - i));
    const dayStr = d.toISOString().split('T')[0];
    const dayTxs = state.transactions.filter(t => t.date === dayStr);
    return {
      label,
      income:  dayTxs.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0),
      expense: dayTxs.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0),
    };
  });

  const max = Math.max(...data.map(d => Math.max(d.income, d.expense)), 1000);
  set('week-chart', data.map(d => `
    <div class="chart-bar-group">
      <div class="chart-bars-pair">
        <div class="chart-bar inc" style="height:${Math.round((d.income/max)*90)}px" title="Income: Ksh ${fmt(d.income)}"></div>
        <div class="chart-bar exp" style="height:${Math.round((d.expense/max)*90)}px" title="Expense: Ksh ${fmt(d.expense)}"></div>
      </div>
      <div class="chart-day">${d.label}</div>
    </div>`).join(''));
}

// =============================================
// RENDER: TRANSACTIONS
// =============================================
function renderTransactions() {
  let txs = [...state.transactions];
  if (state.filter !== 'all') txs = txs.filter(t => t.source === state.filter);
  set('all-txns', renderTxList(txs, true));
}

function renderTxList(txs, showEmpty = false) {
  if (!txs.length) {
    return showEmpty
      ? `<div class="empty-state"><div class="empty-state-icon">📭</div><div class="empty-state-text">No transactions found.<br>Add one using the + button.</div></div>`
      : '';
  }
  return txs.map(t => {
    const isCredit = t.amount > 0;
    const sourceClass = `badge-${t.source || 'cash'}`;
    return `<div class="tx-item" onclick="showTxDetail('${t.id}')">
      <div class="tx-icon" style="background:${isCredit ? 'rgba(29,158,117,0.1)' : 'rgba(226,75,74,0.07)'}">${t.icon || '💸'}</div>
      <div class="tx-body">
        <div class="tx-name">${escHtml(t.name)}</div>
        <div class="tx-meta">
          <span class="badge ${sourceClass}">${t.source || 'cash'}</span>
          ${escHtml(t.cat || '')}
        </div>
      </div>
      <div class="tx-right">
        <div class="tx-amount ${isCredit ? 'credit' : 'debit'}">${isCredit ? '+' : '-'}Ksh ${fmt(Math.abs(t.amount))}</div>
        <div class="tx-date">${formatDate(t.date)}</div>
      </div>
    </div>`;
  }).join('');
}

// =============================================
// TX DETAIL (simple alert for now)
// =============================================
window.showTxDetail = function(id) {
  const t = state.transactions.find(tx => tx.id === id);
  if (!t) return;
  showToast(`${t.name} — Ksh ${fmt(Math.abs(t.amount))}`);
};

// =============================================
// RENDER: SMS PARSER PAGE
// =============================================
function renderSMSPage() {
  // Already rendered in HTML — just hook up events
}

window.loadSample = function(key) {
  document.getElementById('sms-input').value = SAMPLES[key];
};

window.parseSMS = function() {
  const text = document.getElementById('sms-input')?.value?.trim();
  if (!text) { showToast('Paste an SMS first', false); return; }

  const result = parseMpesaSMS(text);
  if (!result) { showToast('Could not parse this SMS', false); return; }

  state.parsedSMS = result;

  const fields = [
    ['type',       TYPE_LABELS[result.type] || result.type],
    ['amount',     result.amount ? 'Ksh ' + fmt(result.amount) : '—'],
    ['recipient',  result.recipient || '—'],
    ['phone',      result.phone || '—'],
    ['balance',    result.balance ? 'Ksh ' + fmt(result.balance) : '—'],
    ['date',       result.date + (result.time ? ' ' + result.time : '')],
    ['cost',       'Ksh ' + fmt(result.cost || 0)],
    ['category',   result.cat],
    ['tx_id',      result.txId || 'N/A'],
    ['confidence', result.confidence + '%'],
  ];

  set('parsed-fields', fields.map(([k, v]) => `
    <div class="parsed-field">
      <div class="parsed-key">${k}</div>
      <div class="parsed-val ${k === 'amount' || k === 'confidence' ? 'highlight' : ''}">${v}</div>
    </div>`).join(''));

  document.getElementById('parsed-fields-wrap')?.classList.remove('hidden');
  document.getElementById('save-parsed-btn')?.removeAttribute('disabled');
};

window.saveParsedSMS = async function() {
  if (!state.parsedSMS) return;
  const p = state.parsedSMS;
  const tx = {
    name:    p.recipient ? `M-Pesa: ${p.recipient}` : `M-Pesa ${TYPE_LABELS[p.type] || 'Transaction'}`,
    amount:  p.isIncome ? p.amount : -(p.amount || 0),
    source:  'mpesa',
    cat:     p.cat,
    icon:    p.icon,
    date:    p.date,
    desc:    `${TYPE_LABELS[p.type] || 'M-Pesa'} · Conf: ${p.txId || 'N/A'}`,
    txId:    p.txId,
    rawSMS:  null, // don't store raw SMS for privacy
  };
  const saved = await saveTransaction(tx);
  state.transactions.unshift(saved);
  showToast('Saved to local database!');
  state.parsedSMS = null;
  document.getElementById('sms-input').value = '';
  set('parsed-fields', '');
  document.getElementById('parsed-fields-wrap')?.classList.add('hidden');
};

// =============================================
// RENDER: MANUAL ENTRY
// =============================================
function renderManualPage() {
  // Set today's date
  const el = document.getElementById('m-date');
  if (el && !el.value) el.value = new Date().toISOString().split('T')[0];
}

window.setEntryType = function(type, btn) {
  state.entryType = type;
  document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active','expense','income'));
  btn.classList.add('active', type);
};

window.selectCat = function(cat, btn) {
  state.entryCat = cat;
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
};

window.submitManual = async function() {
  const amt    = parseFloat(document.getElementById('m-amount')?.value || 0);
  const desc   = document.getElementById('m-desc')?.value?.trim();
  const date   = document.getElementById('m-date')?.value || new Date().toISOString().split('T')[0];
  const source = document.getElementById('m-source')?.value || 'cash';

  if (!amt || amt <= 0) { showToast('Enter a valid amount', false); return; }

  const CAT_ICONS = {
    food:'🍔', transport:'🚗', rent:'🏠', utilities:'💡',
    health:'🏥', education:'📚', entertainment:'🎬',
    salary:'💼', freelance:'💻', transfer:'📤', other:'💸',
  };

  const tx = {
    name:   desc || `${state.entryCat.charAt(0).toUpperCase() + state.entryCat.slice(1)} expense`,
    amount: state.entryType === 'expense' ? -amt : amt,
    source,
    cat:    state.entryCat,
    icon:   CAT_ICONS[state.entryCat] || '💸',
    date,
    desc:   desc || '',
  };

  const saved = await saveTransaction(tx);
  state.transactions.unshift(saved);
  state.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

  // Reset form
  document.getElementById('m-amount').value = '';
  document.getElementById('m-desc').value = '';

  showToast('Transaction saved!');
  navigateTo('home');
};

// =============================================
// RENDER: INSIGHTS
// =============================================
function renderInsights() {
  const txs = state.transactions;
  const thisMonth = new Date().toISOString().slice(0, 7);
  const lastMonth = (() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().slice(0, 7);
  })();

  const monthExp = txs.filter(t => t.date?.startsWith(thisMonth) && t.amount < 0);
  const lastExp  = txs.filter(t => t.date?.startsWith(lastMonth) && t.amount < 0);

  // Category breakdown
  const byCat = {};
  monthExp.forEach(t => { byCat[t.cat] = (byCat[t.cat] || 0) + Math.abs(t.amount); });
  const sorted = Object.entries(byCat).sort((a, b) => b[1] - a[1]);
  const topCat = sorted[0];
  const totalExp = monthExp.reduce((s, t) => s + Math.abs(t.amount), 0);
  const totalInc = txs.filter(t => t.date?.startsWith(thisMonth) && t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const savingsRate = totalInc > 0 ? Math.round(((totalInc - totalExp) / totalInc) * 100) : 0;

  // Donut data
  const colors = ['#1D9E75','#E24B4A','#EF9F27','#378ADD','#7F77DD'];
  const donutData = sorted.slice(0, 5).map((e, i) => ({
    cat: e[0], amount: e[1], pct: Math.round((e[1] / totalExp) * 100), color: colors[i] || '#888'
  }));

  set('donut-chart', renderDonut(donutData));
  set('donut-legend', donutData.map(d => `
    <div class="legend-row">
      <div class="legend-dot" style="background:${d.color}"></div>
      <span class="legend-name">${d.cat}</span>
      <span class="legend-pct">${d.pct}%</span>
    </div>`).join(''));

  // Budget bars
  const budgetMap = {};
  state.budgets.forEach(b => budgetMap[b.cat] = b.limit);

  set('budget-bars', Object.entries(budgetMap).map(([cat, limit]) => {
    const spent = byCat[cat] || 0;
    const pct = Math.min(Math.round((spent / limit) * 100), 100);
    const color = pct > 90 ? '#E24B4A' : pct > 70 ? '#EF9F27' : '#1D9E75';
    return `<div class="budget-item">
      <div class="budget-header">
        <span class="budget-name">${CAT_EMOJI[cat] || ''} ${cat.charAt(0).toUpperCase()+cat.slice(1)}</span>
        <span class="budget-amounts">Ksh ${fmt(spent)} / ${fmt(limit)}</span>
      </div>
      <div class="budget-track">
        <div class="budget-fill" style="width:${pct}%;background:${color}"></div>
      </div>
    </div>`;
  }).join(''));

  // AI insights
  const insights = [];
  if (topCat) insights.push({ icon:'🔥', title:'Top category', text:`<strong>${topCat[0]}</strong> is your biggest spend at Ksh ${fmt(topCat[1])} this month.` });
  insights.push({ icon:'💰', title:'Savings rate', text:`You saved <strong style="color:var(--green)">${savingsRate}%</strong> of income this month.` });
  if (totalExp > 0) insights.push({ icon:'📊', title:'Avg daily spend', text:`About Ksh ${fmt(Math.round(totalExp / 30))} per day in expenses.` });
  insights.push({ icon:'📱', title:'M-Pesa activity', text:`${txs.filter(t=>t.source==='mpesa').length} M-Pesa transactions tracked automatically.` });

  set('ai-insights', insights.map(i => `
    <div class="insight-card">
      <div class="insight-icon">${i.icon}</div>
      <div class="insight-body">
        <div class="insight-title">${i.title}</div>
        <div class="insight-text">${i.text}</div>
      </div>
    </div>`).join(''));
}

function renderDonut(data) {
  if (!data.length) return '<svg width="90" height="90"><circle cx="45" cy="45" r="35" fill="none" stroke="var(--bg4)" stroke-width="12"/></svg>';
  const R = 35, C = 2 * Math.PI * R;
  let offset = 0;
  const segs = data.map(d => {
    const dash = (d.pct / 100) * C;
    const seg = `<circle cx="45" cy="45" r="${R}" fill="none" stroke="${d.color}" stroke-width="12" stroke-dasharray="${dash.toFixed(1)} ${(C - dash).toFixed(1)}" stroke-dashoffset="${(-offset).toFixed(1)}" stroke-linecap="butt"/>`;
    offset += dash;
    return seg;
  });
  return `<svg width="90" height="90" viewBox="0 0 90 90" style="transform:rotate(-90deg)">
    <circle cx="45" cy="45" r="${R}" fill="none" stroke="var(--bg3)" stroke-width="12"/>
    ${segs.join('')}
  </svg>`;
}

// =============================================
// FILTER
// =============================================
window.setFilter = function(filter, btn) {
  state.filter = filter;
  document.querySelectorAll('.filter-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderTransactions();
};

// =============================================
// RENDER ALL (initial)
// =============================================
function renderAll() {
  renderHome();
  renderTransactions();
  renderInsights();
}

// =============================================
// PWA SETUP
// =============================================
function setupPWA() {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').then(reg => {
      console.log('[SW] Registered:', reg.scope);
    }).catch(err => console.warn('[SW] Registration failed:', err));
  }

  // Capture install prompt
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    state.installPrompt = e;
    document.getElementById('install-banner')?.style.setProperty('display', 'flex');
  });

  window.addEventListener('appinstalled', () => {
    state.installPrompt = null;
    document.getElementById('install-banner')?.style.setProperty('display', 'none');
    showToast('Pesa Tracker installed!');
  });
}

window.installApp = async function() {
  if (!state.installPrompt) return;
  state.installPrompt.prompt();
  const { outcome } = await state.installPrompt.userChoice;
  if (outcome === 'accepted') state.installPrompt = null;
};

window.dismissInstall = function() {
  document.getElementById('install-banner')?.style.setProperty('display', 'none');
};

function checkInstallBanner() {
  // Hide if already installed (standalone mode)
  if (window.matchMedia('(display-mode: standalone)').matches) {
    document.getElementById('install-banner')?.style.setProperty('display', 'none');
  }
}

// =============================================
// OFFLINE HANDLING
// =============================================
function setupOffline() {
  const bar = document.getElementById('offline-bar');
  const update = () => {
    state.isOnline = navigator.onLine;
    if (bar) bar.classList.toggle('show', !state.isOnline);
    document.getElementById('online-status')?.classList.toggle('offline', !state.isOnline);
  };
  window.addEventListener('online',  update);
  window.addEventListener('offline', update);
  update();
}

// =============================================
// TOAST
// =============================================
function showToast(msg, success = true) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.querySelector('.toast-dot').style.background = success ? 'var(--green)' : 'var(--red)';
  t.querySelector('#toast-msg').textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2800);
}
window.showToast = showToast;

// =============================================
// HELPERS
// =============================================
function set(id, html) {
  const el = document.getElementById(id);
  if (el) el.innerHTML = html;
}

function fmt(n) {
  return (Math.round(n || 0)).toLocaleString('en-KE');
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-KE', { month: 'short', day: 'numeric' });
  } catch { return dateStr; }
}

function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

const CAT_EMOJI = {
  food:'🍔', transport:'🚗', rent:'🏠', utilities:'💡',
  health:'🏥', education:'📚', entertainment:'🎬',
  salary:'💼', freelance:'💻', transfer:'📤',
  cash:'💵', income:'📥', other:'💸',
};