import re
import os

with open('/workspace/score-phantom/client/src/pages/MatchCenter.tsx', 'r') as f:
    content = f.read()

def extract_function(name, text):
    pattern = rf"function\s+{name}\s*\([\s\S]*?\)\s*(?::\s*[\w<>\|\s\[\]]+\s*)?{{"
    match = re.search(pattern, text)
    if not match:
        print(f"Could not find {name}")
        return None, text
    
    start_idx = match.start()
    body_start_idx = match.end() - 1  # This is the actual '{' of the function body
    
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
    "PredictionTab",
    "StatsTab",
    "LeagueTab",
    "PitchTab",
    "LineupsTab",
    "PhantomChatTab"
]

imports = """import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { motion, AnimatePresence } from "framer-motion";
import { X, Target, BarChart2, MessageCircle, Send, Bot, Zap, TrendingUp, Trophy, ChevronRight, Lock, Share2, Users, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ConfidenceRing } from "@/components/ui/ConfidenceRing";
import { ConfidenceBadge, getConfidenceTier } from "@/components/ui/ConfidenceBadge";
import { TeamLogo } from "@/components/TeamLogo";

const RISK_LABELS: Record<string, string> = {
  SAFE: 'Stable',
  MODERATE: 'Calculated',
  AGGRESSIVE: 'High Variance',
  VOLATILE: 'High Variance',
};
function riskColor(r: string) {
  const l = (r || '').toUpperCase();
  if (l === 'SAFE') return 'text-primary';
  if (l === 'AGGRESSIVE' || l === 'VOLATILE') return 'text-amber-400';
  return 'text-blue-400';
}
"""

os.makedirs('/workspace/score-phantom/client/src/components/match', exist_ok=True)

remaining_text = content
for name in functions_to_extract:
    func_str, remaining_text = extract_function(name, remaining_text)
    if func_str:
        file_path = f'/workspace/score-phantom/client/src/components/match/{name}.tsx'
        with open(file_path, 'w') as f:
            f.write(imports + "\nexport " + func_str + "\n")
        print(f"Extracted {name} to {file_path}")

pattern_risk = r"const RISK_LABELS.*?\n\}\n"
remaining_text = re.sub(pattern_risk, "", remaining_text, flags=re.DOTALL)

import_statements = "\n".join([f"import {{ {name} }} from \"@/components/match/{name}\";" for name in functions_to_extract])
remaining_text = remaining_text.replace("import { TeamLogo } from \"@/components/TeamLogo\";", "import { TeamLogo } from \"@/components/TeamLogo\";\n" + import_statements)

with open('/workspace/score-phantom/client/src/pages/MatchCenter.tsx', 'w') as f:
    f.write(remaining_text)

print("Updated MatchCenter.tsx")
