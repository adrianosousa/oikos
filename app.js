/**
 * Oikos App — Pear Runtime Frontend (Phase 2 Refactor)
 *
 * 4 tabs: Feed, Wealth, Swarm, Policy Engine
 * Portfolio chart, markdown chat, board-style swarm, bottom bar
 */

/* global Pear */

var API_BASE = 'http://127.0.0.1:13421'
var currentView = 'feed'
var feedMode = 'activity'
var chatMessageCount = 0
var swarmSearchQuery = ''
var swarmActiveTag = null
var lastSwarmData = null

// ── Asset constants ──
var COLORS = { USDT: '#2d8a4e', XAUT: '#b8860b', USAT: '#2874a6', BTC: '#d35400', ETH: '#148f77' }
var DOTS = { USDT: 'c-usdt', XAUT: 'c-xaut', USAT: 'c-usat', BTC: 'c-btc', ETH: 'c-eth' }
var PRICES = { USDT: 1, USAT: 1, XAUT: 2400, BTC: 60000, ETH: 3000 }
var DECS = { USDT: 6, USAT: 6, XAUT: 6, BTC: 8, ETH: 18 }
var DOT_COLORS = {
  BTC: '#d35400', ETH: '#148f77', XAUT: '#b8860b', USDT: '#2d8a4e', USAT: '#2874a6',
  SOL: '#9945ff', XRP: '#23292f', ADA: '#0033ad', DOT: '#e6007a', AVAX: '#e84142',
  LINK: '#2a5ada', LTC: '#bfbbbb', UNI: '#ff007a', AAVE: '#b6509e', NEAR: '#00c08b',
  ARB: '#28a0f0', SUI: '#4da2ff', APT: '#00b4d8', TON: '#0098ea', DOGE: '#c2a633',
  SHIB: '#ffa409', TRX: '#ff0013', FIL: '#0090ff'
}
var ASSET_NAMES = {
  BTC: 'Bitcoin', ETH: 'Ethereum', XAUT: 'Tether Gold', USDT: 'Tether USD', USAT: 'Tether US',
  SOL: 'Solana', XRP: 'Ripple', ADA: 'Cardano', DOT: 'Polkadot', AVAX: 'Avalanche',
  LINK: 'Chainlink', LTC: 'Litecoin', UNI: 'Uniswap', AAVE: 'Aave', NEAR: 'NEAR',
  ARB: 'Arbitrum', SUI: 'Sui', APT: 'Aptos', TON: 'Toncoin', DOGE: 'Dogecoin',
  SHIB: 'Shiba Inu', TRX: 'TRON', FIL: 'Filecoin'
}

// ── API ──
async function api (path) {
  try { var r = await fetch(API_BASE + path); return await r.json() } catch (e) { return null }
}
async function apiPost (path, body) {
  try { var r = await fetch(API_BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }); return await r.json() } catch (e) { return null }
}

// ── Prices ──
async function fetchPrices () {
  var data = await api('/api/prices')
  if (data && data.prices) data.prices.forEach(function (p) { if (p.symbol && p.priceUsd !== undefined) PRICES[p.symbol] = p.priceUsd })
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
  document.querySelectorAll('.nav-item').forEach(function (el) { el.classList.toggle('active', el.dataset.view === name) })
  document.querySelectorAll('.view').forEach(function (el) { el.classList.toggle('active', el.id === 'view-' + name) })
  updateCurrentView()
}
document.querySelectorAll('.nav-item').forEach(function (el) {
  el.addEventListener('click', function () { switchView(el.dataset.view) })
})

// ── Feed mode toggle ──
document.querySelectorAll('.feed-toggle').forEach(function (el) {
  el.addEventListener('click', function () {
    feedMode = el.dataset.mode
    document.querySelectorAll('.feed-toggle').forEach(function (t) { t.classList.toggle('active', t.dataset.mode === feedMode) })
    document.getElementById('feed-activity').classList.toggle('hidden', feedMode !== 'activity')
    document.getElementById('feed-audit').classList.toggle('hidden', feedMode !== 'audit')
    if (feedMode === 'audit') updateAudit()
  })
})


// ── Helpers ──
function opBadge (type) {
  var t = (type || 'payment').toLowerCase()
  var cls = 'badge-' + t
  if (!['badge-payment', 'badge-swap', 'badge-bridge', 'badge-yield', 'badge-feedback'].includes(cls)) cls = 'badge-payment'
  return '<span class="op-badge ' + cls + '">' + t.toUpperCase() + '</span>'
}
function setDot (id, on) { var el = document.getElementById(id); if (el) el.className = 'cs-dot ' + (on ? 'on' : 'off') }
function escapeHtml (str) { var d = document.createElement('div'); d.textContent = str; return d.innerHTML }
function timeAgo (ts) {
  var diff = Date.now() - new Date(ts).getTime()
  if (diff < 60000) return Math.floor(diff / 1000) + 's ago'
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago'
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago'
  return Math.floor(diff / 86400000) + 'd ago'
}

// ── Markdown renderer (lightweight, no deps) ──
function renderMarkdown (text) {
  var html = escapeHtml(text)
  // Code blocks (inline)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  // Bold
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  // Italic
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>')
  // Numbered lists: "1. item" at start of line
  html = html.replace(/^(\d+)\.\s+(.+)$/gm, '<li>$2</li>')
  // Bullet lists: "- item" at start of line
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
  // Wrap consecutive <li> in <ol> or <ul>
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, '<ul>$1</ul>')
  // Line breaks
  html = html.replace(/\n/g, '<br>')
  // Clean up <br> inside lists
  html = html.replace(/<br><ul>/g, '<ul>').replace(/<\/ul><br>/g, '</ul>')
  return html
}

function renderAssetList (id, items) {
  var el = document.getElementById(id); if (!el) return
  var grouped = {}
  items.forEach(function (i) {
    if (!grouped[i.symbol]) grouped[i.symbol] = { symbol: i.symbol, chains: [], usd: 0, formatted: 0, pct: 0 }
    grouped[i.symbol].chains.push(i.chain)
    grouped[i.symbol].usd += i.usd
    grouped[i.symbol].formatted = (parseFloat(grouped[i.symbol].formatted) + parseFloat(i.formatted)).toFixed(i.symbol === 'BTC' ? 6 : 2)
    grouped[i.symbol].pct = (parseFloat(grouped[i.symbol].pct) + parseFloat(i.pct)).toFixed(1)
  })
  var sorted = Object.values(grouped).sort(function (a, b) { return b.usd - a.usd })
  el.innerHTML = sorted.map(function (i) {
    var chains = i.chains.filter(function (v, idx, a) { return a.indexOf(v) === idx }).join(', ')
    return '<div class="asset-row"><div class="asset-left"><span class="asset-dot ' + (DOTS[i.symbol] || '') + '" style="background:' + (DOT_COLORS[i.symbol] || '#999') + ';"></span><div><span class="asset-symbol">' + i.symbol + '</span><span class="asset-chain">' + chains + '</span></div></div><div class="asset-right"><span class="asset-amount">' + i.formatted + '</span><br><span class="asset-usd">$' + i.usd.toFixed(2) + '</span> <span class="asset-pct">' + i.pct + '%</span></div></div>'
  }).join('')
}

