"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseGoFile = parseGoFile;
exports.findRelatedGoFiles = findRelatedGoFiles;
const vscode = __importStar(require("vscode"));
function parseGoFile(content) {
    const info = {
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
async function findRelatedGoFiles(document) {
    const dir = vscode.Uri.joinPath(document.uri, '..');
    const related = [];
    try {
        const files = await vscode.workspace.fs.readDirectory(dir);
        for (const [name, type] of files) {
            if (type !== vscode.FileType.File) {
                continue;
            }
            if (!name.endsWith('.go')) {
                continue;
            }
            if (name === document.uri.path.split('/').pop()) {
                continue;
            }
            related.push(name);
            if (related.length >= 10) {
                break;
            }
        }
    }
    catch {
        // Directory read failed — not critical
    }
    return related;
}
//# sourceMappingURL=goContext.js.map