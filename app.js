/**
 * Oikos Companion — Pear Runtime Frontend
 *
 * Vanilla JS frontend for the Oikos Pear desktop app.
 * Communicates with the Bare main process via internal HTTP API on :13421.
 * The main process connects to the agent over Hyperswarm P2P.
 * No token auth needed — internal API is process-local.
 *
 * Views: Overview, Wallet, Swarm, Policies, Audit, Settings, Chat
 */

/* global Pear */

var API_BASE = 'http://127.0.0.1:13421'
var currentView = 'overview'
var chatMessageCount = 0
var refreshInterval = null

// ── Asset constants ──
var COLORS = { USDT: '#2d8a4e', XAUT: '#b8860b', USAT: '#2874a6', BTC: '#d35400', ETH: '#148f77' }
var DOTS = { USDT: 'c-usdt', XAUT: 'c-xaut', USAT: 'c-usat', BTC: 'c-btc', ETH: 'c-eth' }
var PRICES = { USDT: 1, USAT: 1, XAUT: 2400, BTC: 60000, ETH: 3000 }
var DECS = { USDT: 6, USAT: 6, XAUT: 6, BTC: 8, ETH: 18 }

// ── API helper ──

async function api (path) {
  try {
    var r = await fetch(API_BASE + path)
    return await r.json()
  } catch (e) {
    console.error('[app] API error:', path, e.message)
    return null
  }
}

