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
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const client_1 = require("./gateway/client");
const chatViewProvider_1 = require("./chat/chatViewProvider");
const fileContext_1 = require("./context/fileContext");
let client;
let chatProvider;
function activate(context) {
    client = new client_1.GatewayClient();
    chatProvider = new chatViewProvider_1.ChatViewProvider(context.extensionUri, client);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider(chatViewProvider_1.ChatViewProvider.viewType, chatProvider));
    context.subscriptions.push(vscode.commands.registerCommand('aiBuddy.openChat', () => {
        vscode.commands.executeCommand('aiBuddy.chatView.focus');
    }));
    const actionCommands = [
        { command: 'aiBuddy.explain', queryType: 'explain', label: 'Explain' },
        { command: 'aiBuddy.refactor', queryType: 'refactor', label: 'Refactor' },
        { command: 'aiBuddy.generateTests', queryType: 'test', label: 'Generate tests for' },
        { command: 'aiBuddy.review', queryType: 'review', label: 'Review' },
        { command: 'aiBuddy.debug', queryType: 'debug', label: 'Debug' },
        { command: 'aiBuddy.document', queryType: 'doc', label: 'Document' },
    ];
    for (const action of actionCommands) {
        context.subscriptions.push(vscode.commands.registerCommand(action.command, async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor');
                return;
            }
            const selection = editor.document.getText(editor.selection);
            if (!selection && editor.selection.isEmpty) {
                vscode.window.showWarningMessage('Select code first');
                return;
            }
            const ctx = await (0, fileContext_1.gatherContext)();
            const filePath = ctx?.active_file_path || 'the selected code';
            const prompt = `${action.label} this code from ${filePath}:\n\n\`\`\`\n${selection}\n\`\`\``;
            chatProvider.sendActionMessage(prompt, action.queryType);
        }));
    }
    // Commit message generation
    context.subscriptions.push(vscode.commands.registerCommand('aiBuddy.commitMessage', async () => {
        const gitExtension = vscode.extensions.getExtension('vscode.git')?.exports;
        const api = gitExtension?.getAPI(1);
        if (!api || api.repositories.length === 0) {
            vscode.window.showWarningMessage('No git repository found');
            return;
        }
        const repo = api.repositories[0];
        const diff = await repo.diff(true);
        const untrackedDiff = await repo.diff(false);
        const fullDiff = [diff, untrackedDiff].filter(Boolean).join('\n');
        if (!fullDiff.trim()) {
            vscode.window.showInformationMessage('No changes to commit');
            return;
        }
        const truncatedDiff = fullDiff.length > 8000
            ? fullDiff.substring(0, 8000) + '\n... (truncated)'
            : fullDiff;
        const prompt = `Generate a concise git commit message for these changes. Follow conventional commits format (type: description). Be specific about what changed.\n\n\`\`\`diff\n${truncatedDiff}\n\`\`\``;
        try {
            const response = await client.chat({
                messages: [{ role: 'user', content: prompt }],
                query_type: 'commit_message',
            });
            let commitMsg = response.content.trim();
            commitMsg = commitMsg.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim();
            const action = await vscode.window.showInformationMessage(commitMsg, 'Use as commit message', 'Copy to clipboard', 'Send to chat');
            if (action === 'Use as commit message') {
                repo.inputBox.value = commitMsg;
            }
            else if (action === 'Copy to clipboard') {
                await vscode.env.clipboard.writeText(commitMsg);
                vscode.window.showInformationMessage('Commit message copied');
            }
            else if (action === 'Send to chat') {
                chatProvider.sendActionMessage(prompt, 'commit_message');
            }
        }
        catch (error) {
            const msg = error instanceof Error ? error.message : 'Unknown error';
            vscode.window.showErrorMessage(`Failed to generate commit message: ${msg}`);
        }
    }));
    // Status bar
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBar.text = '$(pulse) AI Buddy';
    statusBar.tooltip = 'AI Buddy - Click to open chat';
    statusBar.command = 'aiBuddy.openChat';
    statusBar.show();
    context.subscriptions.push(statusBar);
    client.health().then((healthy) => {
        if (healthy) {
            statusBar.text = '$(check) AI Buddy';
            statusBar.tooltip = 'AI Buddy - Connected';
        }
        else {
            statusBar.text = '$(warning) AI Buddy';
            statusBar.tooltip = 'AI Buddy - Backend unreachable';
        }
    });
}
function deactivate() { }
//# sourceMappingURL=extension.js.map