function showResult (id, text, isError) {
  var el = document.getElementById(id); el.classList.remove('hidden')
  el.textContent = text; el.style.borderColor = isError ? 'var(--red)' : 'var(--green)'
}

// ── Bottom bar (addresses popup is event-driven, no clock needed) ──

/* ═══ PIE CHART ═══ */

function renderPieChart (items) {
  var canvas = document.getElementById('pie-chart')
  if (!canvas) return
  var dpr = window.devicePixelRatio || 1
  var size = 160
  canvas.width = size * dpr; canvas.height = size * dpr
  canvas.style.width = size + 'px'; canvas.style.height = size + 'px'
  var ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  ctx.clearRect(0, 0, size, size)

  var total = items.reduce(function (s, i) { return s + i.usd }, 0)
  if (total <= 0) return
  var cx = size / 2, cy = size / 2, r = size / 2 - 8
  var start = -Math.PI / 2

  items.forEach(function (i) {
    var pct = i.usd / total
    if (pct <= 0) return
    var end = start + pct * 2 * Math.PI
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.arc(cx, cy, r, start, end)
    ctx.closePath()
    ctx.fillStyle = DOT_COLORS[i.symbol] || COLORS[i.symbol] || '#999'
    ctx.fill()
    start = end
  })

  // Center hole (donut)
  var bgColor = getComputedStyle(document.body).getPropertyValue('--card').trim()
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, 2 * Math.PI); ctx.fillStyle = bgColor; ctx.fill()

  // Center text
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text').trim()
  ctx.font = 'bold 13px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText('$' + total.toFixed(0), cx, cy)
  ctx.textAlign = 'start'; ctx.textBaseline = 'alphabetic'
}

var heldAmounts = {}

/* ═══ UPDATE: Feed ═══ */

async function updateFeed () {
  var [state, health, valuation, swarm, audit] = await Promise.all([
    api('/api/state'), api('/api/health'), api('/api/valuation'), api('/api/swarm'), api('/api/audit?limit=30')
  ])
  if (health) {
    setDot('td-wallet', health.walletConnected)
    setDot('td-swarm', health.swarmEnabled)
    setDot('td-companion', health.companionConnected)
  }
  if (valuation && valuation.totalUsd > 0) document.getElementById('ss-portfolio').textContent = '$' + valuation.totalUsd.toFixed(0)
  if (swarm && swarm.enabled) {
    document.getElementById('ss-peers').textContent = (swarm.boardPeers || []).length
    if (swarm.identity && swarm.identity.name) {
      var sw = document.getElementById('ss-swarm-wrap')
      if (sw) { sw.classList.remove('hidden'); document.getElementById('ss-swarm-name').textContent = swarm.identity.name }
    }
  }

  if (feedMode === 'activity') {
    var feedItems = []
    if (audit && audit.entries) {
      audit.entries.forEach(function (e) {
        var type = (e.proposalType || e.type || 'system').toLowerCase()
        // AuditEntry uses .type (execution_success, policy_enforcement); ExecutionResult uses .status
        var status = (e.status || (e.type === 'execution_success' ? 'executed' : e.type === 'policy_enforcement' ? 'rejected' : e.type === 'execution_failure' ? 'failed' : '') || '').toLowerCase()
        var indicator = status === 'executed' ? 'fi-success' : status === 'rejected' ? 'fi-rejected' : 'fi-financial'
        if (type === 'feedback') indicator = 'fi-system'
        var amount = e.proposal ? (e.proposal.amount || '') : ''
        var sym = e.proposal ? (e.proposal.symbol || '') : ''
        var d = DECS[sym] || 6
        var humanAmt = amount ? (parseInt(amount, 10) / Math.pow(10, d)).toFixed(d <= 6 ? 2 : 6) : ''
        var summary = opBadge(type) + ' <span style="font-weight:700;">' + status.toUpperCase() + '</span>'
        if (humanAmt) summary += ' ' + humanAmt + ' ' + sym
        if (type === 'swap' && e.proposal) summary += ' &rarr; ' + (e.proposal.toSymbol || '?')
        if (type === 'bridge' && e.proposal) summary += ' ' + (e.proposal.fromChain || '') + ' &rarr; ' + (e.proposal.toChain || '')
        feedItems.push({ ts: e.timestamp || Date.now(), indicator: indicator, summary: summary, detail: e.reason || e.error || ((e.violations || []).join(', ')) || (e.txHash ? 'tx: ' + e.txHash.slice(0, 16) + '...' : '') })
      })
    }
    if (swarm && swarm.recentEvents) {
      swarm.recentEvents.slice(0, 10).forEach(function (e) {
        feedItems.push({ ts: e.timestamp || Date.now(), indicator: 'fi-swarm', summary: '<span style="color:var(--blue);font-weight:700;">SWARM</span> ' + (e.summary || e.kind || 'event'), detail: '' })
      })
    }
    feedItems.sort(function (a, b) { return new Date(b.ts) - new Date(a.ts) })
    var el = document.getElementById('feed-list')
    el.innerHTML = feedItems.length === 0
      ? '<li class="empty" style="padding:2rem;">No activity yet. Your agent will appear here when active.</li>'
      : feedItems.slice(0, 40).map(function (f) {
        return '<li class="feed-item"><div class="feed-indicator ' + f.indicator + '"></div><div class="feed-body"><div class="feed-summary">' + f.summary + '</div>' + (f.detail ? '<div class="feed-detail">' + escapeHtml(f.detail) + '</div>' : '') + '</div><div class="feed-time">' + timeAgo(f.ts) + '</div></li>'
      }).join('')
  }
}

