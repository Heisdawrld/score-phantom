import { readFileSync, writeFileSync } from "fs";
const c = readFileSync("client/src/App.tsx", "utf8");
const lines = c.split("\n");
const out = [];
let i = 0;
while (i < lines.length) {
  const l = lines[i];
  if (l === "function Router() {") {
    out.push("function GlassBubbles() {");
    out.push("  return (");
    out.push("    <div className=\"fixed inset-0 pointer-events-none overflow-hidden z-0\" aria-hidden=\"true\">");
    out.push("      <div className=\"absolute top-[-25%] left-[-15%] w-[70vw] h-[70vw] rounded-full\" style={{ background: \"radial-gradient(circle, rgba(16,231,116,0.07), transparent 70%)\", filter: \"blur(80px)\" }}/>");
    out.push("      <div className=\"absolute bottom-[-20%] right-[-10%] w-[60vw] h-[60vw] rounded-full\" style={{ background: \"radial-gradient(circle, rgba(59,130,246,0.05), transparent 70%)\", filter: \"blur(90px)\" }}/>");
    out.push("      <div className=\"absolute top-[50%] right-[5%] w-[35vw] h-[35vw] rounded-full\" style={{ background: \"radial-gradient(circle, rgba(16,231,116,0.03), transparent 70%)\", filter: \"blur(60px)\" }}/>");
    out.push("    </div>");
    out.push("  );");
    out.push("}");
    out.push("");
    out.push("function Router() {");
    out.push("  const [loc] = useLocation();");
    i++;
    continue;
  }
  if (l === "  return (" && lines[i+1] && lines[i+1].trim() === "<Switch>") {
    out.push("  return (");
    out.push("    <AnimatePresence mode=\"wait\" initial={false}>");
    out.push("      <motion.div key={loc} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: \"easeOut\" }}>");
    i++; out.push("        " + lines[i].trim());
    i++; continue;
  }
  if (l.trim() === "</Switch>") {
    out.push("    </Switch>");
    out.push("      </motion.div>");
    out.push("    </AnimatePresence>");
    i++; continue;
  }
  if (l.includes("<ReferralCapture />")) {
    out.push("            <GlassBubbles />");
    out.push(l);
    i++; continue;
  }
  out.push(l);
  i++;
}
writeFileSync("client/src/App.tsx", out.join("\n")); console.log("Done! Lines:", out.length);
