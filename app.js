// app.js
// Polls the bot server's /api/status endpoint and renders the dashboard.
//
// The dashboard is served by the same Express server as the API
// (see server/index.js), so we can just call relative paths like
// /api/status — no separate URL needed, and no CORS issues.
const API_BASE_URL = ""; // same-origin; leave blank

const REFRESH_MS = 30 * 1000; // refresh the dashboard view every 30s
// (the bot itself checks the market every few minutes server-side;
// this just controls how often the page re-reads that state)

const SYMBOL_LABELS = {
  EURUSD: "EUR / USD",
  BTCUSD: "BTC / USD",
};

function formatPrice(symbolKey, price) {
  if (price == null) return "—";
  return symbolKey === "EURUSD" ? price.toFixed(5) : price.toFixed(2);
}

function timeAgo(isoString) {
  if (!isoString) return "never";
  const diffMs = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins === 1) return "1 min ago";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m ago`;
}

function buildSparklinePoints(swings, width, height) {
  if (!swings || swings.length < 2) return "";
  const prices = swings.map((s) => s.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  return swings
    .map((s, i) => {
      const x = (i / (swings.length - 1)) * width;
      const y = height - ((s.price - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

function renderSparkline(swings, trend) {
  const width = 300;
  const height = 48;
  const points = buildSparklinePoints(swings, width, height);
  const color =
    trend === "up" ? "var(--bullish)" : trend === "down" ? "var(--bearish)" : "var(--neutral)";

  if (!points) {
    return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none"></svg>`;
  }

  return `
    <svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">
      <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" opacity="0.85" />
    </svg>
  `;
}

function renderLogEntries(events) {
  if (!events || events.length === 0) {
    return `<div class="empty-state">No structure breaks detected yet. Waiting for the next check…</div>`;
  }

  return events
    .slice()
    .reverse()
    .slice(0, 8)
    .map((e) => {
      const dirClass = e.direction === "bullish" ? "bullish" : "bearish";
      const timeLabel = new Date(e.time).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      return `
        <div class="log-entry">
          <div class="log-dot ${dirClass}"></div>
          <div>
            <span class="log-type ${dirClass}">${e.type} · ${e.direction}</span>
            <span class="log-note">${e.note}</span>
          </div>
          <div class="log-time">${timeLabel}</div>
        </div>
      `;
    })
    .join("");
}

function renderTicket(symbolKey, data) {
  const trend = data.trend || "none";
  const trendWord = trend === "up" ? "Bullish" : trend === "down" ? "Bearish" : "Neutral";

  return `
    <div class="ticket">
      <div class="ticket-head">
        <div class="symbol">${SYMBOL_LABELS[symbolKey] || symbolKey}</div>
        <div class="price">${formatPrice(symbolKey, data.lastPrice)}</div>
      </div>

      <div class="trend-row">
        <div class="trend-word ${trend}">${trendWord}</div>
        <div class="trend-label">current structure</div>
      </div>

      ${renderSparkline(data.swings, trend)}

      <div class="divider"></div>
      <div class="log-label">Recent breaks</div>
      <div class="log">${renderLogEntries(data.allEvents)}</div>

      ${data.error ? `<div class="error-banner">⚠ ${data.error}</div>` : ""}

      <div style="margin-top:14px; font-family: var(--mono); font-size: 10.5px; color: var(--text-faint);">
        last checked ${timeAgo(data.lastChecked)}
      </div>
    </div>
  `;
}

async function refresh() {
  const grid = document.getElementById("grid");
  const statusDot = document.getElementById("statusDot");
  const statusText = document.getElementById("statusText");
  const serverTimeEl = document.getElementById("serverTime");
  const configBanner = document.getElementById("configBanner");

  try {
    const res = await fetch(`${API_BASE_URL}/api/status`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    configBanner.style.display = "none";
    statusDot.classList.remove("offline");
    statusText.textContent = `live · checking every ${data.pollIntervalMinutes}min`;
    serverTimeEl.textContent = new Date(data.serverTime).toLocaleString();

    grid.innerHTML = Object.entries(data.symbols)
      .map(([key, val]) => renderTicket(key, val))
      .join("");
  } catch (err) {
    statusDot.classList.add("offline");
    statusText.textContent = "offline";
    configBanner.style.display = "block";
    console.error("Failed to fetch status:", err);
  }
}

refresh();
setInterval(refresh, REFRESH_MS);
