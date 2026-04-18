import { readFileSync, writeFileSync } from "fs";
const lines = readFileSync("client/src/pages/Dashboard.tsx", "utf8").split("\n");
const out = lines.map(l => {
  if (l.includes("enrichedDeepCount ?? 0}</span>")) return l.replace(/{\\(data as any\\)\\.enrichedDeepCount \\?\\? 0}<\\/span>/, "{(data as any).total ?? 0}<\\/span>");
  if (l.includes("deeply enriched fixtures today")) return l.replace("deeply enriched fixtures today \\xb7 {data.total} total", "fixtures today");
  return l;
});
writeFileSync("client/src/pages/Dashboard.tsx", out.join("\\n")); console.log("Done");
