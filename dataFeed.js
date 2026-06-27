// dataFeed.js
// Fetches recent intraday candles for EUR/USD and BTC/USD from Twelve Data.
// Docs: https://twelvedata.com/docs#time-series
//
// Twelve Data free tier: ~800 requests/day, 8 requests/minute.
// Checking 2 symbols every 5 minutes = ~576 requests/day. Safe margin.

const TWELVE_DATA_BASE = "https://api.twelvedata.com/time_series";

/**
 * Fetch recent OHLC candles for a symbol.
 * @param {string} symbol e.g. "EUR/USD" or "BTC/USD"
 * @param {string} interval e.g. "5min", "15min", "1h"
 * @param {number} outputsize how many candles to retrieve
 * @param {string} apiKey Twelve Data API key
 * @returns {Promise<Array<{time:number, open:number, high:number, low:number, close:number}>>}
 */
export async function fetchCandles(symbol, interval, outputsize, apiKey) {
  const url = new URL(TWELVE_DATA_BASE);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("interval", interval);
  url.searchParams.set("outputsize", String(outputsize));
  url.searchParams.set("apikey", apiKey);
  url.searchParams.set("order", "ASC"); // oldest first

  const res = await fetch(url.toString());
  const data = await res.json();

  if (data.status === "error" || data.code >= 400) {
    throw new Error(`Twelve Data error for ${symbol}: ${data.message || JSON.stringify(data)}`);
  }

  if (!data.values || !Array.isArray(data.values)) {
    throw new Error(`Twelve Data returned no values for ${symbol}: ${JSON.stringify(data)}`);
  }

  return data.values
    .map((v) => ({
      time: new Date(v.datetime).getTime(),
      open: parseFloat(v.open),
      high: parseFloat(v.high),
      low: parseFloat(v.low),
      close: parseFloat(v.close),
    }))
    .sort((a, b) => a.time - b.time);
}

export const SYMBOLS = {
  EURUSD: "EUR/USD",
  BTCUSD: "BTC/USD",
};