async function apiPost (path, body) {
  try {
    var r = await fetch(API_BASE + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    return await r.json()
  } catch (e) {
    console.error('[app] API error:', path, e.message)
    return null
  }
}

// ── Prices ──

async function fetchPrices () {
  var data = await api('/api/prices')
  if (data && data.prices && data.prices.length > 0) {
    data.prices.forEach(function (p) {
      if (p.symbol && p.priceUsd !== undefined) PRICES[p.symbol] = p.priceUsd
    })
  }
}

// ── Portfolio calc ──

function allocate (balances) {
  var items = balances.map(function (b) {
    var raw = parseInt(b.balance || '0', 10)
    var d = DECS[b.symbol] || 18
    var human = raw / Math.pow(10, d)
    var usd = human * (PRICES[b.symbol] || 0)
    return { symbol: b.symbol, chain: b.chain, formatted: b.formatted, usd: usd }
  })
  var total = items.reduce(function (s, e) { return s + e.usd }, 0)
  return {
    total: total,
    items: items.map(function (e) {
      return { symbol: e.symbol, chain: e.chain, formatted: e.formatted, usd: e.usd, pct: total > 0 ? (e.usd / total * 100).toFixed(1) : '0.0' }
    })
  }
}

// ── Navigation ──

function switchView (name) {
  currentView = name
  document.querySelectorAll('.nav-item').forEach(function (el) {
    el.classList.toggle('active', el.dataset.view === name)
  })
  document.querySelectorAll('.view').forEach(function (el) {
    el.classList.toggle('active', el.id === 'view-' + name)
  })
  updateCurrentView()
}

document.querySelectorAll('.nav-item').forEach(function (el) {
  el.addEventListener('click', function () {
    switchView(el.dataset.view)
  })
})

// ── Helpers ──

function opBadge (type) {
  var t = (type || 'payment').toLowerCase()
  var cls = 'badge-' + t
  if (!['badge-payment', 'badge-swap', 'badge-bridge', 'badge-yield', 'badge-feedback'].includes(cls)) cls = 'badge-payment'
  return '<span class="op-badge ' + cls + '">' + t.toUpperCase() + '</span>'
}

function fmtAmt (result) {
  var p = result.proposal
  if (!p) return '?'
  var raw = parseInt(p.amount, 10)
  var d = DECS[p.symbol] || 6
  return (raw / Math.pow(10, d)).toFixed(d <= 6 ? 2 : 6)
}

function setDot (id, on) {
  var el = document.getElementById(id)
  if (el) el.className = 'status-dot ' + (on ? 'on' : 'off')
}

function escapeHtml (str) {
  var div = document.createElement('div')
  div.textContent = str
  return div.innerHTML
}

function renderAllocBar (id, items) {
  var el = document.getElementById(id)
  if (!el) return
  el.innerHTML = items.map(function (i) {
    return '<div class="alloc-seg" style="width:' + parseFloat(i.pct) + '%;background:' + COLORS[i.symbol] + ';" title="' + i.symbol + ': ' + i.pct + '%"></div>'
  }).join('')
}

function renderAssetList (id, items) {
  var el = document.getElementById(id)
  if (!el) return
  el.innerHTML = items.map(function (i) {
    return '<div class="asset-row"><div class="asset-left"><span class="asset-dot ' + DOTS[i.symbol] + '"></span><span class="asset-symbol">' + i.symbol + '</span><span class="asset-chain">' + i.chain + '</span></div><div class="asset-right"><span class="asset-amount">' + i.formatted + '</span><span class="asset-usd"> $' + i.usd.toFixed(2) + '</span><span class="asset-pct">' + i.pct + '%</span></div></div>'
  }).join('')
}

function showResult (id, text, isError) {
  var el = document.getElementById(id)
  el.classList.remove('hidden')
  el.textContent = text
  el.style.borderColor = isError ? 'var(--red)' : 'var(--green)'
}

/* ═══ UPDATE: Overview ═══ */

async function updateOverview () {
  var [state, health, valuation, identity, swarm, econ] = await Promise.all([
    api('/api/state'), api('/api/health'), api('/api/valuation'),
    api('/api/identity'), api('/api/swarm'), api('/api/economics')
  ])

  if (health) {
    setDot('td-wallet', health.walletConnected)
    setDot('td-swarm', health.swarmEnabled)
    setDot('td-companion', health.companionConnected)
  }

  if (state) {
    document.getElementById('kpi-events').textContent = state.eventsSeen || 0
    document.getElementById('kpi-proposals').textContent = state.proposalsSent || 0
    document.getElementById('kpi-proposal-detail').textContent = (state.proposalsApproved || 0) + ' ok / ' + (state.proposalsRejected || 0) + ' rej'
    document.getElementById('kpi-defi').textContent = state.defiOps || 0

    // Reasoning ticker
    document.getElementById('reasoning-text').textContent = state.lastReasoning || 'Waiting for agent...'
    document.getElementById('reasoning-time').textContent = new Date().toLocaleTimeString()

    // Portfolio
    if (state.balances && state.balances.length > 0) {
      var a = allocate(state.balances)
      var total = (valuation && valuation.totalUsd > 0) ? valuation.totalUsd : a.total
      document.getElementById('portfolio-total').innerHTML = '$' + total.toFixed(2) + ' <span class="currency">USD</span>'
      document.getElementById('kpi-portfolio').textContent = '$' + total.toFixed(0)
      document.getElementById('kpi-assets').textContent = state.balances.length + ' assets'
      renderAllocBar('alloc-bar', a.items)
      renderAssetList('asset-list', a.items)
    }

    // Operations
    if (state.recentResults && state.recentResults.length > 0) {
      document.getElementById('op-list').innerHTML = state.recentResults.map(function (r) {
        var type = (r.proposalType || 'payment').toLowerCase()
        var badge = opBadge(type)
        var amount = fmtAmt(r)
        var sym = r.proposal ? r.proposal.symbol : ''
        var hash = r.txHash ? r.txHash.slice(0, 12) + '...' : ''
        var violations = r.violations && r.violations.length > 0 ? ' ' + r.violations[0] : ''
        var extra = ''
        if (type === 'swap' && r.proposal) extra = ' &rarr; ' + (r.proposal.toSymbol || '?')
        else if (type === 'bridge' && r.proposal) extra = ' ' + (r.proposal.fromChain || '?') + ' &rarr; ' + (r.proposal.toChain || '?')
        var st = r.status || 'unknown'
        return '<li class="op-item"><div class="op-indicator op-ind-' + st + '"></div><div class="op-body">' +
          badge + '<span class="op-status">' + st.toUpperCase() + '</span> ' + amount + ' ' + sym + extra +
          (hash ? '<div class="op-hash">tx: ' + hash + '</div>' : '') +
          (violations ? '<div class="op-detail">' + violations + '</div>' : '') +
          '</div></li>'
      }).join('')
    }
  }

  // Swarm on overview
  if (swarm && swarm.enabled) {
    document.getElementById('swarm-overview').classList.remove('hidden')
    if (swarm.identity) {
      document.getElementById('swarm-name').textContent = swarm.identity.name || '--'
      document.getElementById('swarm-rep').textContent = ((swarm.identity.reputation || 0) * 100).toFixed(0) + '%'
    }
    var peers = swarm.boardPeers || []
    document.getElementById('swarm-peers').innerHTML = peers.length > 0
      ? peers.map(function (p) { return '<span class="peer-chip"><span class="peer-dot"></span>' + p.name + ' <span class="peer-rep">' + ((p.reputation || 0) * 100).toFixed(0) + '%</span></span>' }).join('')
      : '<span style="color:var(--dim);font-size:11px;">No peers</span>'
    var anns = swarm.announcements || []
    document.getElementById('ann-list').innerHTML = anns.length > 0
      ? anns.slice(0, 8).map(function (a) { return '<div class="ann-item"><span class="ann-cat cat-' + (a.category || 'service') + '">' + (a.category || 'service') + '</span> <strong>' + (a.title || 'Untitled') + '</strong></div>' }).join('')
      : '<div class="empty">No announcements</div>'
    var rooms = swarm.activeRooms || []
    document.getElementById('room-list').innerHTML = rooms.length > 0
      ? rooms.map(function (r) { var st = r.status || 'open'; return '<div class="room-item"><span class="room-badge rb-' + st + '">' + st + '</span> <strong>' + (r.announcement ? r.announcement.title : 'Room') + '</strong></div>' }).join('')
      : '<div class="empty">No active rooms</div>'

    // Economics
    if (econ && econ.economics) {
      var e = econ.economics
      var rev = Number(e.totalRevenue) || 0
      var cost = Number(e.totalCosts) || 0
      document.getElementById('econ-rev').textContent = '$' + rev.toFixed(2)
      document.getElementById('econ-cost').textContent = '$' + cost.toFixed(2)
      var profit = rev - cost
      var pe = document.getElementById('econ-profit')
      pe.textContent = '$' + profit.toFixed(2)
      pe.className = 'econ-val ' + (profit >= 0 ? 'econ-pos' : 'econ-neg')
      document.getElementById('econ-deals').textContent = e.dealsCompleted || 0
      var sus = Number(e.sustainabilityScore) || 0
      document.getElementById('kpi-sustainability').textContent = (sus * 100).toFixed(0) + '%'
      document.getElementById('kpi-sus-card').classList.remove('hidden')
    }
  }

  // Identity
  if (identity && (identity.registered || identity.enabled !== false)) {
    document.getElementById('identity-overview').classList.remove('hidden')
    if (identity.registered) {
      document.getElementById('id-registered').textContent = 'YES'
      document.getElementById('id-registered').className = 'id-value id-yes'
      document.getElementById('id-agent-id').textContent = identity.agentId ? '#' + identity.agentId : '--'
      document.getElementById('id-wallet-set').textContent = identity.walletSet ? 'YES' : 'NO'
      document.getElementById('id-wallet-set').className = 'id-value ' + (identity.walletSet ? 'id-yes' : 'id-no')
    } else {
      document.getElementById('id-registered').textContent = 'NO'
      document.getElementById('id-registered').className = 'id-value id-no'
    }
  }

  document.getElementById('refresh-ts').textContent = new Date().toLocaleTimeString()
}

/* ═══ UPDATE: Wallet ═══ */

async function updateWallet () {
  var [balances, addresses, valuation] = await Promise.all([
    api('/api/balances'), api('/api/addresses'), api('/api/valuation')
  ])
  if (balances && balances.balances) {
    var a = allocate(balances.balances)
    var total = (valuation && valuation.totalUsd > 0) ? valuation.totalUsd : a.total
    document.getElementById('w-portfolio-total').innerHTML = '$' + total.toFixed(2) + ' <span class="currency">USD</span>'
    renderAllocBar('w-alloc-bar', a.items)
    renderAssetList('w-asset-list', a.items)
  }
  if (addresses && addresses.addresses) {
    var el = document.getElementById('w-addresses')
    el.innerHTML = addresses.addresses.length === 0
      ? '<div class="empty">No addresses</div>'
      : addresses.addresses.map(function (a) { return '<div style="margin-bottom:0.4rem;"><div class="form-label">' + (a.chain || '?') + '</div><div style="font-size:11px;color:var(--blue);word-break:break-all;">' + (a.address || '--') + '</div></div>' }).join('')
  }
}

/* ═══ UPDATE: Swarm ═══ */

async function updateSwarm () {
  var [swarm, econ] = await Promise.all([api('/api/swarm'), api('/api/economics')])
  if (!swarm || !swarm.enabled) {
    document.getElementById('swarm-disabled').classList.remove('hidden')
    document.getElementById('swarm-content').classList.add('hidden')
    return
  }
  document.getElementById('swarm-disabled').classList.add('hidden')
  document.getElementById('swarm-content').classList.remove('hidden')
  if (swarm.identity) {
    document.getElementById('sw-name').textContent = swarm.identity.name || '--'
    document.getElementById('sw-rep').textContent = ((swarm.identity.reputation || 0) * 100).toFixed(0) + '%'
  }
  var peers = swarm.boardPeers || []
  document.getElementById('sw-peer-count').textContent = peers.length
  document.getElementById('sw-peers').innerHTML = peers.length > 0
    ? peers.map(function (p) { return '<span class="peer-chip"><span class="peer-dot"></span>' + p.name + ' <span class="peer-rep">' + ((p.reputation || 0) * 100).toFixed(0) + '%</span></span>' }).join('')
    : '<div class="empty">No peers</div>'
  var anns = swarm.announcements || []
  document.getElementById('sw-anns').innerHTML = anns.length > 0
    ? anns.slice(0, 15).map(function (a) { return '<div class="ann-item"><span class="ann-cat cat-' + (a.category || 'service') + '">' + (a.category || 'service') + '</span> <strong>' + (a.title || 'Untitled') + '</strong><br><span style="font-size:10px;color:var(--dim);">' + (a.agentName || '?') + ' | ' + (a.priceRange ? a.priceRange.min + '-' + a.priceRange.max + ' ' + a.priceRange.symbol : '--') + '</span></div>' }).join('')
    : '<div class="empty">No announcements</div>'
  var rooms = swarm.activeRooms || []
  document.getElementById('sw-rooms').innerHTML = rooms.length > 0
    ? rooms.map(function (r) { var st = r.status || 'open'; return '<div class="room-item"><span class="room-badge rb-' + st + '">' + st + '</span> <strong>' + (r.announcement ? r.announcement.title : 'Room ' + (r.id || '?').slice(0, 8)) + '</strong><br><span style="font-size:10px;color:var(--dim);">' + (r.bids || []).length + ' bid(s)' + (r.agreedPrice ? ' | ' + r.agreedPrice : '') + '</span></div>' }).join('')
    : '<div class="empty">No active rooms</div>'
  var events = swarm.recentEvents || []
  document.getElementById('sw-events').innerHTML = events.length > 0
    ? events.slice(0, 30).map(function (e) { return '<div class="event-line"><span class="event-time">' + new Date(e.timestamp).toLocaleTimeString() + '</span> ' + (e.summary || e.kind) + '</div>' }).join('')
    : '<div class="empty">No events</div>'
  if (econ && econ.enabled && econ.economics) {
    var e = econ.economics
    var rev = Number(e.totalRevenue) || 0
    var cost = Number(e.totalCosts) || 0
    document.getElementById('sw-econ-rev').textContent = '$' + rev.toFixed(2)
    document.getElementById('sw-econ-cost').textContent = '$' + cost.toFixed(2)
    var profit = rev - cost
    var pe = document.getElementById('sw-econ-profit')
    pe.textContent = '$' + profit.toFixed(2)
    pe.className = 'econ-val ' + (profit >= 0 ? 'econ-pos' : 'econ-neg')
    document.getElementById('sw-econ-deals').textContent = e.dealsCompleted || 0
    var sus = Number(e.sustainabilityScore) || 0
    document.getElementById('sw-sustainability').textContent = (sus * 100).toFixed(0) + '%'
    document.getElementById('sw-sustainability').className = 'kpi-value ' + (sus >= 0.5 ? 'green' : 'red')
  }
}

/* ═══ UPDATE: Policies ═══ */

async function updatePolicies () {
  var pol = await api('/api/policies')
  if (!pol || !pol.policies) return
  document.getElementById('pol-content').innerHTML = pol.policies.map(function (p) {
    var spent = Object.entries(p.state.sessionTotals || {})
    var rules = (p.rules || []).slice(0, 8)
    var rulesHtml = rules.map(function (r) {
      var desc = r.type
      if (r.amount) desc += ': ' + r.amount + ' ' + r.symbol
      else if (r.seconds) desc += ': ' + r.seconds + 's'
      else if (r.min !== undefined) desc += ': min ' + r.min
      else if (r.start_hour !== undefined) desc += ': ' + r.start_hour + '-' + r.end_hour + ' ' + r.timezone
      return '<div class="policy-rule">' + desc + '</div>'
    }).join('')
    var budgetHtml = spent.map(function (kv) {
      var pct = Math.min(100, Number(kv[1]) / 50000000 * 100)
      var color = pct > 80 ? 'var(--red)' : pct > 50 ? 'var(--yellow)' : 'var(--green)'
      return '<div class="policy-rule">' + kv[0] + ': ' + kv[1] + ' spent</div><div class="budget-bar-bg"><div class="budget-bar-fill" style="width:' + pct + '%;background:' + color + ';"></div></div>'
    }).join('')
    return '<div class="policy-item"><div class="policy-name">' + p.name + '</div>' + rulesHtml + budgetHtml + '</div>'
  }).join('')
}

/* ═══ UPDATE: Audit ═══ */

async function updateAudit () {
  var data = await api('/api/audit?limit=100')
  if (!data || !data.entries) return
  document.getElementById('audit-count').textContent = data.entries.length + ' entries'
  if (data.entries.length === 0) {
    document.getElementById('audit-body').innerHTML = '<tr><td colspan="5" class="empty">No entries</td></tr>'
    return
  }
  document.getElementById('audit-body').innerHTML = data.entries.map(function (e) {
    var time = e.timestamp ? new Date(e.timestamp).toLocaleString() : '--'
    var type = e.proposalType || e.type || '--'
    var status = e.status || '--'
    var sc = status === 'executed' ? 'var(--green)' : status === 'rejected' ? 'var(--red)' : 'var(--yellow)'
    var amount = e.proposal ? (e.proposal.amount || '--') : '--'
    var sym = e.proposal ? (e.proposal.symbol || '') : ''
    var detail = e.reason || ((e.violations || []).join(', ')) || (e.txHash ? 'tx: ' + e.txHash.slice(0, 16) + '...' : '')
    return '<tr><td style="font-size:10px;white-space:nowrap;">' + time + '</td><td>' + opBadge(type) + '</td><td style="color:' + sc + ';font-weight:700;">' + status.toUpperCase() + '</td><td>' + amount + ' ' + sym + '</td><td style="color:var(--muted);font-size:11px;">' + detail + '</td></tr>'
  }).join('')
}

/* ═══ UPDATE: Settings ═══ */

async function updateSettings () {
  var health = await api('/api/health')
  if (!health) return
  var html = '<div style="font-size:12px;line-height:2;">'
  html += '<strong>Wallet:</strong> ' + (health.walletConnected ? '<span style="color:var(--green)">Connected</span>' : '<span style="color:var(--red)">Disconnected</span>') + '<br>'
  html += '<strong>Swarm:</strong> ' + (health.swarmEnabled ? 'Enabled' : 'Disabled') + '<br>'
  html += '<strong>Oikos:</strong> ' + (health.companionConnected ? 'Connected' : 'Disconnected') + '<br>'
  html += '<strong>Events buffered:</strong> ' + (health.eventsBuffered || 0) + '<br>'
  html += '</div>'
  document.getElementById('settings-content').innerHTML = html
}

/* ═══ CHAT (Two-Way Agent Bridge) ═══ */

function appendChatMsg (text, from, timestamp) {
  var mc = document.getElementById('chat-messages')
  var div = document.createElement('div')
  var t = new Date(timestamp)
  var timeStr = t.toLocaleTimeString() + ' | ' + t.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

  if (from === 'human') {
    div.className = 'chat-msg human'
    div.innerHTML = '<div class="chat-msg-header"><span>You</span><span>' + timeStr + '</span></div><div class="chat-bubble">' + escapeHtml(text) + '</div>'
  } else {
    div.className = 'chat-msg agent'
    div.innerHTML = '<div class="chat-msg-header"><span>Agent</span><span>' + timeStr + '</span></div><div class="chat-bubble">' + escapeHtml(text) + '</div>'
  }
  mc.appendChild(div)
  mc.scrollTop = mc.scrollHeight
}

async function updateChat () {
  var data = await api('/api/agent/chat/history?limit=50')
  if (!data || !data.messages) return

  var messages = data.messages
  if (messages.length > chatMessageCount) {
    var newOnes = messages.slice(chatMessageCount)
    newOnes.forEach(function (msg) {
      appendChatMsg(msg.text, msg.from, msg.timestamp)
    })
    chatMessageCount = messages.length
  }
}

async function sendInstruction () {
  var input = document.getElementById('chat-input')
  var text = input.value.trim()
  if (!text) return
  var btn = document.getElementById('chat-send')
  btn.disabled = true
  btn.textContent = '...'
  input.value = ''

  // Show user message immediately (optimistic)
  appendChatMsg(text, 'human', Date.now())

  // Call the agent-agnostic chat bridge
  var result = await apiPost('/api/agent/chat', { message: text, from: 'companion' })

  btn.disabled = false
  btn.textContent = 'Send'

  if (result && result.reply) {
    // Show agent reply
    appendChatMsg(result.reply, 'agent', Date.now())
    // Sync count so updateChat doesn't duplicate
    chatMessageCount += 2
  } else if (result && result.error) {
    appendChatMsg('[Error: ' + result.error + ']', 'agent', Date.now())
    chatMessageCount += 2
  } else {
    appendChatMsg('[No response from agent]', 'agent', Date.now())
    chatMessageCount += 2
  }
  input.focus()
}

document.getElementById('chat-send').addEventListener('click', sendInstruction)
document.getElementById('chat-input').addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    sendInstruction()
  }
})

