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
exports.GatewayClient = void 0;
const vscode = __importStar(require("vscode"));
class GatewayClient {
    baseUrl;
    constructor() {
        this.baseUrl = vscode.workspace
            .getConfiguration('aiBuddy')
            .get('backendUrl', 'http://localhost:8080');
    }
    async chat(request) {
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
            return response.json();
        }
        finally {
            clearTimeout(timeout);
        }
    }
    async streamChat(request, onChunk, onDone, onError) {
        const wsUrl = this.baseUrl.replace(/^http/, 'ws') + '/api/v1/chat/stream';
        return new Promise((resolve, reject) => {
            let ws;
            try {
                ws = new WebSocket(wsUrl);
            }
            catch {
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
            ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                switch (msg.type) {
                    case 'chunk':
                        if (msg.content) {
                            onChunk(msg.content);
                        }
                        break;
                    case 'done':
                        if (msg.metadata) {
                            onDone(msg.metadata);
                        }
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
    async getProviders() {
        try {
            const response = await fetch(`${this.baseUrl}/api/v1/providers`, {
                signal: AbortSignal.timeout(5000),
            });
            if (!response.ok) {
                return [];
            }
            const data = await response.json();
            return data.providers;
        }
        catch {
            return [];
        }
    }
    async health() {
        try {
            const response = await fetch(`${this.baseUrl}/api/v1/health`, {
                signal: AbortSignal.timeout(5000),
            });
            return response.ok;
        }
        catch {
            return false;
        }
    }
}
exports.GatewayClient = GatewayClient;
//# sourceMappingURL=client.js.map