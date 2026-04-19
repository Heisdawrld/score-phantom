const fs = require('fs');
const path = require('path');

const srcDir = 'client/src';
const pages = ['Dashboard.tsx', 'MatchCenter.tsx', 'Matches.tsx', 'TopPicksToday.tsx'];

const componentCode = `import { useState } from 'react';

// Quality mappings for notoriously wrong BSD logos
export const LOGO_OVERRIDES: Record<string, string> = {
  "Coventry": "https://upload.wikimedia.org/wikipedia/en/thumb/f/f8/Coventry_City_FC_logo.svg/800px-Coventry_City_FC_logo.svg.png",
  "Coventry City": "https://upload.wikimedia.org/wikipedia/en/thumb/f/f8/Coventry_City_FC_logo.svg/800px-Coventry_City_FC_logo.svg.png",
  "Wolves": "https://upload.wikimedia.org/wikipedia/en/thumb/f/fc/Wolverhampton_Wanderers_comp.svg/800px-Wolverhampton_Wanderers_comp.svg.png",
  "Wolverhampton": "https://upload.wikimedia.org/wikipedia/en/thumb/f/fc/Wolverhampton_Wanderers_comp.svg/800px-Wolverhampton_Wanderers_comp.svg.png",
  // Edit this file to add more precise team mappings!
};

interface TeamLogoProps {
  src?: string | null;
  name: string;
  size?: 'sm' | 'md' | 'lg';
}

export function TeamLogo({ src, name, size = 'md' }: TeamLogoProps) {
  const [err, setErr] = useState(false);
  const overrideMatch = Object.keys(LOGO_OVERRIDES).find(k => name.toLowerCase().includes(k.toLowerCase()));
  const finalSrc = overrideMatch ? LOGO_OVERRIDES[overrideMatch] : src;

  const sizeClasses = {
    sm: 'w-5 h-5 text-[8px]',
    md: 'w-7 h-7 text-[10px]',
    lg: 'w-10 h-10 text-[12px]'
  };

  if (finalSrc && !err) {
    return <img src={finalSrc} alt={name} onError={() => setErr(true)} className={\`\${sizeClasses[size]} rounded-full object-contain bg-white/5 border border-white/10 shrink-0\`} loading='lazy' />;
  }
  return <div className={\`\${sizeClasses[size]} rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0 font-bold text-primary\`}>{name.slice(0,2).toUpperCase()}</div>;
}
`;

fs.writeFileSync(path.join(srcDir, 'components', 'TeamLogo.tsx'), componentCode);

// Refactor pages
for (const page of pages) {
    const filePath = path.join(srcDir, 'pages', page);
    let code = fs.readFileSync(filePath, 'utf8');
    
    // Remove the inline declaration
    // Matches something like: function TeamLogo({ src, name, size = "md" }: { ... }) { ... }
    const inlineRegex = /function TeamLogo\([^{]*\{[^}]*\}[^{]*\{[\s\S]*?(?:return <img[\s\S]*?return <div[\s\S]*?\}|return <div[\s\S]*?\}\s*\})/g;
    
    // Some are slightly differently formed. Let's do a reliable replace by finding `function TeamLogo` and the matching brace
    let startIdx = code.indexOf('function TeamLogo');
    if (startIdx !== -1) {
        let openBraces = 0;
        let started = false;
        let endIdx = -1;
        for(let i = startIdx; i < code.length; i++) {
            if (code[i] === '{') { started = true; openBraces++; }
            if (code[i] === '}') { openBraces--; }
            if (started && openBraces === 0) {
                endIdx = i;
                break;
            }
        }
        if (endIdx !== -1) {
            code = code.substring(0, startIdx) + code.substring(endIdx + 1);
            // Add import to top
            if (!code.includes('import { TeamLogo }')) {
                const importLine = "import { TeamLogo } from '../components/TeamLogo';\n";
                // find last import
                const lastImportIdx = code.lastIndexOf('import ');
                const eol = code.indexOf('\n', lastImportIdx);
                code = code.substring(0, eol + 1) + importLine + code.substring(eol + 1);
            }
            fs.writeFileSync(filePath, code);
            console.log('Refactored ' + page);
        }
    }
}