/* ═══ Payment + Simulate forms ═══ */

document.getElementById('pay-btn').addEventListener('click', async function () {
  var to = document.getElementById('pay-to').value.trim()
  var amount = document.getElementById('pay-amount').value
  if (!to || !amount) { showResult('pay-result', 'Fill in recipient and amount.', true); return }
  var btn = document.getElementById('pay-btn')
  btn.disabled = true; btn.textContent = 'SENDING...'
  var result = await apiPost('/api/companion/propose', {
    type: 'payment', to: to, amount: amount,
    symbol: document.getElementById('pay-symbol').value,
    chain: document.getElementById('pay-chain').value,
    reason: document.getElementById('pay-reason').value.trim() || 'companion'
  })
  btn.disabled = false; btn.textContent = 'SEND'
  if (result) showResult('pay-result', JSON.stringify(result, null, 2), result.status === 'rejected' || result.status === 'failed')
  else showResult('pay-result', 'Failed.', true)
})

document.getElementById('sim-btn').addEventListener('click', async function () {
  var amount = document.getElementById('sim-amount').value
  if (!amount) { showResult('sim-result', 'Enter amount.', true); return }
  var btn = document.getElementById('sim-btn')
  btn.disabled = true; btn.textContent = 'SIMULATING...'
  var result = await apiPost('/api/simulate', {
    amount: amount, symbol: document.getElementById('sim-symbol').value,
    chain: document.getElementById('sim-chain').value, reason: 'dry-run'
  })
  btn.disabled = false; btn.textContent = 'SIMULATE'
  if (result) showResult('sim-result', JSON.stringify(result, null, 2), result.status === 'rejected')
  else showResult('sim-result', 'Failed.', true)
})

