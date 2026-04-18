import { readFileSync, writeFileSync } from "fs";
let c = readFileSync("client/src/App.tsx", "utf8");
c = c.replace(/function AnimatedRouter[\s\S]*?ROUTES_PLACEHOLDER[\s\S]*?\n}\n\n/, "");
c = c.replace("function Router() {\n  return (\n    <Switch>", "function Router() {\n  const [loc] = useLocation();\n  return (\n    <AnimatePresence mode=\"wait\" initial={false}>\n      <motion.div key={loc} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.18, ease: \"easeOut\" }}>\n        <Switch>");
c = c.replace("    </Switch>\n  );\n}\n\n// Capture", "    </Switch>\n      </motion.div>\n    </AnimatePresence>\n  );\n}\n\n// Capture");
c = c.replace("<ReferralCapture />\n            <Router />", "<GlassBubbles />\n            <ReferralCapture />\n            <Router />");
writeFileSync("client/src/App.tsx", c); console.log("Done! Lines:", c.split("\\n").length);
