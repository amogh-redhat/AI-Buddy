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
export declare class GatewayClient {
    private baseUrl;
    constructor();
    chat(request: ChatRequest): Promise<ChatResponse>;
    streamChat(request: ChatRequest, onChunk: (content: string) => void, onDone: (metadata: ResponseMetadata) => void, onError: (error: string) => void): Promise<void>;
    getProviders(): Promise<string[]>;
    health(): Promise<boolean>;
}