/* ═══ UPDATE: Audit ═══ */
async function updateAudit () {
  var data = await api('/api/audit?limit=100')
  if (!data || !data.entries) return
  document.getElementById('audit-body').innerHTML = data.entries.length === 0
    ? '<tr><td colspan="5" class="empty">No entries</td></tr>'
    : data.entries.map(function (e) {
      var time = e.timestamp ? new Date(e.timestamp).toLocaleString() : '--'
      var type = e.proposalType || e.type || '--'
      // AuditEntry uses .type (execution_success, policy_enforcement); ExecutionResult uses .status
      var status = e.status || (e.type === 'execution_success' ? 'executed' : e.type === 'policy_enforcement' ? 'rejected' : e.type === 'execution_failure' ? 'failed' : e.type === 'proposal_received' ? 'received' : '--')
      var sc = status === 'executed' ? 'var(--green)' : status === 'rejected' ? 'var(--red)' : 'var(--yellow)'
      var amount = e.proposal ? (e.proposal.amount || '--') : '--'
      var sym = e.proposal ? (e.proposal.symbol || '') : ''
      var detail = e.reason || e.error || ((e.violations || []).join(', ')) || (e.txHash ? 'tx: ' + e.txHash.slice(0, 16) + '...' : '')
      return '<tr><td style="font-size:10px;white-space:nowrap;">' + time + '</td><td>' + opBadge(type) + '</td><td style="color:' + sc + ';font-weight:700;">' + status.toUpperCase() + '</td><td>' + amount + ' ' + sym + '</td><td style="color:var(--muted);font-size:11px;">' + detail + '</td></tr>'
    }).join('')
}

/* ═══ UPDATE: Wealth ═══ */

async function updateWealth () {
  var [balances, valuation, priceData, audit] = await Promise.all([
    api('/api/balances'), api('/api/valuation'), api('/api/prices'), api('/api/audit?limit=10')
  ])

  var pieItems = []
  if (balances && balances.balances) {
    var a = allocate(balances.balances)
    a.items.forEach(function (i) {
      if (!heldAmounts[i.symbol]) heldAmounts[i.symbol] = 0
      heldAmounts[i.symbol] += parseFloat(i.formatted) || 0
    })
    var total = (valuation && valuation.totalUsd > 0) ? valuation.totalUsd : a.total
    document.getElementById('w-portfolio-total').innerHTML = '$' + total.toFixed(2) + ' <span class="currency">USD</span>'
    renderAssetList('w-asset-list', a.items)
    var chains = {}; a.items.forEach(function (i) { chains[i.chain] = true })
    document.getElementById('w-chain-count').textContent = Object.keys(chains).length + ' chains'
    // Group for pie
    var grouped = {}
    a.items.forEach(function (i) {
      if (!grouped[i.symbol]) grouped[i.symbol] = { symbol: i.symbol, usd: 0 }
      grouped[i.symbol].usd += i.usd
    })
    pieItems = Object.values(grouped).sort(function (a, b) { return b.usd - a.usd })
    renderPieChart(pieItems)
  }

  // Live prices — grid rows
  if (priceData && priceData.prices) {
    var held = {}
    if (valuation && valuation.assets) valuation.assets.forEach(function (a) { held[(a.symbol || '').toUpperCase()] = true })
    var sorted = priceData.prices.slice().sort(function (a, b) {
      var aH = held[(a.symbol || '').toUpperCase()] ? 1 : 0, bH = held[(b.symbol || '').toUpperCase()] ? 1 : 0
      if (aH !== bH) return bH - aH; return (b.priceUsd || 0) - (a.priceUsd || 0)
    })
    document.getElementById('w-prices').innerHTML = sorted.map(function (p) {
      var sym = (p.symbol || '').toUpperCase()
      var price = p.priceUsd || 0
      var dot = DOT_COLORS[sym] || '#999'
      var name = ASSET_NAMES[sym] || sym
      var priceStr = price >= 1000 ? '$' + price.toLocaleString('en-US', { maximumFractionDigits: 0 }) : price >= 1 ? '$' + price.toFixed(2) : '$' + price.toFixed(6)
      return '<div class="price-row"><div class="price-left"><span class="price-dot" style="background:' + dot + ';"></span><span class="price-sym">' + sym + '</span><span class="price-name">' + name + '</span></div><div class="price-right"><span class="price-usd">' + priceStr + '</span></div></div>'
    }).join('')
  }

  // Recent transactions — combine audit entries (outgoing) + funded balances (incoming)
  var txEl = document.getElementById('w-transactions')
  var txItems = []

  // Outgoing: from audit log (proposals the agent executed or rejected)
  if (audit && audit.entries) {
    audit.entries.filter(function (e) { return e.status === 'executed' || e.status === 'rejected' }).forEach(function (e) {
      var type = (e.proposalType || 'payment').toLowerCase()
      var status = (e.status || '').toLowerCase()
      var amount = e.proposal ? (e.proposal.amount || '') : ''
      var sym = e.proposal ? (e.proposal.symbol || '') : ''
      var d = DECS[sym] || 6
      var humanAmt = amount ? (parseInt(amount, 10) / Math.pow(10, d)).toFixed(d <= 6 ? 2 : 6) : ''
      txItems.push({
        ts: e.timestamp || Date.now(),
        html: '<li class="feed-item"><div class="feed-indicator ' + (status === 'executed' ? 'fi-success' : 'fi-rejected') + '"></div><div class="feed-body"><div class="feed-summary">' + opBadge(type) + ' ' + status.toUpperCase() + ' ' + humanAmt + ' ' + sym + '</div></div><div class="feed-time">' + timeAgo(e.timestamp) + '</div></li>'
      })
    })
  }

  // Incoming: funded balances appear as "received" entries (the wallet was funded externally)
  if (balances && balances.balances) {
    var fundedItems = allocate(balances.balances).items
    fundedItems.forEach(function (item) {
      var amt = parseFloat(item.formatted) || 0
      if (amt > 0) {
        var usdStr = item.usd >= 1 ? '$' + item.usd.toFixed(2) : item.usd > 0 ? '$' + item.usd.toFixed(4) : ''
        txItems.push({
          ts: new Date().toISOString(),
          html: '<li class="feed-item"><div class="feed-indicator fi-success"></div><div class="feed-body"><div class="feed-summary"><span style="background:#1a472a;color:#4ade80;padding:1px 6px;border-radius:3px;font-size:10px;font-weight:700;margin-right:4px;">FUNDED</span> ' + item.formatted + ' <span style="color:var(--muted);font-size:11px;">on ' + item.chain + '</span>' + (usdStr ? ' <span style="color:var(--green);font-size:11px;">' + usdStr + '</span>' : '') + '</div></div></li>'
        })
      }
    })
  }

  txEl.innerHTML = txItems.length > 0
    ? txItems.slice(0, 10).map(function (t) { return t.html }).join('')
    : '<li class="empty">No transactions yet</li>'
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
  lastSwarmData = swarm

  if (swarm.identity) document.getElementById('sw-rep').textContent = ((swarm.identity.reputation || 0) * 100).toFixed(0) + '%'
  var peers = swarm.boardPeers || []
  document.getElementById('sw-peer-count').textContent = peers.length

  // Economics
  if (econ && econ.enabled && econ.economics) {
    var e = econ.economics
    document.getElementById('sw-econ-rev').textContent = '$' + (Number(e.totalRevenue) || 0).toFixed(0)
    document.getElementById('sw-econ-cost').textContent = '$' + (Number(e.totalCosts) || 0).toFixed(0)
    // Deals: count open rooms vs settled
    var rooms = swarm.activeRooms || []
    var open = rooms.filter(function (r) { return r.status !== 'settled' }).length
    var closed = (e.dealsCompleted || 0)
    document.getElementById('sw-deals-open').textContent = open
    document.getElementById('sw-deals-closed').textContent = closed
  }

  // Tag cloud — collect from tags array only (don't mix in categories)
  var anns = swarm.announcements || []
  var tagCounts = {}
  anns.forEach(function (a) {
    var tags = a.tags || []
    tags.forEach(function (t) { if (t) tagCounts[t] = (tagCounts[t] || 0) + 1 })
  })
  var tagEl = document.getElementById('sw-tags')
  var tags = Object.keys(tagCounts).sort(function (a, b) { return tagCounts[b] - tagCounts[a] })
  tagEl.innerHTML = tags.map(function (t) {
    var cls = swarmActiveTag === t ? ' active' : ''
    return '<span class="tag-pill' + cls + '" data-tag="' + t + '">' + t + ' <span class="tag-count">' + tagCounts[t] + '</span></span>'
  }).join('')
  tagEl.querySelectorAll('.tag-pill').forEach(function (el) {
    el.addEventListener('click', function () {
      swarmActiveTag = swarmActiveTag === el.dataset.tag ? null : el.dataset.tag
      renderSwarmBoard(anns)
      // Update tag active state
      tagEl.querySelectorAll('.tag-pill').forEach(function (t) { t.classList.toggle('active', swarmActiveTag === t.dataset.tag) })
    })
  })

  renderSwarmBoard(anns)
}

