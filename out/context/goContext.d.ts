import * as vscode from 'vscode';
export interface GoFileInfo {
    packageName: string;
    imports: string[];
    symbols: string[];
    isTest: boolean;
}
export declare function parseGoFile(content: string): GoFileInfo;
export declare function findRelatedGoFiles(document: vscode.TextDocument): Promise<string[]>;
