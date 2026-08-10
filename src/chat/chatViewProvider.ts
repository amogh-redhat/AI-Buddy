import * as vscode from 'vscode';
import { GatewayClient, Message } from '../gateway/client';
import { gatherContext } from '../context/fileContext';

interface SlashCommand {
  name: string;
  queryType: string;
  description: string;
  needsArg: boolean;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { name: '/explain', queryType: 'explain', description: 'Explain selected code or concept', needsArg: false },
  { name: '/review', queryType: 'review', description: 'Review code for issues', needsArg: false },
  { name: '/test', queryType: 'test', description: 'Generate tests', needsArg: false },
  { name: '/debug', queryType: 'debug', description: 'Debug an issue', needsArg: false },
  { name: '/doc', queryType: 'doc', description: 'Generate documentation', needsArg: false },
  { name: '/refactor', queryType: 'refactor', description: 'Suggest refactoring', needsArg: false },
  { name: '/commit', queryType: 'commit_message', description: 'Generate commit message', needsArg: false },
  { name: '/clear', queryType: '', description: 'Clear conversation history', needsArg: false },
  { name: '/help', queryType: '', description: 'Show available commands', needsArg: false },
];

export class ChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'aiBuddy.chatView';

  private webviewView?: vscode.WebviewView;
  private client: GatewayClient;
  private conversationHistory: Message[] = [];
  private lastFailedContent?: string;
  private lastFailedQueryType?: string;

  constructor(
    private readonly extensionUri: vscode.Uri,
    client: GatewayClient
  ) {
    this.client = client;
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this.webviewView = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };

    webviewView.webview.html = this.getHtmlContent();

    webviewView.webview.onDidReceiveMessage(async (message: { type: string; content?: string; queryType?: string; code?: string }) => {
      switch (message.type) {
        case 'sendMessage':
          await this.handleInput(message.content ?? '', message.queryType);
          break;
        case 'clearHistory':
          this.conversationHistory = [];
          break;
        case 'retry':
          if (this.lastFailedContent) {
            await this.handleUserMessage(this.lastFailedContent, this.lastFailedQueryType);
          }
          break;
        case 'copyCode':
          if (message.code) {
            await vscode.env.clipboard.writeText(message.code);
            vscode.window.showInformationMessage('Code copied to clipboard');
          }
          break;
        case 'insertCode':
          await this.insertCodeAtCursor(message.code ?? '');
          break;
      }
    });

    this.checkConnection();
  }

  async sendActionMessage(content: string, queryType: string): Promise<void> {
    if (this.webviewView) {
      this.webviewView.show(true);
    }
    await this.handleUserMessage(content, queryType);
  }

  private async handleInput(content: string, queryType?: string): Promise<void> {
    const parsed = this.parseSlashCommand(content);

    if (parsed) {
      if (parsed.command === '/clear') {
        this.conversationHistory = [];
        this.postToWebview({ type: 'clearMessages' });
        return;
      }
      if (parsed.command === '/help') {
        this.showHelp();
        return;
      }
      if (parsed.command === '/commit') {
        vscode.commands.executeCommand('aiBuddy.commitMessage');
        return;
      }
      const msgContent = parsed.args || await this.getSelectionOrFile();
      if (!msgContent) {
        this.postToWebview({
          type: 'addMessage',
          role: 'assistant',
          content: `${parsed.command} needs code to work on. Select text in your editor or provide an argument after the command.`,
          isError: true,
        });
        return;
      }
      await this.handleUserMessage(msgContent, parsed.queryType);
    } else {
      await this.handleUserMessage(content, queryType);
    }
  }

  private parseSlashCommand(input: string): { command: string; queryType: string; args: string } | null {
    const trimmed = input.trim();
    if (!trimmed.startsWith('/')) { return null; }

    const spaceIdx = trimmed.indexOf(' ');
    const cmd = spaceIdx === -1 ? trimmed.toLowerCase() : trimmed.substring(0, spaceIdx).toLowerCase();
    const args = spaceIdx === -1 ? '' : trimmed.substring(spaceIdx + 1).trim();

    const found = SLASH_COMMANDS.find(c => c.name === cmd);
    if (!found) { return null; }

    return { command: found.name, queryType: found.queryType, args };
  }

  private async getSelectionOrFile(): Promise<string> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) { return ''; }

    const selection = editor.document.getText(editor.selection);
    if (selection) { return selection; }

    return editor.document.getText();
  }

  private showHelp(): void {
    const lines = ['**Available commands:**', ''];
    for (const cmd of SLASH_COMMANDS) {
      lines.push(`\`${cmd.name}\` — ${cmd.description}`);
    }
    lines.push('', 'You can also select code and use right-click context menu actions.');
    this.postToWebview({
      type: 'addMessage',
      role: 'assistant',
      content: lines.join('\n'),
    });
  }

  private async handleUserMessage(content: string, queryType?: string): Promise<void> {
    const userMessage: Message = { role: 'user', content };
    this.conversationHistory.push(userMessage);

    this.postToWebview({ type: 'addMessage', role: 'user', content });
    this.postToWebview({ type: 'setLoading', loading: true });

    try {
      const context = await gatherContext();
      const preferredProvider = vscode.workspace
        .getConfiguration('aiBuddy')
        .get('preferredProvider', 'auto');

      const response = await this.client.chat({
        messages: this.conversationHistory,
        context,
        query_type: queryType || 'chat',
        provider: preferredProvider === 'auto' ? undefined : preferredProvider,
      });

      const assistantMessage: Message = {
        role: 'assistant',
        content: response.content,
      };
      this.conversationHistory.push(assistantMessage);
      this.lastFailedContent = undefined;
      this.lastFailedQueryType = undefined;

      this.postToWebview({
        type: 'addMessage',
        role: 'assistant',
        content: response.content,
        metadata: response.metadata,
      });
    } catch (error: unknown) {
      this.lastFailedContent = content;
      this.lastFailedQueryType = queryType;

      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      this.postToWebview({
        type: 'addMessage',
        role: 'assistant',
        content: `Error: ${errorMsg}`,
        isError: true,
      });
    } finally {
      this.postToWebview({ type: 'setLoading', loading: false });
    }
  }

  private async insertCodeAtCursor(code: string): Promise<void> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      vscode.window.showWarningMessage('No active editor to insert code into');
      return;
    }
    await editor.edit((editBuilder: vscode.TextEditorEdit) => {
      editBuilder.insert(editor.selection.active, code);
    });
  }

  private async checkConnection(): Promise<void> {
    const healthy = await this.client.health();
    this.postToWebview({
      type: 'connectionStatus',
      connected: healthy,
    });
  }

  private postToWebview(message: unknown): void {
    this.webviewView?.webview.postMessage(message);
  }

  private getHtmlContent(): string {
    return /*html*/ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  :root {
    --bg: var(--vscode-editor-background);
    --fg: var(--vscode-editor-foreground);
    --input-bg: var(--vscode-input-background);
    --input-border: var(--vscode-input-border);
    --input-fg: var(--vscode-input-foreground);
    --button-bg: var(--vscode-button-background);
    --button-fg: var(--vscode-button-foreground);
    --button-hover: var(--vscode-button-hoverBackground);
    --border: var(--vscode-panel-border);
    --muted: var(--vscode-descriptionForeground);
    --user-bg: var(--vscode-textBlockQuote-background);
    --error-fg: var(--vscode-errorForeground);
    --badge-bg: var(--vscode-badge-background);
    --badge-fg: var(--vscode-badge-foreground);
    --code-bg: var(--vscode-textCodeBlock-background);
    --font: var(--vscode-font-family);
    --font-size: var(--vscode-font-size);
    --success: #4ec9b0;
    --warning: #cca700;
    --danger: #f14c4c;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: var(--font);
    font-size: var(--font-size);
    color: var(--fg);
    background: var(--bg);
    display: flex;
    flex-direction: column;
    height: 100vh;
    overflow: hidden;
  }

  #header {
    padding: 8px 12px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  #header-left {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  #header h3 { font-size: 13px; font-weight: 600; }

  #connection-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--muted);
    transition: background 0.3s;
  }
  #connection-dot.connected { background: var(--success); }
  #connection-dot.disconnected { background: var(--danger); }

  #clear-btn {
    background: none;
    border: none;
    color: var(--muted);
    cursor: pointer;
    font-size: 12px;
    padding: 2px 6px;
    border-radius: 3px;
  }
  #clear-btn:hover { color: var(--fg); background: var(--input-bg); }

  #messages {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .message {
    padding: 8px 12px;
    border-radius: 6px;
    line-height: 1.5;
    word-wrap: break-word;
    white-space: pre-wrap;
  }

  .message.user {
    background: var(--user-bg);
    align-self: flex-end;
    max-width: 90%;
    border: 1px solid var(--border);
  }

  .message.assistant {
    align-self: flex-start;
    max-width: 95%;
  }

  .message.error { color: var(--error-fg); }

  .message code {
    background: var(--code-bg);
    padding: 1px 4px;
    border-radius: 3px;
    font-family: var(--vscode-editor-font-family);
    font-size: calc(var(--font-size) - 1px);
  }

  .code-block-wrapper {
    position: relative;
    margin: 6px 0;
  }

  .code-block-wrapper pre {
    background: var(--code-bg);
    padding: 28px 8px 8px 8px;
    border-radius: 4px;
    overflow-x: auto;
  }
  .code-block-wrapper pre code {
    background: none;
    padding: 0;
  }

  .code-actions {
    position: absolute;
    top: 4px;
    right: 4px;
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .code-block-wrapper:hover .code-actions { opacity: 1; }

  .code-action-btn {
    background: var(--badge-bg);
    color: var(--badge-fg);
    border: none;
    padding: 2px 6px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 10px;
    font-weight: 600;
  }
  .code-action-btn:hover { opacity: 0.8; }

  .metadata {
    margin-top: 6px;
    padding: 4px 8px;
    border-radius: 4px;
    background: var(--code-bg);
    font-size: 11px;
    color: var(--muted);
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }

  .meta-item {
    display: inline-flex;
    align-items: center;
    gap: 3px;
  }

  .meta-badge {
    background: var(--badge-bg);
    color: var(--badge-fg);
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
  }

  .confidence-badge {
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
    color: #fff;
  }
  .confidence-high { background: #2ea043; }
  .confidence-medium { background: #bf8700; }
  .confidence-low { background: #cf222e; }

  .verification-badge {
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
  }
  .verification-pass { background: rgba(46, 160, 67, 0.2); color: var(--success); }
  .verification-fail { background: rgba(241, 76, 76, 0.2); color: var(--danger); }

  .tag-cached {
    background: rgba(78, 201, 176, 0.15);
    color: var(--success);
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
  }

  .tag-retried {
    background: rgba(204, 167, 0, 0.15);
    color: var(--warning);
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: 600;
  }

  .retry-btn {
    margin-top: 6px;
    background: var(--button-bg);
    color: var(--button-fg);
    border: none;
    border-radius: 4px;
    padding: 4px 10px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
  }
  .retry-btn:hover { background: var(--button-hover); }

  #loading {
    display: none;
    padding: 12px;
    text-align: center;
    color: var(--muted);
    font-size: 12px;
  }
  #loading.active { display: block; }

  .loading-dots::after {
    content: '';
    animation: dots 1.5s steps(4, end) infinite;
  }
  @keyframes dots {
    0%   { content: ''; }
    25%  { content: '.'; }
    50%  { content: '..'; }
    75%  { content: '...'; }
    100% { content: ''; }
  }

  #input-area {
    padding: 8px;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 6px;
    flex-shrink: 0;
  }

  #slash-hint {
    display: none;
    background: var(--input-bg);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 4px 0;
    max-height: 160px;
    overflow-y: auto;
    font-size: 12px;
  }
  #slash-hint.active { display: block; }

  .slash-item {
    padding: 4px 10px;
    cursor: pointer;
    display: flex;
    justify-content: space-between;
    gap: 12px;
  }
  .slash-item:hover, .slash-item.selected {
    background: var(--button-bg);
    color: var(--button-fg);
  }
  .slash-item .cmd { font-weight: 600; }
  .slash-item .desc { color: var(--muted); font-size: 11px; }
  .slash-item:hover .desc, .slash-item.selected .desc { color: var(--button-fg); opacity: 0.8; }

  #query-type-row {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .type-btn {
    background: var(--input-bg);
    border: 1px solid var(--border);
    color: var(--muted);
    padding: 2px 8px;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
  }
  .type-btn:hover, .type-btn.active {
    color: var(--fg);
    border-color: var(--button-bg);
  }
  .type-btn.active { background: var(--button-bg); color: var(--button-fg); }

  #input-row {
    display: flex;
    gap: 6px;
  }

  #user-input {
    flex: 1;
    background: var(--input-bg);
    color: var(--input-fg);
    border: 1px solid var(--input-border);
    border-radius: 4px;
    padding: 6px 10px;
    font-family: var(--font);
    font-size: var(--font-size);
    resize: none;
    min-height: 36px;
    max-height: 120px;
    outline: none;
  }
  #user-input:focus { border-color: var(--button-bg); }

  #send-btn {
    background: var(--button-bg);
    color: var(--button-fg);
    border: none;
    border-radius: 4px;
    padding: 6px 14px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
    align-self: flex-end;
  }
  #send-btn:hover { background: var(--button-hover); }
  #send-btn:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
