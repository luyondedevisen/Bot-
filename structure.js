// structure.js
// Market structure analysis: finds swing highs/lows and detects
// Break of Structure (BOS) and Change of Character (CHoCH) events.
//
// Definitions used here (these are conventions — not universal law):
//
//  Swing High: a candle whose high is higher than `lookback` candles
//              on both sides of it.
//  Swing Low:  a candle whose low is lower than `lookback` candles
//              on both sides of it.
//
//  Trend state machine:
//    - We track the most recent confirmed swing high (lastSwingHigh)
//      and swing low (lastSwingLow), plus a current trend: 'up', 'down', or 'none'.
//    - BOS (bullish): price closes above lastSwingHigh while trend is 'up'
//      (continuation) -> trend stays 'up', lastSwingHigh updates.
//    - BOS (bearish): price closes below lastSwingLow while trend is 'down'
//      (continuation) -> trend stays 'down', lastSwingLow updates.
//    - CHoCH (bullish): price closes above lastSwingHigh while trend is 'down'
//      -> trend flips to 'up'. This is the classic reversal signal.
//    - CHoCH (bearish): price closes below lastSwingLow while trend is 'up'
//      -> trend flips to 'down'.
//
// This file is pure logic — no network calls — so it's easy to unit test.

/**
 * Find confirmed swing highs and lows in a series of candles.
 * @param {Array<{time:number, open:number, high:number, low:number, close:number}>} candles
 * @param {number} lookback how many candles on each side must be lower/higher
 * @returns {Array<{index:number, time:number, price:number, type:'high'|'low'}>}
 */
export function findSwings(candles, lookback = 2) {
  const swings = [];
  for (let i = lookback; i < candles.length - lookback; i++) {
    const candle = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= candle.high) isHigh = false;
      if (candles[j].low <= candle.low) isLow = false;
    }

    if (isHigh) {
      swings.push({ index: i, time: candle.time, price: candle.high, type: "high" });
    }
    if (isLow) {
      swings.push({ index: i, time: candle.time, price: candle.low, type: "low" });
    }
  }
  return swings;
}

/**
 * Walk through candles in order, maintaining a trend state machine,
 * and emit BOS / CHoCH events whenever structure breaks.
 *
 * @param {Array<candle>} candles - ascending by time
 * @param {number} lookback - swing detection sensitivity
 * @returns {{events: Array<event>, state: object}}
 */
export function analyzeStructure(candles, lookback = 2) {
  const swings = findSwings(candles, lookback);

  let lastSwingHigh = null; // {price, time, index}
  let lastSwingLow = null;
  let trend = "none"; // 'up' | 'down' | 'none'
  const events = [];

  // Build a quick lookup: for each candle index, which swing (if any) was
  // *confirmed* at that point (a swing at index i is only known after
  // `lookback` further candles have closed).
  const confirmedAt = new Map(); // confirmIndex -> swing
  for (const s of swings) {
    const confirmIndex = s.index + lookback;
    if (!confirmedAt.has(confirmIndex)) confirmedAt.set(confirmIndex, []);
    confirmedAt.get(confirmIndex).push(s);
  }

  // Track the price level of the last break we already emitted an event for,
  // so a run of consecutive closes beyond the same level only fires once.
  let lastBrokenHighLevel = null;
  let lastBrokenLowLevel = null;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];

    // 1. Check if this candle's close breaks current structure
    if (
      lastSwingHigh &&
      candle.close > lastSwingHigh.price &&
      lastSwingHigh.price !== lastBrokenHighLevel
    ) {
      if (trend === "down") {
        events.push({
          type: "CHoCH",
          direction: "bullish",
          time: candle.time,
          price: candle.close,
          brokenLevel: lastSwingHigh.price,
          brokenLevelTime: lastSwingHigh.time,
          note: "Price closed above last swing high while trend was down — possible reversal to bullish.",
        });
        trend = "up";
      } else if (trend === "up") {
        events.push({
          type: "BOS",
          direction: "bullish",
          time: candle.time,
          price: candle.close,
          brokenLevel: lastSwingHigh.price,
          brokenLevelTime: lastSwingHigh.time,
          note: "Price closed above last swing high, continuing the existing uptrend.",
        });
      } else {
        // trend was 'none' (first break) — establish trend, no event spam
        trend = "up";
      }
      lastBrokenHighLevel = lastSwingHigh.price;
    }

    if (
      lastSwingLow &&
      candle.close < lastSwingLow.price &&
      lastSwingLow.price !== lastBrokenLowLevel
    ) {
      if (trend === "up") {
        events.push({
          type: "CHoCH",
          direction: "bearish",
          time: candle.time,
          price: candle.close,
          brokenLevel: lastSwingLow.price,
          brokenLevelTime: lastSwingLow.time,
          note: "Price closed below last swing low while trend was up — possible reversal to bearish.",
        });
        trend = "down";
      } else if (trend === "down") {
        events.push({
          type: "BOS",
          direction: "bearish",
          time: candle.time,
          price: candle.close,
          brokenLevel: lastSwingLow.price,
          brokenLevelTime: lastSwingLow.time,
          note: "Price closed below last swing low, continuing the existing downtrend.",
        });
      } else {
        trend = "down";
      }
      lastBrokenLowLevel = lastSwingLow.price;
    }

    // 2. Update last swing high/low with any swing confirmed at this index
    const newlyConfirmed = confirmedAt.get(i) || [];
    for (const s of newlyConfirmed) {
      if (s.type === "high") {
        if (!lastSwingHigh || s.price !== lastSwingHigh.price) {
          lastSwingHigh = { price: s.price, time: s.time, index: s.index };
        }
      } else {
        if (!lastSwingLow || s.price !== lastSwingLow.price) {
          lastSwingLow = { price: s.price, time: s.time, index: s.index };
        }
      }
    }
  }

  return {
    events,
    state: {
      trend,
      lastSwingHigh,
      lastSwingLow,
      swings,
    },
  };
}

/**
 * Convenience: return only the most recent event (if any), used to decide
 * whether a fresh signal should be emailed.
 */
export function latestEvent(events) {
  if (!events.length) return null;
  return events[events.length - 1];
}
