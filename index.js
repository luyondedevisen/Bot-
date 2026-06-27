// index.js
// Main entry point: runs an Express server (for the dashboard) AND
// a background polling loop that checks EUR/USD + BTC/USD every
// POLL_INTERVAL_MINUTES, detects new structure events, and emails
// the user when a fresh signal appears.

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { fetchCandles, SYMBOLS } from "./dataFeed.js";
import { analyzeStructure, latestEvent } from "./structure.js";
import { sendSignalEmail } from "./mailer.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config();

const PORT = process.env.PORT || 3000;
const POLL_INTERVAL_MINUTES = parseInt(process.env.POLL_INTERVAL_MINUTES || "5", 10);
const INTERVAL = "5min"; // candle timeframe used for structure analysis
const CANDLE_COUNT = 100; // how many candles to pull each check
const SWING_LOOKBACK = 2; // sensitivity of swing detection

const TWELVE_DATA_API_KEY = process.env.TWELVE_DATA_API_KEY;
const ALERT_EMAIL_TO = process.env.ALERT_EMAIL_TO;

if (!TWELVE_DATA_API_KEY) {
  console.warn("⚠️  TWELVE_DATA_API_KEY is not set. The bot will not be able to fetch price data.");
}
if (!ALERT_EMAIL_TO) {
  console.warn("⚠️  ALERT_EMAIL_TO is not set. No emails will be sent.");
}

// In-memory state the dashboard reads from.
// (Resets on server restart — fine for a personal alert tool.)
const state = {
  EURUSD: { lastEvent: null, allEvents: [], swings: [], trend: "none", lastChecked: null, lastPrice: null, error: null },
  BTCUSD: { lastEvent: null, allEvents: [], swings: [], trend: "none", lastChecked: null, lastPrice: null, error: null },
};

// Track the last event timestamp we already emailed for, per symbol,
// so we don't send duplicate emails for the same break.
const lastEmailedEventTime = {
  EURUSD: null,
  BTCUSD: null,
};

async function checkSymbol(key, twelveDataSymbol) {
  try {
    const candles = await fetchCandles(twelveDataSymbol, INTERVAL, CANDLE_COUNT, TWELVE_DATA_API_KEY);
    const { events, state: structureState } = analyzeStructure(candles, SWING_LOOKBACK);
    const newest = latestEvent(events);
    const currentPrice = candles[candles.length - 1]?.close ?? null;

    state[key].trend = structureState.trend;
    state[key].lastPrice = currentPrice;
    state[key].lastChecked = new Date().toISOString();
    state[key].allEvents = events.slice(-20); // keep last 20 for the dashboard
    state[key].lastEvent = newest;
    state[key].swings = structureState.swings.slice(-30); // last 30 swing points for sparkline
    state[key].error = null;

    // Email only if this event is new (by timestamp) and we have an address.
    if (newest && newest.time !== lastEmailedEventTime[key] && ALERT_EMAIL_TO) {
      await sendSignalEmail({
        to: ALERT_EMAIL_TO,
        symbol: twelveDataSymbol,
        event: newest,
      });
      lastEmailedEventTime[key] = newest.time;
      console.log(`✅ Emailed ${key} ${newest.type} (${newest.direction}) at ${new Date(newest.time).toISOString()}`);
    }
  } catch (err) {
    state[key].error = err.message;
    console.error(`❌ Error checking ${key}:`, err.message);
  }
}

async function pollAll() {
  console.log(`\n🔍 Checking markets at ${new Date().toISOString()}...`);
  await checkSymbol("EURUSD", SYMBOLS.EURUSD);
  await checkSymbol("BTCUSD", SYMBOLS.BTCUSD);
}

// --- Express app for the dashboard ---
const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/status", (req, res) => {
  res.json({
    pollIntervalMinutes: POLL_INTERVAL_MINUTES,
    candleInterval: INTERVAL,
    symbols: state,
    serverTime: new Date().toISOString(),
  });
});

app.get("/api/health", (req, res) => {
  res.json({ ok: true });
});

// Serve the dashboard (index.html + app.js) from ../public
app.use(express.static(path.join(__dirname, "..", "public")));

app.listen(PORT, () => {
  console.log(`🚀 Dashboard API running on port ${PORT}`);
  // Run an initial check immediately, then on the configured interval.
  pollAll();
  setInterval(pollAll, POLL_INTERVAL_MINUTES * 60 * 1000);
});