</head>
<body>
  <div id="header">
    <div id="header-left">
      <h3>AI Buddy</h3>
      <span id="connection-dot" title="Checking connection..."></span>
    </div>
    <button id="clear-btn" title="Clear conversation">Clear</button>
  </div>

  <div id="messages"></div>

  <div id="loading"><span class="loading-dots">Thinking</span></div>

  <div id="input-area">
    <div id="slash-hint"></div>
    <div id="query-type-row">
      <button class="type-btn active" data-type="chat">Chat</button>
      <button class="type-btn" data-type="explain">Explain</button>
      <button class="type-btn" data-type="refactor">Refactor</button>
      <button class="type-btn" data-type="test">Test</button>
      <button class="type-btn" data-type="review">Review</button>
      <button class="type-btn" data-type="debug">Debug</button>
      <button class="type-btn" data-type="doc">Doc</button>
    </div>
    <div id="input-row">
      <textarea id="user-input" rows="1" placeholder="Ask AI Buddy... (type / for commands)"></textarea>
      <button id="send-btn">Send</button>
    </div>
  </div>

<script>
const vscode = acquireVsCodeApi();
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const clearBtn = document.getElementById('clear-btn');
const loadingEl = document.getElementById('loading');
const slashHint = document.getElementById('slash-hint');
const connectionDot = document.getElementById('connection-dot');
let queryType = 'chat';
let slashSelected = -1;