function renderSwarmBoard (anns) {
  var filtered = anns.filter(function (a) {
    if (swarmActiveTag && !(a.tags || []).includes(swarmActiveTag)) return false
    if (swarmSearchQuery) {
      var q = swarmSearchQuery.toLowerCase()
      var hay = ((a.title || '') + ' ' + (a.description || '') + ' ' + (a.agentName || '') + ' ' + (a.tags || []).join(' ')).toLowerCase()
      if (hay.indexOf(q) === -1) return false
    }
    return true
  })
  document.getElementById('sw-ann-count').textContent = filtered.length
  var el = document.getElementById('sw-anns')
  el.innerHTML = filtered.length === 0
    ? '<div class="empty">No announcements match</div>'
    : filtered.map(function (a) {
      var id = (a.id || '').slice(0, 8)
      var rawCat = a.category || 'general'
      var cat = (rawCat === 'seller' || rawCat === 'service' || rawCat === 'offer') ? 'seller' :
                rawCat === 'auction' ? 'auction' :
                rawCat === 'buyer' ? 'buyer' : 'general'
      var price = (a.priceRange && a.priceRange.min !== undefined && a.priceRange.min !== 'undefined') ? a.priceRange.min + '-' + a.priceRange.max + ' ' + (a.priceRange.symbol || '') : ''
      var tagsHtml = (a.tags || []).map(function (t) { return '<span class="ann-tag" data-tag="' + t + '">' + t + '</span>' }).join('')
      var rep = a.reputation ? ((a.reputation * 100).toFixed(0) + '%') : ''
      return '<div class="ann-item">' +
        '<div class="ann-top"><div class="ann-title-row"><span class="ann-title">' + escapeHtml(a.title || 'Untitled') + '</span><span class="ann-id">' + id + '</span></div><span class="ann-cat cat-' + cat + '">' + cat.toUpperCase() + '</span></div>' +
        (a.description ? '<div class="ann-desc">' + escapeHtml(a.description).slice(0, 200) + '</div>' : '') +
        (tagsHtml ? '<div class="ann-tags">' + tagsHtml + '</div>' : '') +
        '<div class="ann-bottom"><span class="ann-agent">' + escapeHtml(a.agentName || '?') + '</span>' + (rep ? '<span class="ann-rep">' + rep + '</span>' : '') + (price ? '<span class="ann-price">' + price + '</span>' : '') + '<span>' + timeAgo(a.timestamp || Date.now()) + '</span></div>' +
        '</div>'
    }).join('')
}

// Swarm search
var swSearchInput = document.getElementById('sw-search')
var swSearchClear = document.getElementById('sw-search-clear')
if (swSearchInput) {
  swSearchInput.addEventListener('input', function () {
    swarmSearchQuery = swSearchInput.value.trim()
    swSearchClear.style.display = swarmSearchQuery ? 'block' : 'none'
    if (lastSwarmData) renderSwarmBoard(lastSwarmData.announcements || [])
  })
}
if (swSearchClear) {
  swSearchClear.addEventListener('click', function () {
    swSearchInput.value = ''; swarmSearchQuery = ''
    swSearchClear.style.display = 'none'
    if (lastSwarmData) renderSwarmBoard(lastSwarmData.announcements || [])
  })
}

/* ═══ UPDATE: Policies ═══ */
var currentPolicyRules = []

// Toggle capabilities expansion
var capToggle = document.getElementById('pol-cap-toggle')
if (capToggle) {
  capToggle.addEventListener('click', function () {
    var el = document.getElementById('pol-modules')
    if (el) el.classList.toggle('hidden')
  })
}

