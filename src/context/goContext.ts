import * as vscode from 'vscode';

export interface GoFileInfo {
  packageName: string;
  imports: string[];
  symbols: string[];
  isTest: boolean;
}

export function parseGoFile(content: string): GoFileInfo {
  const info: GoFileInfo = {
    packageName: '',
    imports: [],
    symbols: [],
    isTest: false,
  };

  const lines = content.split('\n');

  // Package declaration
  for (const line of lines) {
    const pkgMatch = line.match(/^package\s+(\w+)/);
    if (pkgMatch) {
      info.packageName = pkgMatch[1];
      break;
    }
  }

  // Imports
  let inImportBlock = false;
  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('import (')) {
      inImportBlock = true;
      continue;
    }
    if (inImportBlock && trimmed === ')') {
      inImportBlock = false;
      continue;
    }

    if (inImportBlock) {
      const importMatch = trimmed.match(/^(?:\w+\s+)?"([^"]+)"/);
      if (importMatch) {
        info.imports.push(importMatch[1]);
      }
    }

    // Single-line import
    const singleImport = trimmed.match(/^import\s+"([^"]+)"/);
    if (singleImport) {
      info.imports.push(singleImport[1]);
    }
  }

  // Symbols: functions, types, interfaces, structs, constants, variables
  for (const line of lines) {
    const trimmed = line.trim();

    const funcMatch = trimmed.match(/^func\s+(?:\([^)]*\)\s+)?(\w+)\s*\(/);
    if (funcMatch) {
      info.symbols.push(`func ${funcMatch[1]}`);
      if (funcMatch[1].startsWith('Test') || funcMatch[1].startsWith('Benchmark')) {
        info.isTest = true;
      }
    }

    const typeMatch = trimmed.match(/^type\s+(\w+)\s+(struct|interface)/);
    if (typeMatch) {
      info.symbols.push(`${typeMatch[2]} ${typeMatch[1]}`);
    }

    const constMatch = trimmed.match(/^(?:const|var)\s+(\w+)\s/);
    if (constMatch) {
      info.symbols.push(constMatch[1]);
    }
  }

  return info;
}

export async function findRelatedGoFiles(
  document: vscode.TextDocument
): Promise<string[]> {
  const dir = vscode.Uri.joinPath(document.uri, '..');
  const related: string[] = [];

  try {
    const files = await vscode.workspace.fs.readDirectory(dir);
    for (const [name, type] of files) {
      if (type !== vscode.FileType.File) { continue; }
      if (!name.endsWith('.go')) { continue; }
      if (name === document.uri.path.split('/').pop()) { continue; }

      related.push(name);
      if (related.length >= 10) { break; }
    }
  } catch {
    // Directory read failed — not critical
  }

  return related;
}
