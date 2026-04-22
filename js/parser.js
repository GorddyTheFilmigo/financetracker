// =============================================
// parser.js — M-Pesa & Bank SMS Parser
// Uses regex to extract transaction data
// =============================================

// === REGEX PATTERNS ===
const PATTERNS = {
  // Core amounts — matches Ksh1,000 or KES 2500.50
  amount:      /(?:Ksh|KES)\s*([\d,]+\.?\d*)/i,
  // New balance after transaction
  balance:     /(?:balance|bal\.?)\s+(?:is\s+)?(?:Ksh|KES)\s*([\d,]+\.?\d*)/i,
  // Transaction cost
  cost:        /(?:cost|charge),?\s*(?:Ksh|KES)\s*([\d,]+\.?\d*)/i,
  // Date formats: 15/4/25 or 15/04/2025
  date:        /on\s+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
  // Time: 10:23 AM or 14:30
  time:        /at\s+(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i,
  // Transaction ID (confirmation codes)
  txId:        /([A-Z0-9]{10,12})\s+Confirmed/i,
  // Phone numbers
  phone:       /(\+?254\d{9}|07\d{8}|01\d{8})/,
  // Sent to person + optional phone
  sentTo:      /sent\s+to\s+([A-Z][A-Z .'-]+?)(?:\s+(\+?254\d{9}|07\d{8}|01\d{8}))?\s+on/i,
  // Received from person
  rcvdFrom:    /(?:received|receive)\s+(?:Ksh|KES)[\d,]+\s+from\s+([A-Z][A-Z .'-]+?)(?:\s+(\+?254\d{9}|07\d{8}|01\d{8}))?\s+on/i,
  // Paybill: number + business name
  paybill:     /(?:to|paid\s+to)\s+(\d{4,7})\s*[-–]\s*([^\n]+?)\s+on/i,
  // Buy goods till
  buyGoods:    /paid\s+to\s+([A-Z][A-Z\s]+?)\s+Till\s+(\d+)/i,
  // Withdrawal: from agent
  withdraw:    /(?:withdraw|withdrawn)\s+(?:Ksh|KES)[\d,]+\s+from\s+(?:Agent\s+)?(\d+)\s*[-–]?\s*([^\n]+?)\s+(?:New|on)/i,
  // Deposit
  deposit:     /deposited\s+(?:Ksh|KES)[\d,]+\s+(?:from|by)/i,
  // Reversal
  reversal:    /reversal|reversed/i,
  // Airtime
  airtime:     /airtime|top[\s-]?up/i,
};

// === CATEGORY AUTO-DETECTION ===
const CATEGORY_RULES = [
  { pattern: /power|electricity|kplc|zuku|wananchi/i,          cat: 'utilities'     },
  { pattern: /naivas|quickmart|carrefour|shoprite|chandarana/i, cat: 'food'          },
  { pattern: /java|kfc|kenchic|subway|chicken|pizza|cafe/i,     cat: 'food'          },
  { pattern: /netflix|showmax|dstv|youtube|spotify/i,           cat: 'entertainment' },
  { pattern: /school|fees|university|college|college|kcse/i,    cat: 'education'     },
  { pattern: /hospital|pharmacy|clinic|lab|health/i,            cat: 'health'        },
  { pattern: /rent|landlord|bedsitter|apartment/i,              cat: 'rent'          },
  { pattern: /matatu|uber|bolt|little|taxi|fare/i,              cat: 'transport'     },
  { pattern: /airtel|safaricom|telkom|airtime/i,                cat: 'utilities'     },
  { pattern: /salary|wage|payroll/i,                            cat: 'salary'        },
  { pattern: /supermarket|grocery|market/i,                     cat: 'food'          },
];

function detectCategory(text) {
  for (const rule of CATEGORY_RULES) {
    if (rule.pattern.test(text)) return rule.cat;
  }
  return 'other';
}

// === PARSE AMOUNT (remove commas) ===
function parseAmount(str) {
  if (!str) return null;
  return parseFloat(str.replace(/,/g, ''));
}

// === PARSE DATE ===
function parseDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const parts = dateStr.split('/');
  if (parts.length === 3) {
    const [d, m, y] = parts;
    const year = y.length === 2 ? '20' + y : y;
    return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }
  return dateStr;
}

// === MAIN PARSE FUNCTION ===
export function parseMpesaSMS(text) {
  if (!text || text.trim().length < 10) return null;

  const upper = text.toUpperCase();
  const result = {
    raw:         text,
    txId:        null,
    type:        'unknown',
    amount:      null,
    recipient:   null,
    phone:       null,
    balance:     null,
    date:        new Date().toISOString().split('T')[0],
    time:        null,
    cost:        0,
    cat:         'other',
    confidence:  0,
    source:      'mpesa',
    icon:        '📱',
    isIncome:    false,
  };

  // Extract transaction ID
  const txMatch = text.match(PATTERNS.txId);
  if (txMatch) result.txId = txMatch[1];

  // Extract amount (first occurrence = transaction amount)
  const amounts = [...text.matchAll(/(?:Ksh|KES)\s*([\d,]+\.?\d*)/gi)];
  if (amounts.length > 0) result.amount = parseAmount(amounts[0][1]);

  // Extract balance (usually last Ksh mention)
  const balMatch = text.match(PATTERNS.balance);
  if (balMatch) result.balance = parseAmount(balMatch[1]);

  // Extract cost
  const costMatch = text.match(PATTERNS.cost);
  result.cost = costMatch ? parseAmount(costMatch[1]) : 0;

  // Extract date & time
  const dateMatch = text.match(PATTERNS.date);
  if (dateMatch) result.date = parseDate(dateMatch[1]);
  const timeMatch = text.match(PATTERNS.time);
  if (timeMatch) result.time = timeMatch[1].trim();

  // === DETERMINE TRANSACTION TYPE ===
  let confidence = 60;

  // RECEIVED
  if (/you have received|you received/i.test(text)) {
    result.type = 'received';
    result.isIncome = true;
    result.icon = '📥';
    const m = text.match(PATTERNS.rcvdFrom);
    if (m) { result.recipient = m[1].trim(); result.phone = m[2] || null; }
    result.cat = 'income';
    confidence = 97;
  }
  // PAYBILL
  else if (/paybill|pay bill/i.test(text) || PATTERNS.paybill.test(text)) {
    result.type = 'paybill';
    result.icon = '🏢';
    const m = text.match(PATTERNS.paybill);
    if (m) { result.phone = m[1]; result.recipient = m[2].trim(); }
    result.cat = detectCategory(result.recipient || text);
    confidence = 93;
  }
  // BUY GOODS
  else if (/buy goods|buy good|till/i.test(text)) {
    result.type = 'buy_goods';
    result.icon = '🛒';
    const m = text.match(PATTERNS.buyGoods);
    if (m) { result.recipient = m[1].trim(); result.phone = m[2]; }
    result.cat = detectCategory(result.recipient || text);
    confidence = 91;
  }
  // WITHDRAWAL
  else if (/withdraw/i.test(text)) {
    result.type = 'withdrawal';
    result.icon = '🏧';
    const m = text.match(PATTERNS.withdraw);
    if (m) { result.phone = m[1]; result.recipient = m[2].trim(); }
    result.cat = 'cash';
    confidence = 88;
  }
  // DEPOSIT
  else if (PATTERNS.deposit.test(text)) {
    result.type = 'deposit';
    result.isIncome = true;
    result.icon = '📥';
    result.cat = 'income';
    confidence = 85;
  }
  // REVERSAL
  else if (PATTERNS.reversal.test(text)) {
    result.type = 'reversal';
    result.isIncome = true;
    result.icon = '↩️';
    result.cat = 'other';
    confidence = 82;
  }
  // AIRTIME
  else if (PATTERNS.airtime.test(text)) {
    result.type = 'airtime';
    result.icon = '📱';
    result.cat = 'utilities';
    confidence = 89;
  }
  // SENT (person-to-person)
  else if (/sent to|send/i.test(text)) {
    result.type = 'sent';
    result.icon = '📤';
    const m = text.match(PATTERNS.sentTo);
    if (m) { result.recipient = m[1].trim(); result.phone = m[2] || null; }
    result.cat = 'transfer';
    confidence = 95;
  }

  // Extract phone if not set
  if (!result.phone) {
    const phoneMatch = text.match(PATTERNS.phone);
    if (phoneMatch) result.phone = phoneMatch[1];
  }

  result.confidence = confidence;
  return result;
}

// === BANK SMS PARSER ===
export function parseBankSMS(text) {
  // Equity, KCB, Co-op, NCBA, Stanbic patterns
  const result = {
    raw:      text,
    type:     'unknown',
    amount:   null,
    balance:  null,
    date:     new Date().toISOString().split('T')[0],
    source:   'bank',
    icon:     '🏦',
    cat:      'other',
    isIncome: false,
    confidence: 70,
  };

  const amtMatch = text.match(/(?:KES|Ksh|USD|USD)\s*([\d,]+\.?\d*)/i);
  if (amtMatch) result.amount = parseAmount(amtMatch[1]);

  if (/credit|deposited|received/i.test(text)) {
    result.type = 'credit'; result.isIncome = true; result.confidence = 85;
  } else if (/debit|charged|paid|payment/i.test(text)) {
    result.type = 'debit'; result.confidence = 85;
  }

  const balMatch = text.match(/(?:bal|balance|avail\.?)\s*:?\s*(?:KES|Ksh)\s*([\d,]+\.?\d*)/i);
  if (balMatch) result.balance = parseAmount(balMatch[1]);

  return result;
}

// === SAMPLE SMS MESSAGES ===
export const SAMPLES = {
  send:     "BH67KJ8T3P Confirmed. Ksh1,000 sent to JOHN DOE 0712345678 on 15/4/25 at 10:23 AM. New M-PESA balance is Ksh5,200. Transaction cost, Ksh0.",
  receive:  "Confirmed. You have received Ksh5,000 from JANE MUTHONI 0723456789 on 14/4/25 at 3:45 PM. New M-PESA balance is Ksh7,840.",
  paybill:  "QR53LP8X2M Confirmed. Ksh2,800 paid to 888880 - Kenya Power on 13/4/25 at 8:12 AM. Account Number 12345678. New M-PESA balance is Ksh4,120. Transaction cost, Ksh0.",
  buygoods: "NM21XK9W4V Confirmed. Ksh1,240 paid to NAIVAS SUPERMARKET Till 543210 on 12/4/25 at 2:15 PM. New M-PESA balance is Ksh2,880.",
  withdraw: "PP34RT6Y7Q Confirmed. On 11/4/25 at 9:30 AM Withdraw Ksh5,000 from Agent 012345 - JOHN AGENT New M-PESA balance is Ksh3,200. Transaction cost, Ksh68.",
  airtime:  "Confirmed. You bought Ksh100 airtime for 0712345678 on 9/4/25 at 11:45 AM. New M-PESA balance is Ksh750.",
};

export const TYPE_LABELS = {
  sent:       'Sent',
  received:   'Received',
  paybill:    'Paybill',
  buy_goods:  'Buy Goods',
  withdrawal: 'Withdrawal',
  deposit:    'Deposit',
  reversal:   'Reversal',
  airtime:    'Airtime',
  unknown:    'Transaction',
};