async function updatePolicies () {
  var [pol, strats] = await Promise.all([api('/api/policies'), api('/api/strategies')])

  // ── GUARDRAILS (budget-first, compact) ──
  var guardrailsEl = document.getElementById('pol-guardrails')
  if (pol && pol.policies && pol.policies[0]) {
    var p = pol.policies[0]
    var rules = p.rules || []
    currentPolicyRules = rules
    var state = p.state || {}
    var dayTotals = state.dayTotals || {}
    var sessionTotals = state.sessionTotals || {}

    // Extract key values
    var maxDay = 0, maxSession = 0, maxTx = 0, maxRecip = 0, cooldown = 0, confidence = 0, hourStart = 0, hourEnd = 24, tz = 'UTC'
    rules.forEach(function (r) {
      if (r.type === 'max_per_day' && r.amount) maxDay = Number(r.amount) / 1000000
      if (r.type === 'max_per_session' && r.amount) maxSession = Number(r.amount) / 1000000
      if (r.type === 'max_per_tx' && r.amount) maxTx = Number(r.amount) / 1000000
      if (r.type === 'max_per_recipient_per_day' && r.amount) maxRecip = Number(r.amount) / 1000000
      if (r.type === 'cooldown_seconds') cooldown = r.seconds
      if (r.type === 'require_confidence') confidence = r.min
      if (r.type === 'time_window') { hourStart = r.start_hour; hourEnd = r.end_hour; tz = r.timezone || 'UTC' }
    })

    // Calculate usage
    var dayUsed = 0, sessionUsed = 0
    var dayRule = rules.find(function (r) { return r.type === 'max_per_day' })
    var sessionRule = rules.find(function (r) { return r.type === 'max_per_session' })
    if (dayRule) dayUsed = Number(dayTotals[dayRule.symbol] || 0) / Number(dayRule.amount) * 100
    if (sessionRule) sessionUsed = Number(sessionTotals[sessionRule.symbol] || 0) / Number(sessionRule.amount) * 100

    function budgetColor (pct) { return pct > 80 ? 'var(--red)' : pct > 50 ? 'var(--yellow)' : 'var(--green)' }

    var html = ''

    // Budget bars (the hero)
    if (maxDay > 0) {
      var daySpent = (dayUsed / 100 * maxDay).toFixed(0)
      html += '<div class="pol-budget-row"><div class="pol-budget-header"><span class="pol-budget-label">Daily Budget</span><span class="pol-budget-nums"><strong>' + daySpent + '</strong> / ' + maxDay + ' USDT</span></div><div class="pol-budget-bar"><div class="pol-budget-bar-fill" style="width:' + Math.min(100, dayUsed).toFixed(0) + '%;background:' + budgetColor(dayUsed) + ';"></div></div></div>'
    }
    if (maxSession > 0) {
      var sessSpent = (sessionUsed / 100 * maxSession).toFixed(0)
      html += '<div class="pol-budget-row"><div class="pol-budget-header"><span class="pol-budget-label">Session Budget</span><span class="pol-budget-nums"><strong>' + sessSpent + '</strong> / ' + maxSession + ' USDT</span></div><div class="pol-budget-bar"><div class="pol-budget-bar-fill" style="width:' + Math.min(100, sessionUsed).toFixed(0) + '%;background:' + budgetColor(sessionUsed) + ';"></div></div></div>'
    }

    // Compact rules line
    var parts = []
    if (maxTx > 0) parts.push('<strong>' + maxTx + '</strong> USDT/tx')
    if (maxRecip > 0) parts.push('<strong>' + maxRecip + '</strong> USDT/recipient/day')
    if (cooldown > 0) parts.push('<strong>' + cooldown + 's</strong> cooldown')
    if (confidence > 0) parts.push('confidence &ge; <strong>' + confidence + '</strong>')
    if (hourStart !== undefined) parts.push('<strong>' + hourStart + ':00–' + hourEnd + ':00</strong> ' + tz)

    if (parts.length > 0) {
      html += '<div class="pol-rules-line">' + parts.join('<span class="pol-rule-sep">·</span>') + '</div>'
    }

    guardrailsEl.innerHTML = html

    // Populate edit modal (only when modal is closed — don't overwrite user input)
    var modalOpen = !document.getElementById('pol-edit-modal').classList.contains('hidden')
    if (!modalOpen) rules.forEach(function (r) {
      if (r.type === 'max_per_tx' && r.amount) document.getElementById('pol-max-tx').value = Number(r.amount) / 1000000
      if (r.type === 'max_per_day' && r.amount) document.getElementById('pol-max-day').value = Number(r.amount) / 1000000
      if (r.type === 'max_per_session' && r.amount) document.getElementById('pol-max-session').value = Number(r.amount) / 1000000
      if (r.type === 'max_per_recipient_per_day' && r.amount) document.getElementById('pol-max-recipient').value = Number(r.amount) / 1000000
      if (r.type === 'cooldown_seconds') document.getElementById('pol-cooldown').value = r.seconds
      if (r.type === 'require_confidence') document.getElementById('pol-confidence').value = r.min
      if (r.type === 'time_window') { document.getElementById('pol-hour-start').value = r.start_hour; document.getElementById('pol-hour-end').value = r.end_hour }
    })
    if (p.name) document.getElementById('pol-name').value = p.name
  }

  // ── STRATEGIES ──
  var stratEl = document.getElementById('pol-strategies')
  if (strats && strats.strategies && strats.strategies.length > 0) {
    stratEl.innerHTML = strats.strategies.map(function (s) {
      var srcClass = s.source === 'purchased' ? 'strat-src-purchased' : s.source === 'agent' ? 'strat-src-agent' : 'strat-src-human'
      var isPending = !s.enabled && (s.source === 'purchased' || s.source === 'agent')
      var toggleCls = s.enabled ? 'strat-toggle-on' : 'strat-toggle-off'
      var lines = s.content.split('\n').filter(function (l) { return l.trim() && !l.startsWith('#') && !l.startsWith('---') && !l.startsWith('enabled:') }).slice(0, 2)
      var desc = lines.join(' ').slice(0, 150)

      var html = '<div class="strat-item' + (isPending ? ' strat-pending' : '') + '">'
      html += '<div class="strat-header"><div class="strat-left"><span class="strat-name">' + escapeHtml(s.name) + '</span><span class="strat-source ' + srcClass + '">' + s.source + '</span></div>'
      html += '<div style="display:flex;align-items:center;gap:0.3rem;">'
      if (!isPending) html += '<button class="strat-toggle ' + toggleCls + '" data-id="' + escapeHtml(s.id) + '" data-enabled="' + (s.enabled ? 'true' : 'false') + '">' + (s.enabled ? 'ON' : 'OFF') + '</button>'
      html += '<button class="strat-action-btn strat-edit-btn" data-filename="' + escapeHtml(s.filename) + '" data-name="' + escapeHtml(s.id) + '">EDIT</button>'
      html += '<button class="strat-delete" data-id="' + escapeHtml(s.id) + '" title="Delete strategy">DEL</button>'
      html += '</div></div>'
      if (desc) html += '<div class="strat-desc">' + escapeHtml(desc) + '</div>'
      if (isPending) {
        html += '<div class="strat-approval-btns"><button class="strat-approve">Approve</button><button class="strat-reject">Reject</button></div>'
      }
      html += '</div>'
      return html
    }).join('')
  } else {
    stratEl.innerHTML = '<div class="empty">No strategies loaded. Add one to guide your agent\'s behavior.</div>'
  }

  // ── CAPABILITIES (compact) ──
  var modEl = document.getElementById('pol-modules')
  var modCount = document.getElementById('pol-mod-count')
  if (strats && strats.modules && strats.modules.length > 0) {
    modCount.textContent = strats.modules.length
    // Short names: strip "— Oikos Policy Engine Skill" suffix
    modEl.innerHTML = strats.modules.map(function (m) {
      var short = (m.name || m.filename).replace(/\s*[—\-]\s*Oikos Policy Engine Skill/i, '').trim()
      return '<span class="pol-mod-tag">' + escapeHtml(short) + '</span>'
    }).join('')
  } else {
    modCount.textContent = '0'
    modEl.innerHTML = ''
  }
}

