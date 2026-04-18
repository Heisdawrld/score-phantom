import { readFileSync, writeFileSync } from "fs";
const mc = readFileSync("client/src/pages/MatchCenter.tsx", "utf8");
const newTab = readFileSync("/tmp/new_stats.txt", "utf8");
const start = mc.indexOf("function StatsTab(");
const end = mc.indexOf("\nfunction PhantomChatTab(");
if (start === -1 || end === -1) { console.log("Markers not found", start, end); process.exit(1); }
const result = mc.slice(0, start) + newTab + mc.slice(end);
writeFileSync("client/src/pages/MatchCenter.tsx", result);
console.log("Done! File now", result.length, "chars,", result.split("\n").length, "lines");
