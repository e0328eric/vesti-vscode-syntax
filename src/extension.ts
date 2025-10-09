import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';
import Parser from 'web-tree-sitter';

// Tiny helper to read a file from extension assets
async function readAsset(context: vscode.ExtensionContext, rel: string) {
  const p = vscode.Uri.joinPath(context.extensionUri, rel);
  const data = await vscode.workspace.fs.readFile(p);
  return Buffer.from(data).toString('utf8');
}

export async function activate(context: vscode.ExtensionContext) {
  // Init tree-sitter
  await Parser.init();
  const wasmUri = vscode.Uri.joinPath(context.extensionUri, 'parsers/vesti.wasm');
  const lang = await Parser.Language.load(wasmUri.fsPath);
  const parser = new Parser();
  parser.setLanguage(lang);

  // Load highlight queries
  const highlights = await readAsset(context, 'queries/highlights.scm');
  const query = lang.query(highlights);

  // Build semantic token legend (token types/modifiers must match package.json)
  const tokenTypes = new Map<string, number>();
  const tokenModifiers = new Map<string, number>();
  const legend = (function makeLegend() {
    const types = [
      'namespace','class','enum','function','method','property','variable',
      'parameter','string','number','regexp','operator','keyword','comment',
      'type','macro','constant','punctuation','tag','attribute'
    ];
    const modifiers = [
      'declaration','definition','readonly','static','documentation',
      'defaultLibrary','abstract','async','mutable','modification'
    ];
    types.forEach((t, i) => tokenTypes.set(t, i));
    modifiers.forEach((m, i) => tokenModifiers.set(m, i));
    return new vscode.SemanticTokensLegend(types, modifiers);
  })();

  // Map Tree-sitter capture names to VSCode token types/modifiers
  // Adjust this to your captures in queries/vesti/highlights.scm
  function mapCaptureToToken(captureName: string): [string, string[]] | null {
    // Common captures used in tree-sitter queries
    // e.g. @function, @keyword, @constant, @string, @type, @comment, etc.
    const base = captureName.replace(/^.*\./, ''); // handle dotted captures
    const table: Record<string, [string, string[]]> = {
      'function': ['function', []],
      'method': ['method', []],
      'keyword': ['keyword', []],
      'operator': ['operator', []],
      'type': ['type', []],
      'constant': ['constant', ['readonly','declaration']],
      'variable': ['variable', []],
      'property': ['property', []],
      'parameter': ['parameter', []],
      'number': ['number', []],
      'string': ['string', []],
      'comment': ['comment', []],
      'tag': ['tag', []],
      'attribute': ['attribute', []],
      'punctuation': ['punctuation', []]
    };
    return table[base] ?? null;
  }

  class VestiTokensProvider implements vscode.DocumentSemanticTokensProvider {
    provideDocumentSemanticTokens(document: vscode.TextDocument): vscode.ProviderResult<vscode.SemanticTokens> {
      const tree = parser.parse(document.getText());
      const builder = new vscode.SemanticTokensBuilder(legend);

      // Run the highlight query over the whole tree
      const matches = query.matches(tree.rootNode);
      for (const m of matches) {
        for (const cap of m.captures) {
          const node = cap.node;
          if (!node) continue;
          const map = mapCaptureToToken(cap.name);
          if (!map) continue;

          const [tokType, mods] = map;
          const start = document.positionAt(node.startIndex);
          const end = document.positionAt(node.endIndex);
          builder.push(start.line, start.character, end.character - start.character, tokenTypes.get(tokType)!, mods.reduce((acc, mod) => acc | (1 << (tokenModifiers.get(mod)!)), 0));
        }
      }
      return builder.build();
    }
  }

  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      { language: 'vesti' },
      new VestiTokensProvider(),
      legend
    )
  );
}

export function deactivate() {}