/* ═══ UPDATE DISPATCHER ═══ */

async function updateCurrentView () {
  switch (currentView) {
    case 'overview': await updateOverview(); break
    case 'wallet': await updateWallet(); break
    case 'swarm': await updateSwarm(); break
    case 'policies': await updatePolicies(); break
    case 'audit': await updateAudit(); break
    case 'settings': await updateSettings(); break
  }
  await updateChat()
}

/* ═══ BOOT ═══ */

async function boot () {
  console.log('[app] Booting Oikos Companion...')

  // 1. Wait for bare-http1 internal API
  var ready = false
  for (var i = 0; i < 10; i++) {
    try {
      var res = await fetch(API_BASE + '/api/health')
      if (res.ok) {
        ready = true
        console.log('[app] Internal API ready.')
        break
      }
    } catch (e) {
      // bare-http1 not ready yet
    }
    await new Promise(function (resolve) { setTimeout(resolve, 300) })
  }

  if (!ready) {
    console.error('[app] Internal API not responding.')
    var content = document.getElementById('content-scroll')
    if (content) {
      content.innerHTML = '<div style="padding:3rem;text-align:center;"><div style="font-size:1.5rem;font-weight:700;color:var(--red);margin-bottom:1rem;">Internal Error</div><div style="color:var(--muted);">Internal API not available. Try restarting the app.</div></div>'
    }
    return
  }

  // 2. Fetch initial prices
  await fetchPrices()

  // 3. Initial render
  await updateCurrentView()

  // 4. Start refresh loop (2.5 seconds)
  refreshInterval = setInterval(updateCurrentView, 2500)

  // 5. Price refresh (60 seconds)
  setInterval(fetchPrices, 60000)

  console.log('[app] Oikos Companion ready.')
}

boot()
