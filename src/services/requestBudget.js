// requestBudget.js - Daily API request budget manager for SportAPI.ai
let dailyCount = 0;
let lastResetDate = "";
const DAILY_LIMIT = 1500;
function getTodayStr() { return new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" }); }
function checkReset() { const today = getTodayStr(); if (today !== lastResetDate) { if (lastResetDate) console.log("[Budget] Reset: " + lastResetDate + " used " + dailyCount + "/" + DAILY_LIMIT); dailyCount = 0; lastResetDate = today; } }
export function hasBudget(count = 1) { checkReset(); return dailyCount + count <= DAILY_LIMIT; }
export function consumeBudget(count = 1) { checkReset(); dailyCount += count; if ([100,500,1000,1400].includes(dailyCount)) console.log("[Budget] WARNING: " + dailyCount + "/" + DAILY_LIMIT + " used today " + lastResetDate); }
export function getBudgetStatus() { checkReset(); return { used: dailyCount, remaining: DAILY_LIMIT - dailyCount, limit: DAILY_LIMIT, date: lastResetDate, percentUsed: ((dailyCount / DAILY_LIMIT) * 100).toFixed(1) + "%" }; }
export function resetBudget() { dailyCount = 0; lastResetDate = getTodayStr(); }