const COMMANDS = [
  { name: '/explain', desc: 'Explain code' },
  { name: '/review', desc: 'Review code' },
  { name: '/test', desc: 'Generate tests' },
  { name: '/debug', desc: 'Debug issue' },
  { name: '/doc', desc: 'Generate docs' },
  { name: '/refactor', desc: 'Refactor code' },
  { name: '/commit', desc: 'Commit message' },
  { name: '/clear', desc: 'Clear history' },
  { name: '/help', desc: 'Show commands' },
];

// Query type buttons
document.querySelectorAll('.type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelector('.type-btn.active')?.classList.remove('active');
    btn.classList.add('active');
    queryType = btn.dataset.type;
  });
});

// Slash command autocomplete
inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';

  const val = inputEl.value;
  if (val.startsWith('/') && !val.includes(' ')) {
    const filter = val.toLowerCase();
    const matches = COMMANDS.filter(c => c.name.startsWith(filter));
    if (matches.length > 0) {
      slashHint.innerHTML = matches.map((c, i) =>
        '<div class="slash-item' + (i === 0 ? ' selected' : '') + '" data-cmd="' + c.name + '">' +
        '<span class="cmd">' + c.name + '</span>' +
        '<span class="desc">' + c.desc + '</span></div>'
      ).join('');
      slashHint.classList.add('active');
      slashSelected = 0;

      slashHint.querySelectorAll('.slash-item').forEach(item => {
        item.addEventListener('click', () => {
          inputEl.value = item.dataset.cmd + ' ';
          slashHint.classList.remove('active');
          inputEl.focus();
        });
      });
      return;
    }
  }
  slashHint.classList.remove('active');
  slashSelected = -1;
});

