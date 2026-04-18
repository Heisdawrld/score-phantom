import re
import os

with open('/workspace/score-phantom/client/src/pages/Dashboard.tsx', 'r') as f:
    content = f.read()

def extract_function(name, text):
    pattern = rf"function\s+{name}\s*\([\s\S]*?\)\s*(?::\s*[\w<>\|\s\[\]]+\s*)?{{"
    match = re.search(pattern, text)
    if not match:
        print(f"Could not find {name}")
        return None, text
    
    start_idx = match.start()
    body_start_idx = match.end() - 1
    
    brace_count = 1
    end_idx = body_start_idx
    
    for i in range(body_start_idx + 1, len(text)):
        if text[i] == '{':
            brace_count += 1
        elif text[i] == '}':
            brace_count -= 1
            
        if brace_count == 0:
            end_idx = i + 1
            break
            
    func_content = text[start_idx:end_idx]
    new_text = text[:start_idx] + text[end_idx:]
    return func_content, new_text

functions_to_extract = [
    "TodaysBestBet",
    "QuickActions",
    "YourStats",
    "ValueBetCard",
    "UpcomingFixtures",
    "AccaSection",
    "EnrichmentBadge",
    "LeagueGroup"
]

imports = """import { useState } from "react";
import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { ChevronRight, ChevronDown, ChevronUp, Trophy, Zap, Lock, AlertCircle, Flame, BarChart2, Activity, Star, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { ConfidenceBadge } from "@/components/ui/ConfidenceBadge";
import { TeamLogo } from "@/components/TeamLogo";

function toWAT(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-NG', { timeZone: 'Africa/Lagos', hour: '2-digit', minute: '2-digit', hour12: false });
  } catch { return ''; }
}
"""

os.makedirs('/workspace/score-phantom/client/src/components/dashboard', exist_ok=True)

remaining_text = content
for name in functions_to_extract:
    func_str, remaining_text = extract_function(name, remaining_text)
    if func_str:
        file_path = f'/workspace/score-phantom/client/src/components/dashboard/{name}.tsx'
        with open(file_path, 'w') as f:
            # For LeagueGroup, we might need EnrichmentBadge to be imported or we can extract it properly.
            # Actually, EnrichmentBadge is extracted BEFORE LeagueGroup, so LeagueGroup needs EnrichmentBadge.
            # We will just append the specific imports for LeagueGroup.
            if name == "LeagueGroup":
                f.write(imports + '\nimport { EnrichmentBadge } from "./EnrichmentBadge";\n\nexport ' + func_str + "\n")
            else:
                f.write(imports + "\nexport " + func_str + "\n")
        print(f"Extracted {name} to {file_path}")

# Fix up Dashboard.tsx
# Import the components.
import_statements = "\n".join([f"import {{ {name} }} from \"@/components/dashboard/{name}\";" for name in functions_to_extract])
remaining_text = remaining_text.replace("import { TeamLogo } from \"@/components/TeamLogo\";", "import { TeamLogo } from \"@/components/TeamLogo\";\n" + import_statements)

with open('/workspace/score-phantom/client/src/pages/Dashboard.tsx', 'w') as f:
    f.write(remaining_text)

print("Updated Dashboard.tsx")