/* ═══ Settings ═══ */
async function updateSettings () {
  var health = await api('/api/health')
  if (!health) return
  document.getElementById('settings-content').innerHTML = '<div style="font-size:12px;color:var(--muted);line-height:2;">' +
    '<strong>Wallet:</strong> ' + (health.walletConnected ? '<span style="color:var(--green)">Connected</span>' : '<span style="color:var(--red)">Disconnected</span>') + '<br>' +
    '<strong>Swarm:</strong> ' + (health.swarmEnabled ? 'Enabled' : 'Disabled') + '<br>' +
    '<strong>Agent:</strong> ' + (health.companionConnected ? 'Connected' : 'Disconnected') + '<br>' +
    '<strong>Events:</strong> ' + (health.eventsBuffered || 0) + '</div>'
}

/* ═══ CHAT ═══ */
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
    div.innerHTML = '<div class="chat-msg-header"><span>Agent</span><span>' + timeStr + '</span></div><div class="chat-bubble">' + renderMarkdown(text) + '</div>'
  }
  mc.appendChild(div)
  mc.scrollTop = mc.scrollHeight
}

async function updateChat () {
  var data = await api('/api/agent/chat/history?limit=50')
  if (!data || !data.messages) return
  if (data.messages.length > chatMessageCount) {
    data.messages.slice(chatMessageCount).forEach(function (msg) { appendChatMsg(msg.text, msg.from, msg.timestamp) })
    chatMessageCount = data.messages.length
  }
}

async function sendInstruction () {
  var input = document.getElementById('chat-input')
  var text = input.value.trim(); if (!text) return
  var btn = document.getElementById('chat-send')
  btn.disabled = true; btn.textContent = '...'; input.value = ''
  appendChatMsg(text, 'human', Date.now())
  chatMessageCount++
  var result = await apiPost('/api/agent/chat', { message: text, from: 'companion' })
  btn.disabled = false; btn.textContent = 'Send'
  if (result && result.reply) { appendChatMsg(result.reply, 'agent', Date.now()); chatMessageCount++ }
  else if (result && result.error) { appendChatMsg('[Error: ' + result.error + ']', 'agent', Date.now()); chatMessageCount++ }
  else { appendChatMsg('[No response]', 'agent', Date.now()); chatMessageCount++ }
  input.focus()
}

document.getElementById('chat-send').addEventListener('click', sendInstruction)
document.getElementById('chat-input').addEventListener('keydown', function (e) {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendInstruction() }
})

/* ═══ Modals ═══ */
var manualSendBtn = document.getElementById('manual-send-btn')
if (manualSendBtn) manualSendBtn.addEventListener('click', function () { document.getElementById('send-modal').classList.remove('hidden') })
document.getElementById('send-modal-close').addEventListener('click', function () { document.getElementById('send-modal').classList.add('hidden') })
document.getElementById('pay-btn').addEventListener('click', async function () {
  var to = document.getElementById('pay-to').value.trim()
  var amount = document.getElementById('pay-amount').value
  if (!to || !amount) { showResult('pay-result', 'Fill in recipient and amount.', true); return }
  var btn = document.getElementById('pay-btn'); btn.disabled = true; btn.textContent = 'SENDING...'
  var result = await apiPost('/api/companion/propose', { type: 'payment', to: to, amount: amount, symbol: document.getElementById('pay-symbol').value, chain: document.getElementById('pay-chain').value, reason: document.getElementById('pay-reason').value.trim() || 'companion' })
  btn.disabled = false; btn.textContent = 'SEND'
  if (result) showResult('pay-result', JSON.stringify(result, null, 2), result.status === 'rejected' || result.status === 'failed')
  else showResult('pay-result', 'Failed.', true)
})
document.getElementById('settings-btn').addEventListener('click', function () { document.getElementById('settings-modal').classList.remove('hidden'); updateSettings() })
document.getElementById('settings-modal-close').addEventListener('click', function () { document.getElementById('settings-modal').classList.add('hidden') })

// Policy edit modal
document.getElementById('pol-edit-btn').addEventListener('click', function () { document.getElementById('pol-edit-modal').classList.remove('hidden') })
document.getElementById('pol-edit-close').addEventListener('click', function () { document.getElementById('pol-edit-modal').classList.add('hidden') })
document.getElementById('pol-cancel-btn').addEventListener('click', function () { document.getElementById('pol-edit-modal').classList.add('hidden') })