// Send message
function sendMessage() {
  const content = inputEl.value.trim();
  if (!content) return;

  slashHint.classList.remove('active');
  vscode.postMessage({ type: 'sendMessage', content, queryType });
  inputEl.value = '';
  inputEl.style.height = 'auto';
}

sendBtn.addEventListener('click', sendMessage);
inputEl.addEventListener('keydown', (e) => {
  if (slashHint.classList.contains('active')) {
    const items = slashHint.querySelectorAll('.slash-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[slashSelected]?.classList.remove('selected');
      slashSelected = Math.min(slashSelected + 1, items.length - 1);
      items[slashSelected]?.classList.add('selected');
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[slashSelected]?.classList.remove('selected');
      slashSelected = Math.max(slashSelected - 1, 0);
      items[slashSelected]?.classList.add('selected');
      return;
    }
    if (e.key === 'Tab' || (e.key === 'Enter' && slashSelected >= 0)) {
      e.preventDefault();
      const sel = items[slashSelected];
      if (sel) {
        inputEl.value = sel.dataset.cmd + ' ';
        slashHint.classList.remove('active');
      }
      return;
    }
    if (e.key === 'Escape') {
      slashHint.classList.remove('active');
      return;
    }
  }
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    sendMessage();
  }
});

// Clear
clearBtn.addEventListener('click', () => {
  messagesEl.innerHTML = '';
  vscode.postMessage({ type: 'clearHistory' });
});

