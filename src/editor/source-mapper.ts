import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

interface ResolveRequest {
  selector: string;
  tagName: string;
  className: string;
  textContent: string;
  sourceInfo?: { file: string; line: number; column?: number };
  projectRoot: string;
}

export interface SourceLocation {
  filePath: string;
  line: number;
  column?: number;
  context: string;
}

const SOURCE_EXTENSIONS = new Set([
  '.tsx', '.jsx', '.vue', '.svelte', '.html', '.astro', '.ts', '.js',
]);

// Prioritize page/layout files over component library files
function sortByRelevance(files: string[]): string[] {
  return files.sort((a, b) => {
    const score = (f: string) => {
      if (f.includes('/pages/')) return 0;
      if (f.includes('/layouts/')) return 1;
      if (f.endsWith('.astro') || f.endsWith('.html')) return 2;
      if (f.endsWith('.vue') || f.endsWith('.svelte')) return 3;
      if (f.endsWith('.tsx') || f.endsWith('.jsx')) return 4;
      // Component library / ui files are least likely to be the direct target
      if (f.includes('/ui/') || f.includes('/components/ui/')) return 6;
      return 5;
    };
    return score(a) - score(b);
  });
}

function walkSourceFiles(dir: string, files: string[] = []): string[] {
  try {
    for (const entry of readdirSync(dir)) {
      if (entry.startsWith('.') || entry === 'node_modules' || entry === 'dist' || entry === '.next' || entry === '.astro') continue;
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walkSourceFiles(full, files);
      } else if (SOURCE_EXTENSIONS.has(extname(full))) {
        files.push(full);
      }
    }
  } catch {}
  return files;
}

function getContext(lines: string[], lineIndex: number): string {
  const start = Math.max(0, lineIndex - 5);
  const end = Math.min(lines.length, lineIndex + 6);
  return lines.slice(start, end).join('\n');
}

interface Match {
  filePath: string;
  line: number;
  context: string;
  score: number; // lower is better
}

function findElement(
  projectRoot: string,
  textContent: string,
  tagName: string,
  className: string
): SourceLocation | null {
  let files = walkSourceFiles(join(projectRoot, 'src'));
  if (files.length === 0) {
    files = walkSourceFiles(projectRoot);
  }
  files = sortByRelevance(files);

  const candidates: Match[] = [];
  const searchText = textContent.trim();

  for (const filePath of files) {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        let score = 100;

        // Best: line contains the text AND the tag
        if (searchText && line.includes(searchText)) {
          score = 10;
          // Even better if it also has the tag
          if (line.includes(`<${tagName}`)) {
            score = 1;
          }
          // Bonus for class match
          if (className && className.split(/\s+/).some(cn => line.includes(cn))) {
            score -= 2;
          }
          candidates.push({ filePath, line: i + 1, context: getContext(lines, i), score });
        }
        // Also check: tag + multiple class matches on same line (no text match)
        else if (line.includes(`<${tagName}`) && className) {
          const classNames = className.split(/\s+/).filter(Boolean);
          const matchCount = classNames.filter(cn => line.includes(cn)).length;
          if (matchCount >= 2) {
            score = 20 + (classNames.length - matchCount);
            candidates.push({ filePath, line: i + 1, context: getContext(lines, i), score });
          }
        }
      }
    } catch {}
  }

  if (candidates.length === 0) return null;

  // Return the best match
  candidates.sort((a, b) => a.score - b.score);
  const best = candidates[0];
  return { filePath: best.filePath, line: best.line, context: best.context };
}

export async function resolveSource(req: ResolveRequest): Promise<SourceLocation | null> {
  // If the overlay extracted source info from React fiber / Vue instance, use it directly
  if (req.sourceInfo?.file && req.sourceInfo?.line) {
    let filePath = req.sourceInfo.file;

    if (!filePath.startsWith('/')) {
      filePath = join(req.projectRoot, filePath);
    }

    try {
      const content = readFileSync(filePath, 'utf-8');
      const lines = content.split('\n');
      const line = req.sourceInfo.line;
      return {
        filePath,
        line,
        column: req.sourceInfo.column,
        context: getContext(lines, line - 1),
      };
    } catch {}
  }

  // Fallback: scored search across source files
  return findElement(req.projectRoot, req.textContent, req.tagName, req.className);
}