document.getElementById('pol-save-btn').addEventListener('click', async function () {
  var btn = document.getElementById('pol-save-btn')
  btn.disabled = true; btn.textContent = 'APPLYING...'

  var rules = [
    { type: 'max_per_tx', amount: String(Math.round(Number(document.getElementById('pol-max-tx').value) * 1000000)), symbol: 'USDT' },
    { type: 'max_per_session', amount: String(Math.round(Number(document.getElementById('pol-max-session').value) * 1000000)), symbol: 'USDT' },
    { type: 'max_per_day', amount: String(Math.round(Number(document.getElementById('pol-max-day').value) * 1000000)), symbol: 'USDT' },
    { type: 'max_per_recipient_per_day', amount: String(Math.round(Number(document.getElementById('pol-max-recipient').value) * 1000000)), symbol: 'USDT' },
    { type: 'cooldown_seconds', seconds: Number(document.getElementById('pol-cooldown').value) },
    { type: 'require_confidence', min: Number(document.getElementById('pol-confidence').value) },
    { type: 'time_window', start_hour: Number(document.getElementById('pol-hour-start').value), end_hour: Number(document.getElementById('pol-hour-end').value), timezone: 'UTC' }
  ]

  var result = await apiPost('/api/policies', { rules: rules, name: document.getElementById('pol-name').value })
  btn.disabled = false; btn.textContent = 'Apply & Restart Wallet'

  if (result && result.success) {
    showResult('pol-save-result', 'Policy updated! Restart wallet to enforce new rules.', false)
    setTimeout(function () { document.getElementById('pol-edit-modal').classList.add('hidden') }, 2000)
    updatePolicies()
  } else {
    showResult('pol-save-result', result ? result.error : 'Failed to update policy', true)
  }
})

// Strategy add modal — prefill with YAML frontmatter template
document.getElementById('strat-add-btn').addEventListener('click', function () {
  document.getElementById('strat-name').value = ''
  var now = new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  document.getElementById('strat-content').value = '---\nenabled: true\nsource: human\nversion: 1.0\ncreated_at: ' + now + '\ntags: []\n---\n\n# Strategy Title\n\n'
  document.getElementById('strat-add-modal').classList.remove('hidden')
})

// Strategy edit (delegated click on dynamic buttons)
document.addEventListener('click', function (e) {
  var btn = e.target.closest('.strat-edit-btn')
  if (!btn) return
  var filename = btn.dataset.filename
  var name = btn.dataset.name
  // Fetch the full content from API
  api('/api/strategies').then(function (data) {
    if (!data || !data.strategies) return
    var strat = data.strategies.find(function (s) { return s.filename === filename || s.id === name })
    if (!strat) return
    document.getElementById('strat-name').value = strat.id || strat.filename.replace('.md', '')
    document.getElementById('strat-content').value = strat.content
    document.getElementById('strat-add-modal').classList.remove('hidden')
  })
})
document.getElementById('strat-add-close').addEventListener('click', function () { document.getElementById('strat-add-modal').classList.add('hidden') })
document.getElementById('strat-cancel-btn').addEventListener('click', function () { document.getElementById('strat-add-modal').classList.add('hidden') })

document.getElementById('strat-save-btn').addEventListener('click', async function () {
  var name = document.getElementById('strat-name').value.trim()
  var content = document.getElementById('strat-content').value.trim()
  if (!name || !content) { showResult('strat-save-result', 'Name and content required', true); return }

  var btn = document.getElementById('strat-save-btn')
  btn.disabled = true; btn.textContent = 'SAVING...'

  var result = await apiPost('/api/strategies', { filename: name, content: content })
  btn.disabled = false; btn.textContent = 'Save Strategy'

  if (result && result.success) {
    showResult('strat-save-result', 'Strategy saved: ' + result.filename, false)
    document.getElementById('strat-name').value = ''
    document.getElementById('strat-content').value = ''
    setTimeout(function () { document.getElementById('strat-add-modal').classList.add('hidden') }, 1500)
    updatePolicies()
  } else {
    showResult('strat-save-result', result ? result.error : 'Failed to save', true)
  }
})

document.querySelectorAll('.modal-overlay').forEach(function (el) {
  el.addEventListener('click', function (e) { if (e.target === el) el.classList.add('hidden') })
})

// Strategy toggle (delegated — ON/OFF)
document.addEventListener('click', function (e) {
  var toggle = e.target.closest('.strat-toggle')
  if (!toggle) return
  e.stopPropagation()
  var id = toggle.dataset.id
  var currentlyEnabled = toggle.dataset.enabled === 'true'
  var newEnabled = !currentlyEnabled
  // Optimistic UI
  toggle.className = 'strat-toggle ' + (newEnabled ? 'strat-toggle-on' : 'strat-toggle-off')
  toggle.dataset.enabled = newEnabled ? 'true' : 'false'
  toggle.textContent = newEnabled ? 'ON' : 'OFF'
  apiPost('/api/strategies/toggle', { filename: id, enabled: newEnabled }).then(function (result) {
    if (!result || !result.success) {
      toggle.className = 'strat-toggle ' + (currentlyEnabled ? 'strat-toggle-on' : 'strat-toggle-off')
      toggle.dataset.enabled = currentlyEnabled ? 'true' : 'false'
      toggle.textContent = currentlyEnabled ? 'ON' : 'OFF'
    }
    updatePolicies()
  })
})

// Strategy delete (delegated)
document.addEventListener('click', function (e) {
  var btn = e.target.closest('.strat-delete')
  if (!btn) return
  var id = btn.dataset.id
  if (!confirm('Delete strategy "' + id + '"? This cannot be undone.')) return
  apiPost('/api/strategies/delete', { filename: id }).then(function (result) {
    if (result && result.success) updatePolicies()
  })
})

// Auth bar collapse/expand
document.getElementById('auth-bar').addEventListener('click', function () {
  var expand = document.getElementById('auth-expand')
  var chevron = document.getElementById('auth-chevron')
  expand.classList.toggle('hidden')
  chevron.classList.toggle('open')
})

// Address popup (bottom bar)
document.getElementById('bb-addr-label').addEventListener('click', function () {
  var popup = document.getElementById('bb-addr-popup')
  if (!popup.classList.contains('hidden')) { popup.classList.add('hidden'); return }
  // Fetch addresses
  api('/api/addresses').then(function (data) {
    if (!data || !data.addresses || data.addresses.length === 0) {
      popup.innerHTML = '<div style="font-size:10px;color:var(--dim);padding:0.3rem;">No addresses available</div>'
    } else {
      popup.innerHTML = data.addresses.map(function (a) {
        var short = a.address.length > 20 ? a.address.slice(0, 10) + '...' + a.address.slice(-8) : a.address
        return '<div class="bb-addr-row">' +
          '<span class="bb-addr-chain">' + escapeHtml(a.chain) + '</span>' +
          '<span class="bb-addr-val" title="' + escapeHtml(a.address) + '">' + short + '</span>' +
          '<button class="bb-addr-copy" data-addr="' + escapeHtml(a.address) + '">COPY</button>' +
          '</div>'
      }).join('')
    }
    popup.classList.remove('hidden')
  })
})
// Close address popup when clicking outside
document.addEventListener('click', function (e) {
  var popup = document.getElementById('bb-addr-popup')
  if (!popup.classList.contains('hidden') && !e.target.closest('#bb-addresses')) {
    popup.classList.add('hidden')
  }
})
// Copy address
document.addEventListener('click', function (e) {
  var btn = e.target.closest('.bb-addr-copy')
  if (!btn) return
  var addr = btn.dataset.addr
  if (navigator.clipboard) {
    navigator.clipboard.writeText(addr).then(function () {
      btn.textContent = 'OK'; btn.classList.add('copied')
      setTimeout(function () { btn.textContent = 'COPY'; btn.classList.remove('copied') }, 1500)
    })
  }
})