// Render markdown-lite (code blocks, inline code, bold)
function renderContent(text) {
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks with copy/insert buttons
  const BT = String.fromCharCode(96);
  const codeBlockRe = new RegExp(BT + BT + BT + '(\\\\w*)\\\\n([\\\\s\\\\S]*?)' + BT + BT + BT, 'g');
  let blockId = 0;
  html = html.replace(codeBlockRe, (_, lang, code) => {
    const id = 'code-' + (blockId++);
    return '<div class="code-block-wrapper">' +
      '<div class="code-actions">' +
      '<button class="code-action-btn" onclick="copyCode(\\'' + id + '\\')" title="Copy">Copy</button>' +
      '<button class="code-action-btn" onclick="insertCode(\\'' + id + '\\')" title="Insert at cursor">Insert</button>' +
      '</div>' +
      '<pre><code id="' + id + '" class="language-' + lang + '">' + code + '</code></pre>' +
      '</div>';
  });

  // Inline code
  const inlineCodeRe = new RegExp(BT + '([^' + BT + ']+)' + BT, 'g');
  html = html.replace(inlineCodeRe, '<code>$1</code>');

  // Bold
  html = html.replace(/\\*\\*(.+?)\\*\\*/g, '<strong>$1</strong>');

  return html;
}

function copyCode(id) {
  const el = document.getElementById(id);
  if (el) {
    vscode.postMessage({ type: 'copyCode', code: el.textContent });
  }
}

function insertCode(id) {
  const el = document.getElementById(id);
  if (el) {
    vscode.postMessage({ type: 'insertCode', code: el.textContent });
  }
}

function formatCost(cost) {
  if (cost === 0) return 'free';
  if (cost < 0.001) return '<$0.001';
  return '$' + cost.toFixed(4);
}

function confidenceBadge(metadata) {
  const pct = (metadata.confidence * 100).toFixed(0);
  const level = metadata.confidence_level || (metadata.confidence >= 0.8 ? 'high' : metadata.confidence >= 0.5 ? 'medium' : 'low');
  return '<span class="confidence-badge confidence-' + level + '">' + pct + '% ' + level + '</span>';
}

function verificationBadges(metadata) {
  if (!metadata.verifications || metadata.verifications.length === 0) return '';
  return metadata.verifications.map(v =>
    '<span class="verification-badge verification-' + (v.passed ? 'pass' : 'fail') + '" title="' +
    (v.detail || '').replace(/"/g, '&quot;') + '">' +
    (v.passed ? 'PASS' : 'FAIL') + ' ' + v.check + '</span>'
  ).join('');
}

function tagBadges(metadata) {
  let html = '';
  if (metadata.cached) {
    html += '<span class="tag-cached">cached</span>';
  }
  if (metadata.retried) {
    html += '<span class="tag-retried">retried</span>';
  }
  return html;
}

function addMessage(role, content, metadata, isError) {
  const msgEl = document.createElement('div');
  msgEl.className = 'message ' + role + (isError ? ' error' : '');
  msgEl.innerHTML = renderContent(content);

  if (isError) {
    const retryBtn = document.createElement('button');
    retryBtn.className = 'retry-btn';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', () => {
      vscode.postMessage({ type: 'retry' });
    });
    msgEl.appendChild(retryBtn);
  }

  if (metadata && role === 'assistant') {
    const metaEl = document.createElement('div');
    metaEl.className = 'metadata';
    metaEl.innerHTML =
      '<span class="meta-item"><span class="meta-badge">' + metadata.provider + '</span> ' + metadata.model + '</span>' +
      '<span class="meta-item">' + confidenceBadge(metadata) + '</span>' +
      verificationBadges(metadata) +
      tagBadges(metadata) +
      '<span class="meta-item">Tokens: ' + (metadata.input_tokens + metadata.output_tokens) + '</span>' +
      '<span class="meta-item">Cost: ' + formatCost(metadata.cost_usd) + '</span>' +
      '<span class="meta-item">' + metadata.latency_ms + 'ms</span>' +
      (metadata.complexity ? '<span class="meta-item">Complexity: ' + metadata.complexity + '</span>' : '');
    msgEl.appendChild(metaEl);
  }

  messagesEl.appendChild(msgEl);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Handle messages from extension
window.addEventListener('message', (event) => {
  const msg = event.data;
  switch (msg.type) {
    case 'addMessage':
      addMessage(msg.role, msg.content, msg.metadata, msg.isError);
      break;
    case 'setLoading':
      loadingEl.classList.toggle('active', msg.loading);
      sendBtn.disabled = msg.loading;
      break;
    case 'clearMessages':
      messagesEl.innerHTML = '';
      break;
    case 'connectionStatus':
      connectionDot.className = msg.connected ? 'connected' : 'disconnected';
      connectionDot.title = msg.connected ? 'Connected to backend' : 'Backend unreachable';
      break;
  }
});
</script>
</body>
</html>`;
  }
}
