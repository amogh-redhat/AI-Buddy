import * as vscode from 'vscode';
import { GatewayClient } from '../gateway/client';
export declare class ChatViewProvider implements vscode.WebviewViewProvider {
    private readonly extensionUri;
    static readonly viewType = "aiBuddy.chatView";
    private webviewView?;
    private client;
    private conversationHistory;
    private lastFailedContent?;
    private lastFailedQueryType?;
    constructor(extensionUri: vscode.Uri, client: GatewayClient);
    resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken): void;
    sendActionMessage(content: string, queryType: string): Promise<void>;
    private handleInput;
    private parseSlashCommand;
    private getSelectionOrFile;
    private showHelp;
    private handleUserMessage;
    private insertCodeAtCursor;
    private checkConnection;
    private postToWebview;
    private getHtmlContent;
}
