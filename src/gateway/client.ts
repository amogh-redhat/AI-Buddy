import * as vscode from 'vscode';

export interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface QueryContext {
  active_file_path?: string;
  active_file_content?: string;
  selection?: string;
  language?: string;
  git_branch?: string;
  git_diff?: string;
  workspace_root?: string;
  related_files?: string[];
  imports?: string[];
  package_name?: string;
  symbols?: string[];
}

export interface ChatRequest {
  messages: Message[];
  context?: QueryContext;
  query_type?: string;
  provider?: string;
  stream?: boolean;
  max_tokens?: number;
}

export interface VerificationResult {
  check: string;
  passed: boolean;
  detail?: string;
}

export interface ResponseMetadata {
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
  latency_ms: number;
  confidence: number;
  confidence_level: string;
  routing_reason: string;
  cached: boolean;
  complexity: string;
  confidentiality: string;
  verifications?: VerificationResult[];
  retried: boolean;
}

export interface ChatResponse {
  content: string;
  metadata: ResponseMetadata;
}

export interface StreamMessage {
  type: 'chunk' | 'done' | 'error';
  content?: string;
  metadata?: ResponseMetadata;
  error?: string;
}

export class GatewayClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = vscode.workspace
      .getConfiguration('aiBuddy')
      .get('backendUrl', 'http://localhost:8080');
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120_000);

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gateway error (${response.status}): ${errorBody}`);
      }

      return response.json() as Promise<ChatResponse>;
    } finally {
      clearTimeout(timeout);
    }
  }

  async streamChat(
    request: ChatRequest,
    onChunk: (content: string) => void,
    onDone: (metadata: ResponseMetadata) => void,
    onError: (error: string) => void
  ): Promise<void> {
    const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/api/v1/chat/stream';

    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(wsUrl);
      } catch {
        this.chat(request)
          .then(resp => {
            onChunk(resp.content);
            onDone(resp.metadata);
            resolve();
          })
          .catch(err => {
            onError(err.message);
            reject(err);
          });
        return;
      }

      ws.onopen = () => {
        ws.send(JSON.stringify(request));
      };

      ws.onmessage = (event: MessageEvent) => {
        const msg: StreamMessage = JSON.parse(event.data);
        switch (msg.type) {
          case 'chunk':
            if (msg.content) { onChunk(msg.content); }
            break;
          case 'done':
            if (msg.metadata) { onDone(msg.metadata); }
            ws.close();
            resolve();
            break;
          case 'error':
            onError(msg.error || 'Unknown error');
            ws.close();
            reject(new Error(msg.error));
            break;
        }
      };

      ws.onerror = () => {
        this.chat(request)
          .then(resp => {
            onChunk(resp.content);
            onDone(resp.metadata);
            resolve();
          })
          .catch(err => {
            onError(err.message);
            reject(err);
          });
      };
    });
  }

  async getProviders(): Promise<string[]> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/providers`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) { return []; }
      const data = await response.json() as { providers: string[] };
      return data.providers;
    } catch {
      return [];
    }
  }

  async health(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/v1/health`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}