/* ═══ PASSPHRASE AUTH ═══ */

// Update auth UI in Policy Engine tab
async function updateAuthUI () {
  var data = await api('/api/auth/status')
  if (!data) return
  var badge = document.getElementById('auth-badge')
  var enableBtn = document.getElementById('auth-enable-btn')
  var disableBtn = document.getElementById('auth-disable-btn')
  var ppInput = document.getElementById('auth-passphrase')

  if (data.enabled) {
    badge.textContent = data.authenticated ? 'ON' : 'LOCKED'
    badge.style.color = data.authenticated ? 'var(--green)' : 'var(--yellow)'
    enableBtn.classList.add('hidden')
    disableBtn.classList.remove('hidden')
    ppInput.placeholder = 'Current password to disable'
    document.getElementById('auth-threshold').value = data.threshold
    document.getElementById('auth-timeout').value = data.timeoutMinutes
  } else {
    badge.textContent = 'OFF'
    badge.style.color = 'var(--dim)'
    enableBtn.classList.remove('hidden')
    disableBtn.classList.add('hidden')
    ppInput.placeholder = 'Min 4 chars'
  }
}

// Enable auth
document.getElementById('auth-enable-btn').addEventListener('click', async function () {
  var pp = document.getElementById('auth-passphrase').value
  var threshold = Number(document.getElementById('auth-threshold').value) || 100
  var timeout = Number(document.getElementById('auth-timeout').value) || 15
  if (!pp || pp.length < 4) { showResult('auth-result', 'Passphrase must be at least 4 characters', true); return }
  var result = await apiPost('/api/auth/setup', { passphrase: pp, threshold: threshold, timeoutMinutes: timeout })
  if (result && result.success) {
    showResult('auth-result', 'Passphrase auth enabled!', false)
    document.getElementById('auth-passphrase').value = ''
    updateAuthUI()
  } else {
    showResult('auth-result', result ? result.error : 'Failed', true)
  }
})

// Disable auth
document.getElementById('auth-disable-btn').addEventListener('click', async function () {
  var pp = document.getElementById('auth-passphrase').value
  if (!pp) { showResult('auth-result', 'Enter current passphrase to disable', true); return }
  var result = await apiPost('/api/auth/disable', { passphrase: pp })
  if (result && result.success) {
    showResult('auth-result', 'Passphrase auth disabled', false)
    document.getElementById('auth-passphrase').value = ''
    updateAuthUI()
  } else {
    showResult('auth-result', 'Incorrect passphrase', true)
  }
})

// Auth prompt modal (when tx needs authorization)
var pendingAuthResolve = null

function showAuthPrompt (desc, amount, proposalId) {
  document.getElementById('auth-prompt-desc').textContent = desc
  document.getElementById('auth-prompt-amount').textContent = '$' + amount + ' USDT'
  document.getElementById('auth-prompt-input').value = ''
  document.getElementById('auth-prompt-result').classList.add('hidden')
  document.getElementById('auth-prompt-modal').classList.remove('hidden')
  document.getElementById('auth-prompt-input').focus()
  return new Promise(function (resolve) { pendingAuthResolve = resolve })
}

document.getElementById('auth-prompt-approve').addEventListener('click', async function () {
  var pp = document.getElementById('auth-prompt-input').value
  if (!pp) { showResult('auth-prompt-result', 'Enter passphrase', true); return }
  var result = await apiPost('/api/auth/verify', { passphrase: pp })
  if (result && result.valid) {
    showResult('auth-prompt-result', '✓ Authorized', false)
    setTimeout(function () { document.getElementById('auth-prompt-modal').classList.add('hidden') }, 500)
    if (pendingAuthResolve) pendingAuthResolve(true)
  } else {
    showResult('auth-prompt-result', '✗ Invalid passphrase', true)
    if (pendingAuthResolve) pendingAuthResolve(false)
  }
})

document.getElementById('auth-prompt-reject').addEventListener('click', function () {
  document.getElementById('auth-prompt-modal').classList.add('hidden')
  if (pendingAuthResolve) pendingAuthResolve(false)
})

// Poll for pending auth requests (from companion/MCP/autonomy)
setInterval(async function () {
  var data = await api('/api/auth/pending')
  if (data && data.pending && data.pending.length > 0) {
    var p = data.pending[0]
    showAuthPrompt(p.description, p.amount, p.proposalId).then(async function (approved) {
      if (approved) {
        var pp = document.getElementById('auth-prompt-input').value
        await apiPost('/api/auth/pending/' + p.proposalId + '/resolve', { passphrase: pp })
      }
    })
  }
}, 3000)

/* ═══ UPDATE DISPATCHER ═══ */
async function updateCurrentView () {
  switch (currentView) {
    case 'feed': await updateFeed(); break
    case 'wealth': await updateWealth(); break
    case 'swarm': await updateSwarm(); break
    case 'policies': await updatePolicies(); await updateAuthUI(); break
  }
  await updateChat()
}

/* ═══ BOOT ═══ */
async function boot () {
  console.log('[app] Booting Oikos App...')
  var ready = false
  for (var i = 0; i < 10; i++) {
    try { var res = await fetch(API_BASE + '/api/health'); if (res.ok) { ready = true; break } } catch (e) {}
    await new Promise(function (resolve) { setTimeout(resolve, 300) })
  }
  if (!ready) {
    var content = document.getElementById('content-scroll')
    if (content) content.innerHTML = '<div style="padding:3rem;text-align:center;"><div style="font-size:1.5rem;font-weight:700;color:var(--red);margin-bottom:1rem;">Internal Error</div><div style="color:var(--muted);">Internal API not available. Try restarting the app.</div></div>'
    return
  }
  await fetchPrices()
  await updateCurrentView()
  setInterval(updateCurrentView, 2500)
  setInterval(fetchPrices, 10000)
  console.log('[app] Oikos App ready.')
}

boot()
