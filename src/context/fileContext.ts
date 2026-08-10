import * as vscode from 'vscode';
import { QueryContext } from '../gateway/client';
import { parseGoFile, findRelatedGoFiles } from './goContext';
import { parseK8sYaml } from './k8sContext';

export async function gatherContext(): Promise<QueryContext | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return undefined;
  }

  const document = editor.document;
  const selection = editor.selection;

  const ctx: QueryContext = {
    active_file_path: vscode.workspace.asRelativePath(document.uri),
    language: document.languageId,
  };

  // Selection or file content
  if (!selection.isEmpty) {
    ctx.selection = document.getText(selection);
  } else {
    const content = document.getText();
    if (content.length <= 20000) {
      ctx.active_file_content = content;
    } else {
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
    const goInfo = parseGoFile(content);
    ctx.package_name = goInfo.packageName;
    ctx.imports = goInfo.imports;
    ctx.symbols = goInfo.symbols;

    const related = await findRelatedGoFiles(document);
    if (related.length > 0) {
      ctx.related_files = related;
    }
  }

  if (document.languageId === 'yaml' || document.fileName.endsWith('.yaml') || document.fileName.endsWith('.yml')) {
    const k8sInfo = parseK8sYaml(content);
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
  } catch {
    // Git extension not available
  }

  return ctx;
}
