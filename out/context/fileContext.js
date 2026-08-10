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
exports.gatherContext = gatherContext;
const vscode = __importStar(require("vscode"));
const goContext_1 = require("./goContext");
const k8sContext_1 = require("./k8sContext");
async function gatherContext() {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return undefined;
    }
    const document = editor.document;
    const selection = editor.selection;
    const ctx = {
        active_file_path: vscode.workspace.asRelativePath(document.uri),
        language: document.languageId,
    };
    // Selection or file content
    if (!selection.isEmpty) {
        ctx.selection = document.getText(selection);
    }
    else {
        const content = document.getText();
        if (content.length <= 20000) {
            ctx.active_file_content = content;
        }
        else {
            const cursorLine = selection.active.line;
            const startLine = Math.max(0, cursorLine - 100);
            const endLine = Math.min(document.lineCount - 1, cursorLine + 100);
            const range = new vscode.Range(startLine, 0, endLine, document.lineAt(endLine).text.length);
            ctx.active_file_content = document.getText(range);
        }
    }
    // Workspace root
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders && workspaceFolders.length > 0) {
        ctx.workspace_root = workspaceFolders[0].uri.fsPath;
    }
    // Language-specific context
    const content = document.getText();
    if (document.languageId === 'go') {
        const goInfo = (0, goContext_1.parseGoFile)(content);
        ctx.package_name = goInfo.packageName;
        ctx.imports = goInfo.imports;
        ctx.symbols = goInfo.symbols;
        const related = await (0, goContext_1.findRelatedGoFiles)(document);
        if (related.length > 0) {
            ctx.related_files = related;
        }
    }
    if (document.languageId === 'yaml' || document.fileName.endsWith('.yaml') || document.fileName.endsWith('.yml')) {
        const k8sInfo = (0, k8sContext_1.parseK8sYaml)(content);
        if (k8sInfo) {
            ctx.symbols = [`${k8sInfo.kind}/${k8sInfo.name}`];
            if (k8sInfo.namespace) {
                ctx.symbols.push(`namespace: ${k8sInfo.namespace}`);
            }
        }
    }
    // Git branch
    try {
        const gitExt = vscode.extensions.getExtension('vscode.git');
        if (gitExt?.isActive) {
            const git = gitExt.exports.getAPI(1);
            if (git.repositories.length > 0) {
                const repo = git.repositories[0];
                ctx.git_branch = repo.state.HEAD?.name;
            }
        }
    }
    catch {
        // Git extension not available
    }
    return ctx;
}
//# sourceMappingURL=fileContext.js.map