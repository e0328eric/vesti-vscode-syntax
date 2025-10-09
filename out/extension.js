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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const web_tree_sitter_1 = __importDefault(require("web-tree-sitter"));
// Tiny helper to read a file from extension assets
async function readAsset(context, rel) {
    const p = vscode.Uri.joinPath(context.extensionUri, rel);
    const data = await vscode.workspace.fs.readFile(p);
    return Buffer.from(data).toString('utf8');
}
async function activate(context) {
    // Init tree-sitter
    await web_tree_sitter_1.default.init();
    const wasmUri = vscode.Uri.joinPath(context.extensionUri, 'parsers/vesti.wasm');
    const lang = await web_tree_sitter_1.default.Language.load(wasmUri.fsPath);
    const parser = new web_tree_sitter_1.default();
    parser.setLanguage(lang);
    // Load highlight queries
    const highlights = await readAsset(context, 'queries/highlights.scm');
    const query = lang.query(highlights);
    // Build semantic token legend (token types/modifiers must match package.json)
    const tokenTypes = new Map();
    const tokenModifiers = new Map();
    const legend = (function makeLegend() {
        const types = [
            'namespace', 'class', 'enum', 'function', 'method', 'property', 'variable',
            'parameter', 'string', 'number', 'regexp', 'operator', 'keyword', 'comment',
            'type', 'macro', 'constant', 'punctuation', 'tag', 'attribute'
        ];
        const modifiers = [
            'declaration', 'definition', 'readonly', 'static', 'documentation',
            'defaultLibrary', 'abstract', 'async', 'mutable', 'modification'
        ];
        types.forEach((t, i) => tokenTypes.set(t, i));
        modifiers.forEach((m, i) => tokenModifiers.set(m, i));
        return new vscode.SemanticTokensLegend(types, modifiers);
    })();
    // Map Tree-sitter capture names to VSCode token types/modifiers
    // Adjust this to your captures in queries/vesti/highlights.scm
    function mapCaptureToToken(captureName) {
        // Common captures used in tree-sitter queries
        // e.g. @function, @keyword, @constant, @string, @type, @comment, etc.
        const base = captureName.replace(/^.*\./, ''); // handle dotted captures
        const table = {
            'function': ['function', []],
            'method': ['method', []],
            'keyword': ['keyword', []],
            'operator': ['operator', []],
            'type': ['type', []],
            'constant': ['constant', ['readonly', 'declaration']],
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
    class VestiTokensProvider {
        provideDocumentSemanticTokens(document) {
            const tree = parser.parse(document.getText());
            const builder = new vscode.SemanticTokensBuilder(legend);
            // Run the highlight query over the whole tree
            const matches = query.matches(tree.rootNode);
            for (const m of matches) {
                for (const cap of m.captures) {
                    const node = cap.node;
                    if (!node)
                        continue;
                    const map = mapCaptureToToken(cap.name);
                    if (!map)
                        continue;
                    const [tokType, mods] = map;
                    const start = document.positionAt(node.startIndex);
                    const end = document.positionAt(node.endIndex);
                    builder.push(start.line, start.character, end.character - start.character, tokenTypes.get(tokType), mods.reduce((acc, mod) => acc | (1 << (tokenModifiers.get(mod))), 0));
                }
            }
            return builder.build();
        }
    }
    context.subscriptions.push(vscode.languages.registerDocumentSemanticTokensProvider({ language: 'vesti' }, new VestiTokensProvider(), legend));
}
function deactivate() { }
