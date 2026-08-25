import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import ts from 'typescript';

export const CARIBBEAN_NAVAL_SOURCE_SEEDS = [
  'package.json',
  'package-lock.json',
  'vite.config.ts',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'knip.json',
  'index.html',
  'preview-caribbean-game.html',
  'scripts/caribbean-port-check.mjs',
  'scripts/caribbean-naval-check.mjs',
  'scripts/fixtures/caribbean-campaign-victory.json',
  ':(glob)scripts/lib/caribbean-naval-*.mjs',
  ':(glob)scripts/lib/caribbean-port-identity-*.mjs',
  ':(glob)scripts/lib/caribbean-campaign-*.mjs',
  ':(glob)src/games/caribbean/**',
  ':(glob)public/**',
];

const ALIAS_NAMES = ['@shared', '@games', '@app', '@test'];
const RESOLUTION_EXTENSIONS = [
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css',
  '.glb', '.webp', '.svg', '.png', '.woff2',
];
const SCRIPT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const NAVAL_SCREENSHOT_MANIFEST = [
  { name: 'battle-boundary-supported.png', width: 960, height: 600, state: 'battle-boundary' },
  { name: 'battle-desktop.png', width: 1440, height: 900, state: 'battle' },
  { name: 'battle-minimum-supported.png', width: 1024, height: 768, state: 'battle-minimum' },
  { name: 'battle-tablet-landscape.png', width: 1180, height: 820, state: 'battle-tablet' },
  { name: 'boarding-ready-result.png', width: 1180, height: 820, state: 'boarding-ready' },
  { name: 'briefing-tablet.png', width: 1180, height: 820, state: 'briefing' },
  { name: 'broadside-handedness.png', width: 1180, height: 820, state: 'starboard-broadside' },
  { name: 'decision-tablet.png', width: 1180, height: 820, state: 'decision' },
  { name: 'fallback-tablet-landscape.png', width: 1024, height: 768, state: 'fallback' },
  { name: 'minimum-screen-phone-landscape.png', width: 844, height: 390, state: 'unsupported-landscape' },
  { name: 'minimum-screen-phone-portrait.png', width: 430, height: 932, state: 'unsupported-portrait' },
];
const NAVAL_STABLE_STATIC = {
  canonicalInput: { battleId: 'battle-lab-red-jackdaw', seed: 1702 },
  viewports: {
    tablet: { width: 1180, height: 820 },
    desktop: { width: 1440, height: 900 },
    minimum: { width: 1024, height: 768 },
    boundary: { width: 960, height: 600 },
    phonePortrait: { width: 430, height: 932 },
    phoneLandscape: { width: 844, height: 390 },
  },
  handedness: {
    portVectorPositiveX: true,
    starboardVectorNegativeX: true,
    portMuzzlePositiveX: true,
    starboardMuzzleNegativeX: true,
    steeringPortPositive: true,
    steeringStarboardNegative: true,
    rudderReleased: true,
  },
  outcome: {
    ok: true,
    outcome: 'boarding-ready',
    initial: {
      distance: 7.02,
      outcomeInjected: false,
      damageInjectedAfterStart: false,
      timeInjected: false,
      opponent: { hull: 72, sails: 30, crew: 18, cannon: 6 },
    },
  },
  fallback: {
    ok: true,
    chart: true,
    retry: true,
    restart: true,
    battleControls: true,
    labelsClear: true,
  },
  motion: {
    normal: { preference: 'no-preference', reducedMotion: false },
    reduced: { preference: 'reduce', reducedMotion: true },
  },
  display: {
    supported: Object.fromEntries(['boundary', 'desktop', 'minimum', 'tablet'].map((name) => [name, {
      battle: true,
      notice: false,
      fullBleed: true,
      centerClear: true,
      controlsVisible: true,
      touchSized: true,
      labelsContained: true,
      shortcutKeys: true,
      sailControl: true,
      noOuterScroll: true,
    }])),
    unsupported: Object.fromEntries(['landscape', 'portrait'].map((name) => [name, {
      notice: true,
      battle: false,
      liveFrame: false,
      focused: true,
    }])),
    resize: {
      notice: true,
      noticeFocused: true,
      battleUnmounted: true,
      tickStopped: true,
      restoredWithNewSession: true,
    },
    prebattle: {
      decision: { legendComplete: true, ctaVisible: true, noOuterScroll: true },
      briefing: { legendComplete: true, ctaVisible: true, noOuterScroll: true },
    },
  },
};

function bytewise(left, right) {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

export function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.keys(value).sort(bytewise).map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export class CaribbeanNavalSourceAuditError extends Error {
  constructor({ diagnostic = null, importer = null, message = null } = {}) {
    super(message ?? (diagnostic && importer
      ? `CARIBBEAN_SOURCE_AUDIT_FAILED source-files diagnostic=${diagnostic} importer=${importer}`
      : 'CARIBBEAN_SOURCE_AUDIT_FAILED source-files'));
    this.name = 'CaribbeanNavalSourceAuditError';
    this.code = 'source-files';
    this.diagnostic = diagnostic;
    this.importer = importer;
  }
}

export class CaribbeanNavalVerificationError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'CaribbeanNavalVerificationError';
    this.code = code;
  }
}

function sourceFailure(message) {
  throw new CaribbeanNavalSourceAuditError({ message: `CARIBBEAN_SOURCE_AUDIT_FAILED source-files ${message}` });
}

function nulPaths(bytes, label) {
  const values = bytes.split('\0').filter(Boolean).map((value) => value.replaceAll('\\', '/'));
  if (new Set(values).size !== values.length) sourceFailure(`${label} contains duplicate paths`);
  return values.sort(bytewise);
}

function trackedPaths(root, pathspecs = null) {
  const args = ['ls-files', '-z'];
  if (pathspecs !== null) args.push('--', ...pathspecs);
  const output = execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  return nulPaths(output, pathspecs === null ? 'tracked universe' : 'source seeds');
}

function validatedSeedPaths(root, universe) {
  for (const seed of CARIBBEAN_NAVAL_SOURCE_SEEDS) {
    if (seed.startsWith(':(glob)')) {
      if (trackedPaths(root, [seed]).length === 0) sourceFailure(`required seed class is empty: ${seed}`);
    } else if (!universe.has(seed)) {
      sourceFailure(`required seed is missing: ${seed}`);
    }
  }
  return trackedPaths(root, CARIBBEAN_NAVAL_SOURCE_SEEDS);
}

function parseJsonConfig(root, relative) {
  const raw = fs.readFileSync(path.join(root, relative), 'utf8');
  const parsed = ts.parseConfigFileTextToJson(relative, raw);
  if (parsed.error || !parsed.config) sourceFailure(`${relative} could not be parsed`);
  return parsed.config;
}

function propertyName(node) {
  if (ts.isIdentifier(node) || ts.isStringLiteral(node) || ts.isNumericLiteral(node)) return node.text;
  return null;
}

function closedObjectProperties(object) {
  const properties = new Map();
  for (const property of object.properties) {
    if (!ts.isPropertyAssignment(property) && !ts.isShorthandPropertyAssignment(property)) return null;
    const name = propertyName(property.name);
    if (name === null || properties.has(name)) return null;
    properties.set(name, property);
  }
  return properties;
}

function authenticViteDefineConfig(identifier, checker) {
  if (!ts.isIdentifier(identifier)) return false;
  const symbol = checker.getSymbolAtLocation(identifier);
  const declarations = symbol?.declarations ?? [];
  if (declarations.length !== 1 || !ts.isImportSpecifier(declarations[0])) return false;
  const declaration = declarations[0];
  const importedName = declaration.propertyName?.text ?? declaration.name.text;
  const importDeclaration = declaration.parent?.parent?.parent;
  return importedName === 'defineConfig' && declaration.name.text === identifier.text
    && ts.isImportDeclaration(importDeclaration)
    && ts.isStringLiteral(importDeclaration.moduleSpecifier)
    && importDeclaration.moduleSpecifier.text === 'vite';
}

function valueSymbolAtIdentifier(identifier, checker) {
  if (ts.isShorthandPropertyAssignment(identifier.parent) && identifier.parent.name === identifier) {
    return checker.getShorthandAssignmentValueSymbol(identifier.parent) ?? checker.getSymbolAtLocation(identifier);
  }
  return checker.getSymbolAtLocation(identifier);
}

function immutableConstObjectAtUse(source, identifier, checker) {
  const symbol = valueSymbolAtIdentifier(identifier, checker);
  const declarations = symbol?.declarations ?? [];
  if (declarations.length !== 1 || !ts.isVariableDeclaration(declarations[0])) return null;
  const declaration = declarations[0];
  const declarationList = declaration.parent;
  if (declaration.getSourceFile() !== source || !ts.isIdentifier(declaration.name)
    || !ts.isObjectLiteralExpression(declaration.initializer)
    || !ts.isVariableDeclarationList(declarationList)
    || (declarationList.flags & ts.NodeFlags.Const) === 0
    || declaration.getEnd() >= identifier.getStart(source)) return null;
  const allowed = new Set([declaration.name, identifier]);
  let safe = true;
  const visit = (node) => {
    if (!safe) return;
    if (ts.isIdentifier(node) && valueSymbolAtIdentifier(node, checker) === symbol && !allowed.has(node)) {
      safe = false;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return safe ? declaration.initializer : null;
}

function closedObjectValue(source, object, key, checker, { allowBoundObject = false } = {}) {
  const properties = closedObjectProperties(object);
  const property = properties?.get(key);
  if (!property) return null;
  const value = ts.isPropertyAssignment(property) ? property.initializer : property.name;
  if (ts.isObjectLiteralExpression(value)) return value;
  return allowBoundObject && ts.isIdentifier(value)
    ? immutableConstObjectAtUse(source, value, checker)
    : null;
}

function viteConfigObject(source, checker) {
  const exports = source.statements.filter((statement) => ts.isExportAssignment(statement) && !statement.isExportEquals);
  if (exports.length !== 1) return null;
  const expression = exports[0].expression;
  if (ts.isObjectLiteralExpression(expression)) return expression;
  if (ts.isCallExpression(expression) && authenticViteDefineConfig(expression.expression, checker)
    && expression.arguments.length === 1
    && ts.isObjectLiteralExpression(expression.arguments[0])) return expression.arguments[0];
  return null;
}

function nodeUrlImportBinding(identifier, checker, importedName) {
  const symbol = checker.getSymbolAtLocation(identifier);
  const declarations = symbol?.declarations ?? [];
  if (declarations.length !== 1 || !ts.isImportSpecifier(declarations[0])) return false;
  const declaration = declarations[0];
  const imported = declaration.propertyName?.text ?? declaration.name.text;
  const importDeclaration = declaration.parent?.parent?.parent;
  return imported === importedName && declaration.name.text === identifier.text
    && ts.isImportDeclaration(importDeclaration)
    && ts.isStringLiteral(importDeclaration.moduleSpecifier)
    && importDeclaration.moduleSpecifier.text === 'node:url';
}

function viteAliasExpression(source, aliasesObject, name, checker) {
  const matches = aliasesObject.properties.filter((property) => (
    ts.isPropertyAssignment(property) && propertyName(property.name) === name
  ));
  if (matches.length !== 1) return null;
  const outer = matches[0].initializer;
  if (!ts.isCallExpression(outer) || !ts.isIdentifier(outer.expression)
    || outer.expression.text !== 'fileURLToPath' || outer.arguments.length !== 1
    || !nodeUrlImportBinding(outer.expression, checker, 'fileURLToPath')) return null;
  const url = outer.arguments[0];
  if (!ts.isNewExpression(url) || !ts.isIdentifier(url.expression) || url.expression.text !== 'URL'
    || !nodeUrlImportBinding(url.expression, checker, 'URL')) return null;
  const args = url.arguments ?? [];
  const target = args.length === 2 ? literalText(args[0]) : null;
  if (target === null || !isImportMetaUrl(args[1])) return null;
  return { target, url };
}

function loadAliases(root, universe, scriptProgram) {
  const config = parseJsonConfig(root, 'tsconfig.app.json');
  const paths = config.compilerOptions?.paths ?? {};
  const aliases = {};
  for (const name of ALIAS_NAMES) {
    const configured = paths[`${name}/*`];
    if (!Array.isArray(configured) || configured.length !== 1 || typeof configured[0] !== 'string') {
      sourceFailure(`tsconfig.app.json alias ${name} is invalid`);
    }
    const target = configured[0].replace(/\/\*$/, '').replace(/^\.\//, '').replaceAll('\\', '/');
    aliases[name] = target;
  }
  const vitePath = scriptProgram.absoluteByRelative.get('vite.config.ts');
  const source = vitePath ? scriptProgram.program.getSourceFile(vitePath) : null;
  if (!source) sourceFailure('TypeScript program omitted vite.config.ts');
  const configObject = viteConfigObject(source, scriptProgram.checker);
  const resolveObject = configObject && closedObjectValue(
    source, configObject, 'resolve', scriptProgram.checker,
  );
  const aliasObject = resolveObject && ts.isObjectLiteralExpression(resolveObject)
    ? closedObjectValue(source, resolveObject, 'alias', scriptProgram.checker, { allowBoundObject: true })
    : null;
  if (!aliasObject || !ts.isObjectLiteralExpression(aliasObject)) sourceFailure('vite.config.ts alias object is missing');
  const aliasProperties = closedObjectProperties(aliasObject);
  if (!aliasProperties || aliasProperties.size !== ALIAS_NAMES.length
    || ALIAS_NAMES.some((name) => !aliasProperties.has(name))) {
    sourceFailure('vite.config.ts alias object must contain exactly the four approved aliases');
  }
  const directoryUrlNodes = new Set();
  for (const name of ALIAS_NAMES) {
    const expression = viteAliasExpression(source, aliasObject, name, scriptProgram.checker);
    if (!expression) sourceFailure(`vite.config.ts alias ${name} is missing`);
    const target = path.posix.normalize(expression.target.replace(/^\.\//, ''));
    if (target !== aliases[name]) sourceFailure(`vite.config.ts alias ${name} disagrees with tsconfig.app.json`);
    const absolute = path.join(root, target);
    if (!fs.statSync(absolute, { throwIfNoEntry: false })?.isDirectory()) sourceFailure(`vite.config.ts alias ${name} is not a directory`);
    if (!universe.some((relative) => relative.startsWith(`${target}/`))) sourceFailure(`vite.config.ts alias ${name} has no tracked source`);
    directoryUrlNodes.add(`${expression.url.getStart(source)}:${expression.url.end}`);
  }
  return { aliases, directoryUrlNodes };
}

function packageRoots(root) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  return new Set(Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
    ...manifest.peerDependencies,
    ...manifest.optionalDependencies,
  }));
}

function packageRoot(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function typePackage(specifier) {
  const root = packageRoot(specifier);
  if (root.startsWith('@')) {
    const [scope, name] = root.slice(1).split('/');
    return `@types/${scope}__${name}`;
  }
  return `@types/${root}`;
}

function isRemoteOrEmbedded(specifier) {
  return /^(?:https?:|data:|blob:|#)/.test(specifier);
}

function isImportMeta(node) {
  return ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword && node.name.text === 'meta';
}

function isImportMetaUrl(node) {
  return ts.isPropertyAccessExpression(node) && node.name.text === 'url' && isImportMeta(node.expression);
}

function isImportMetaGlob(node) {
  return ts.isPropertyAccessExpression(node)
    && node.name.text === 'glob'
    && isImportMeta(node.expression);
}

function literalText(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) ? node.text : null;
}

function pureLiteralConcatenation(node) {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isParenthesizedExpression(node)) return pureLiteralConcatenation(node.expression);
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    const left = pureLiteralConcatenation(node.left);
    const right = pureLiteralConcatenation(node.right);
    return left === null || right === null ? null : left + right;
  }
  return null;
}

function isAssignmentOperator(kind) {
  return kind >= ts.SyntaxKind.FirstAssignment && kind <= ts.SyntaxKind.LastAssignment;
}

function identifierIsWritten(identifier) {
  let child = identifier;
  let parent = child.parent;
  if ((ts.isPrefixUnaryExpression(parent) || ts.isPostfixUnaryExpression(parent))
    && (parent.operator === ts.SyntaxKind.PlusPlusToken || parent.operator === ts.SyntaxKind.MinusMinusToken)) return true;
  while (parent) {
    if (ts.isBinaryExpression(parent) && isAssignmentOperator(parent.operatorToken.kind)) {
      return parent.left === child;
    }
    if (ts.isForInStatement(parent) || ts.isForOfStatement(parent)) return parent.initializer === child;
    const assignmentPatternParent = ts.isParenthesizedExpression(parent)
      || ts.isNonNullExpression(parent)
      || ts.isAsExpression(parent)
      || ts.isTypeAssertionExpression(parent)
      || ts.isSatisfiesExpression(parent)
      || ts.isArrayLiteralExpression(parent)
      || ts.isObjectLiteralExpression(parent)
      || ts.isSpreadElement(parent)
      || (ts.isPropertyAssignment(parent) && parent.initializer === child)
      || (ts.isShorthandPropertyAssignment(parent) && parent.name === child)
      || (ts.isBinaryExpression(parent) && isAssignmentOperator(parent.operatorToken.kind) && parent.left === child);
    if (!assignmentPatternParent) return false;
    child = parent;
    parent = parent.parent;
  }
  return false;
}

function exactViteIgnoreArgumentTrivia(argument, source) {
  return source.text.slice(argument.getFullStart(), argument.getStart(source)).trim() === '/* @vite-ignore */';
}

function lexicalDeclarationScope(declaration) {
  let node = declaration.parent;
  while (node && !ts.isSourceFile(node) && !ts.isBlock(node) && !ts.isModuleBlock(node)
    && !ts.isCaseBlock(node) && !ts.isForStatement(node) && !ts.isForInStatement(node)
    && !ts.isForOfStatement(node)) node = node.parent;
  return node;
}

function hasUniqueSameScopeDeclaration(source, declaration) {
  const scope = lexicalDeclarationScope(declaration);
  let count = 0;
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)
      && node.name.text === declaration.name.text && lexicalDeclarationScope(node) === scope) count += 1;
    ts.forEachChild(node, visit);
  };
  visit(source);
  return count === 1;
}

function annotatedLiteralImport(argument, source, checker) {
  if (!ts.isIdentifier(argument) || !exactViteIgnoreArgumentTrivia(argument, source)) return null;
  const symbol = checker.getSymbolAtLocation(argument);
  if (!symbol) return null;
  const declarations = (symbol.declarations ?? []).filter((declaration) => declaration.getSourceFile() === source);
  if (declarations.length !== 1 || !ts.isVariableDeclaration(declarations[0])) return null;
  const declaration = declarations[0];
  if (!ts.isIdentifier(declaration.name) || declaration.name.text !== argument.text
    || !declaration.initializer || declaration.getEnd() >= argument.getStart(source)
    || !hasUniqueSameScopeDeclaration(source, declaration)) return null;
  const declarationList = declaration.parent;
  if (!ts.isVariableDeclarationList(declarationList) || (declarationList.flags & ts.NodeFlags.Const) === 0) return null;
  const value = pureLiteralConcatenation(declaration.initializer);
  if (value === null) return null;

  let wasWritten = false;
  const findWrites = (node) => {
    if (wasWritten) return;
    if (ts.isIdentifier(node) && node !== declaration.name
      && checker.getSymbolAtLocation(node) === symbol && identifierIsWritten(node)) {
      wasWritten = true;
      return;
    }
    ts.forEachChild(node, findWrites);
  };
  findWrites(source);
  return wasWritten ? null : value;
}

function scriptEdges(relative, source, checker) {
  const edges = [];
  for (const reference of source.referencedFiles) edges.push({ specifier: reference.fileName, typeOnly: true, kind: 'script' });
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      edges.push({ specifier: node.moduleSpecifier.text, typeOnly: Boolean(node.importClause?.isTypeOnly), kind: 'script' });
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      edges.push({ specifier: node.moduleSpecifier.text, typeOnly: node.isTypeOnly, kind: 'script' });
    } else if (ts.isImportTypeNode(node)) {
      const argument = node.argument;
      if (ts.isLiteralTypeNode(argument) && ts.isStringLiteral(argument.literal)) {
        edges.push({ specifier: argument.literal.text, typeOnly: true, kind: 'script' });
      }
    } else if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      let specifier = node.arguments.length === 1 ? literalText(node.arguments[0]) : null;
      if (specifier === null && node.arguments.length === 1) {
        specifier = annotatedLiteralImport(node.arguments[0], source, checker);
      }
      if (specifier === null) {
        throw new CaribbeanNavalSourceAuditError({ diagnostic: 'nonliteral-dynamic-import', importer: relative });
      }
      edges.push({ specifier, typeOnly: false, kind: 'script' });
    } else if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'require') {
      const specifier = node.arguments.length === 1 ? literalText(node.arguments[0]) : null;
      if (specifier === null) {
        throw new CaribbeanNavalSourceAuditError({ diagnostic: 'nonliteral-commonjs-require', importer: relative });
      }
      edges.push({ specifier, typeOnly: false, kind: 'script' });
    } else if (ts.isCallExpression(node) && isImportMetaGlob(node.expression)) {
      throw new CaribbeanNavalSourceAuditError({ diagnostic: 'unsupported-import-meta-glob', importer: relative });
    } else if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === 'URL') {
      const args = node.arguments ?? [];
      const specifier = args.length >= 2 ? literalText(args[0]) : null;
      if (specifier !== null && isImportMetaUrl(args[1]) && !isRemoteOrEmbedded(specifier)) {
        edges.push({
          specifier,
          typeOnly: false,
          kind: 'url',
          nodeKey: `${node.getStart(source)}:${node.end}`,
        });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return edges;
}

function htmlEdges(raw) {
  const edges = [];
  const tag = /<(script|link)\b([^>]*)>/gi;
  let match;
  while ((match = tag.exec(raw)) !== null) {
    const attributes = Object.fromEntries([...match[2].matchAll(/([:\w-]+)\s*=\s*(['"])(.*?)\2/g)].map((entry) => [entry[1].toLowerCase(), entry[3]]));
    if (match[1].toLowerCase() === 'script' && attributes.type === 'module' && attributes.src && !isRemoteOrEmbedded(attributes.src)) {
      edges.push({ specifier: attributes.src, typeOnly: false, kind: 'document' });
    }
    if (match[1].toLowerCase() === 'link'
      && ['stylesheet', 'icon', 'manifest'].includes((attributes.rel ?? '').toLowerCase())
      && attributes.href && !isRemoteOrEmbedded(attributes.href)) {
      edges.push({ specifier: attributes.href, typeOnly: false, kind: 'document' });
    }
  }
  return edges;
}

function cssEdges(raw) {
  const edges = [];
  for (const match of raw.matchAll(/@import\s+(?:url\(\s*)?['"]?([^'"\s)]+)['"]?\s*\)?/gi)) {
    if (!isRemoteOrEmbedded(match[1])) edges.push({ specifier: match[1], typeOnly: false, kind: 'document' });
  }
  for (const match of raw.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)) {
    if (match[2] && !isRemoteOrEmbedded(match[2])) edges.push({ specifier: match[2], typeOnly: false, kind: 'document' });
  }
  return edges;
}

function extractedEdges(relative, raw, scriptProgram) {
  const extension = path.posix.extname(relative);
  if (SCRIPT_EXTENSIONS.has(extension)) {
    const absolute = scriptProgram.absoluteByRelative.get(relative);
    const source = scriptProgram.program.getSourceFile(absolute);
    if (!source) sourceFailure(`TypeScript program omitted ${relative}`);
    return scriptEdges(relative, source, scriptProgram.checker);
  }
  if (extension === '.html') return htmlEdges(raw);
  if (extension === '.css') return cssEdges(raw);
  return [];
}

function createScriptProgram(root, universePaths) {
  const absoluteByRelative = new Map(universePaths
    .filter((relative) => SCRIPT_EXTENSIONS.has(path.posix.extname(relative)))
    .map((relative) => [relative, path.resolve(root, relative)]));
  const program = ts.createProgram({
    rootNames: [...absoluteByRelative.values()],
    options: {
      allowJs: true,
      checkJs: false,
      jsx: ts.JsxEmit.Preserve,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      noEmit: true,
      noResolve: true,
      skipLibCheck: true,
      target: ts.ScriptTarget.ESNext,
    },
  });
  return { absoluteByRelative, program, checker: program.getTypeChecker() };
}

function stripQueryHash(specifier) {
  return specifier.split(/[?#]/, 1)[0];
}

function localBase(importer, specifier, aliases, forceRelative = false) {
  const clean = stripQueryHash(specifier).replaceAll('\\', '/');
  for (const [alias, target] of Object.entries(aliases)) {
    if (clean === alias) return target;
    if (clean.startsWith(`${alias}/`)) return path.posix.join(target, clean.slice(alias.length + 1));
  }
  if (clean.startsWith('/src/')) return clean.slice(1);
  if (clean.startsWith('/')) return path.posix.join('public', clean.slice(1));
  if (clean.startsWith('.')) return path.posix.normalize(path.posix.join(path.posix.dirname(importer), clean));
  if (forceRelative) return path.posix.normalize(path.posix.join(path.posix.dirname(importer), clean));
  return null;
}

const DIRECTORY_REFERENCE = Symbol('directory-reference');

function resolveLocal(root, importer, edge, aliases, universe, viteDirectoryUrlNodes) {
  const { specifier } = edge;
  const base = localBase(importer, specifier, aliases, edge.kind === 'document');
  if (base === null) return null;
  if (base === '..' || base.startsWith('../') || path.posix.isAbsolute(base)) sourceFailure(`edge escapes repository importer=${importer}`);
  if (edge.kind === 'url' && fs.statSync(path.join(root, base), { throwIfNoEntry: false })?.isDirectory()) {
    if (importer === 'vite.config.ts' && viteDirectoryUrlNodes.has(edge.nodeKey)) return DIRECTORY_REFERENCE;
    sourceFailure(`unresolved edge importer=${importer} specifier=${specifier}`);
  }
  const hasExtension = path.posix.extname(base) !== '';
  const candidates = hasExtension
    ? [base]
    : [base, ...RESOLUTION_EXTENSIONS.map((extension) => `${base}${extension}`), ...RESOLUTION_EXTENSIONS.map((extension) => path.posix.join(base, `index${extension}`))];
  let matches = [...new Set(candidates)].filter((candidate) => universe.has(candidate));
  if (matches.length === 0 && edge.kind === 'document' && path.posix.dirname(importer) === '.'
    && !specifier.startsWith('.') && !specifier.startsWith('/')) {
    const publicBase = path.posix.join('public', stripQueryHash(specifier));
    const publicHasExtension = path.posix.extname(publicBase) !== '';
    const publicCandidates = publicHasExtension
      ? [publicBase]
      : [publicBase, ...RESOLUTION_EXTENSIONS.map((extension) => `${publicBase}${extension}`), ...RESOLUTION_EXTENSIONS.map((extension) => path.posix.join(publicBase, `index${extension}`))];
    matches = [...new Set(publicCandidates)].filter((candidate) => universe.has(candidate));
  }
  if (matches.length !== 1) {
    sourceFailure(`${matches.length === 0 ? 'unresolved' : 'ambiguous'} edge importer=${importer} specifier=${specifier}`);
  }
  return matches[0];
}

function externalAllowed(specifier, typeOnly, packages) {
  if (specifier.startsWith('node:')) return true;
  const root = packageRoot(specifier);
  return packages.has(root) || (typeOnly && packages.has(typePackage(specifier)));
}

export function auditCaribbeanNavalSourceClosure(root) {
  const absoluteRoot = path.resolve(root);
  const universePaths = trackedPaths(absoluteRoot);
  const universe = new Set(universePaths);
  for (const relative of universePaths) {
    if (!fs.statSync(path.join(absoluteRoot, relative), { throwIfNoEntry: false })?.isFile()) sourceFailure(`tracked path is not a file: ${relative}`);
  }
  const seeds = validatedSeedPaths(absoluteRoot, universe);
  const scriptProgram = createScriptProgram(absoluteRoot, universePaths);
  const { aliases, directoryUrlNodes } = loadAliases(absoluteRoot, universePaths, scriptProgram);
  const packages = packageRoots(absoluteRoot);
  const closure = new Set(seeds);
  const queue = [...seeds];
  const edges = [];
  while (queue.length > 0) {
    const importer = queue.shift();
    const raw = fs.readFileSync(path.join(absoluteRoot, importer), 'utf8');
    for (const edge of extractedEdges(importer, raw, scriptProgram)) {
      const target = resolveLocal(absoluteRoot, importer, edge, aliases, universe, directoryUrlNodes);
      if (target === DIRECTORY_REFERENCE) continue;
      if (target === null) {
        if (edge.kind === 'script' && edge.specifier.startsWith('#')) {
          sourceFailure(`unknown bare edge importer=${importer} specifier=${edge.specifier}`);
        }
        if (isRemoteOrEmbedded(edge.specifier) || externalAllowed(edge.specifier, edge.typeOnly, packages)) continue;
        sourceFailure(`unknown bare edge importer=${importer} specifier=${edge.specifier}`);
      }
      edges.push({ importer, specifier: edge.specifier, target });
      if (!closure.has(target)) {
        closure.add(target);
        queue.push(target);
      }
    }
  }
  const paths = [...closure].sort(bytewise);
  for (const edge of edges) {
    if (!closure.has(edge.importer) || !closure.has(edge.target)) sourceFailure(`closure omitted edge ${edge.importer} -> ${edge.target}`);
  }
  return {
    seeds,
    paths,
    edges: edges.sort((left, right) => bytewise(`${left.importer}\0${left.specifier}\0${left.target}`, `${right.importer}\0${right.specifier}\0${right.target}`)),
  };
}

export function collectCaribbeanNavalSourceManifest(root) {
  const audit = auditCaribbeanNavalSourceClosure(root);
  const files = audit.paths.map((relative) => ({
    path: relative,
    sha256: sha256(fs.readFileSync(path.join(root, relative))),
  }));
  return { files, sourceHash: sha256(canonicalJson(files)) };
}

export function verifySourceManifest(captured, current) {
  const capturedFiles = captured?.files ?? captured?.sourceFiles;
  const currentFiles = current?.files ?? current?.sourceFiles;
  if (!Array.isArray(capturedFiles) || !Array.isArray(currentFiles)
    || capturedFiles.length !== currentFiles.length
    || capturedFiles.some((row, index) => row?.path !== currentFiles[index]?.path)) {
    throw new CaribbeanNavalVerificationError('source-files');
  }
  if (capturedFiles.some((row, index) => row.sha256 !== currentFiles[index].sha256)
    || captured.sourceHash !== current.sourceHash) {
    throw new CaribbeanNavalVerificationError('source-hash');
  }
  return true;
}

function verifyObservations(observations) {
  const samples = observations?.samples;
  if (!Array.isArray(samples) || samples.length !== 20) throw new CaribbeanNavalVerificationError('observation-range');
  let priorTick = -1;
  let sawEffect = false;
  for (const sample of samples) {
    if (!Number.isFinite(sample?.tick) || sample.tick <= priorTick || sample.paused !== false || sample.outcome !== null) {
      throw new CaribbeanNavalVerificationError('observation-range');
    }
    priorTick = sample.tick;
    for (const field of ['textures', 'geometries', 'materials', 'bufferAttributes', 'activeEffects', 'effectCapacity']) {
      if (!Number.isFinite(sample[field]) || sample[field] < 0) throw new CaribbeanNavalVerificationError('observation-range');
    }
    if (sample.effectCapacity <= 0 || sample.activeEffects > sample.effectCapacity) throw new CaribbeanNavalVerificationError('observation-range');
    sawEffect ||= sample.activeEffects > 0;
  }
  if (!sawEffect
    || !Array.isArray(observations.fpsSamples) || observations.fpsSamples.length === 0
    || observations.fpsSamples.some((value) => !Number.isFinite(value) || value < 0)
    || !Number.isFinite(observations.sustainedFps) || observations.sustainedFps < 50
    || !Number.isFinite(observations.maxDrawCalls) || observations.maxDrawCalls > 120
    || !Number.isFinite(observations.maxTriangles) || observations.maxTriangles > 100_000
    || !Number.isFinite(observations.boardingDuration) || observations.boardingDuration < 0 || observations.boardingDuration >= 15) {
    throw new CaribbeanNavalVerificationError('observation-range');
  }
  for (const field of ['textures', 'geometries', 'materials', 'bufferAttributes', 'effectCapacity']) {
    if (observations.growthAfterWarmup?.[field] !== 0) throw new CaribbeanNavalVerificationError('observation-range');
  }
  for (const field of ['console', 'page', 'requests', 'unhandledRejections', 'allocation', 'capacity', 'pool']) {
    if (!Array.isArray(observations.failures?.[field]) || observations.failures[field].length !== 0) {
      throw new CaribbeanNavalVerificationError('observation-range');
    }
  }
}

function pngDimensions(bytes) {
  const data = Buffer.from(bytes ?? []);
  if (data.length < 24 || !data.subarray(0, 8).equals(PNG_SIGNATURE)
    || data.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
  return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
}

function exactKeys(value, expected) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && canonicalJson(Object.keys(value).sort(bytewise)) === canonicalJson([...expected].sort(bytewise));
}

function safeBasename(name) {
  return typeof name === 'string' && name.length > 0 && !path.isAbsolute(name)
    && name === path.basename(name) && !name.includes('/') && !name.includes('\\')
    && name !== '.' && name !== '..';
}

function containedFile(base, name) {
  if (!safeBasename(name)) throw new CaribbeanNavalVerificationError('artifact-manifest');
  const absoluteBase = path.resolve(base);
  const candidate = path.resolve(absoluteBase, name);
  if (candidate === absoluteBase || !candidate.startsWith(`${absoluteBase}${path.sep}`)) {
    throw new CaribbeanNavalVerificationError('artifact-manifest');
  }
  return candidate;
}

function realDirectory(directory, { create = false, code = 'artifact-manifest' } = {}) {
  const absolute = path.resolve(directory);
  if (create) fs.mkdirSync(absolute, { recursive: true });
  const status = fs.lstatSync(absolute, { throwIfNoEntry: false });
  if (!status?.isDirectory() || status.isSymbolicLink()) {
    throw new CaribbeanNavalVerificationError(code);
  }
  return absolute;
}

function readContainedBytes(directory, name, { missing = false } = {}) {
  const base = realDirectory(directory);
  const candidate = containedFile(base, name);
  const status = fs.lstatSync(candidate, { throwIfNoEntry: false });
  if (status === undefined && missing) return null;
  if (!status?.isFile() || status.isSymbolicLink()
    || fs.realpathSync(path.dirname(candidate)) !== fs.realpathSync(base)) {
    throw new CaribbeanNavalVerificationError('artifact-manifest');
  }
  const descriptor = fs.openSync(candidate, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  try {
    return fs.readFileSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
}

export function validateStableNavalManifest(manifest) {
  const keys = [
    'version', 'sourceFiles', 'sourceHash', 'canonicalInput', 'viewports', 'screenshots',
    'asset', 'handedness', 'outcome', 'fallback', 'motion', 'display',
  ];
  if (!exactKeys(manifest, keys) || manifest.version !== 1) {
    throw new CaribbeanNavalVerificationError('stable-manifest');
  }
  const files = manifest.sourceFiles;
  if (!Array.isArray(files) || files.length === 0) throw new CaribbeanNavalVerificationError('stable-manifest');
  let prior = null;
  const seen = new Set();
  for (const row of files) {
    if (!exactKeys(row, ['path', 'sha256']) || typeof row.path !== 'string'
      || row.path.length === 0 || row.path.includes('\\') || path.posix.isAbsolute(row.path)
      || row.path !== path.posix.normalize(row.path) || row.path === '.'
      || row.path === '..' || row.path.startsWith('../') || !/^[a-f0-9]{64}$/.test(row.sha256)
      || seen.has(row.path) || (prior !== null && bytewise(prior, row.path) >= 0)) {
      throw new CaribbeanNavalVerificationError('stable-manifest');
    }
    seen.add(row.path);
    prior = row.path;
  }
  if (!/^[a-f0-9]{64}$/.test(manifest.sourceHash)
    || manifest.sourceHash !== sha256(canonicalJson(files))) {
    throw new CaribbeanNavalVerificationError('stable-manifest');
  }
  for (const [key, expected] of Object.entries(NAVAL_STABLE_STATIC)) {
    if (canonicalJson(manifest[key]) !== canonicalJson(expected)) {
      throw new CaribbeanNavalVerificationError('stable-manifest');
    }
  }
  if (canonicalJson(manifest.screenshots) !== canonicalJson(NAVAL_SCREENSHOT_MANIFEST)
    || !manifest.screenshots.every((row) => safeBasename(row.name))) {
    throw new CaribbeanNavalVerificationError('stable-manifest');
  }
  if (!exactKeys(manifest.asset, ['path', 'sha256'])
    || !/^\/assets\/caribbean-sloop-[A-Za-z0-9_-]+\.glb$/.test(manifest.asset.path)
    || !/^[a-f0-9]{64}$/.test(manifest.asset.sha256)) {
    throw new CaribbeanNavalVerificationError('stable-manifest');
  }
  return true;
}

function verifyArtifacts(stableManifest, artifacts) {
  validateStableNavalManifest(stableManifest);
  const expected = stableManifest?.screenshots;
  if (!Array.isArray(expected) || !Array.isArray(artifacts) || expected.length !== artifacts.length) {
    throw new CaribbeanNavalVerificationError('artifact-manifest');
  }
  for (const [index, row] of expected.entries()) {
    const artifact = artifacts[index];
    const dimensions = pngDimensions(artifact?.bytes);
    if (artifact?.name !== row?.name || artifact?.width !== row?.width || artifact?.height !== row?.height
      || artifact?.state !== row?.state || !dimensions
      || dimensions.width !== row.width || dimensions.height !== row.height || Buffer.from(artifact.bytes).length === 0) {
      throw new CaribbeanNavalVerificationError('artifact-manifest');
    }
  }
}

export function verifyNavalGeneration(captured, fresh) {
  validateFreshNavalGeneration(captured);
  validateFreshNavalGeneration(fresh);
  if (canonicalJson(captured?.stableManifest) !== canonicalJson(fresh?.stableManifest)) {
    throw new CaribbeanNavalVerificationError('stable-manifest');
  }
  return true;
}

export function validateFreshNavalGeneration(generation) {
  validateStableNavalManifest(generation?.stableManifest);
  verifyObservations(generation?.observations);
  verifyArtifacts(generation?.stableManifest, generation?.artifacts);
  return true;
}

function cleanTrackedWorktree(root) {
  return execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: root, encoding: 'utf8' }).trim() === '';
}

function head(root) {
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
}

function captureHeadIsAncestor(root, captureHead) {
  if (!/^[a-f0-9]{40}$/.test(captureHead)) return false;
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', captureHead, 'HEAD'], { cwd: root, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function validateGenerationProvenance(generation, expectedHead, expectedSource) {
  if (!/^[a-f0-9]{40}$/.test(expectedHead)
    || generation?.capture?.headCommitAtCapture !== expectedHead
    || generation?.source?.headCommitAtCapture !== expectedHead
    || generation?.capture?.worktreeDirtyBeforeCapture !== false
    || generation?.source?.worktreeDirtyBeforeCapture !== false) {
    throw new CaribbeanNavalVerificationError('stale-capture');
  }
  verifySourceManifest(generation.stableManifest, expectedSource);
  verifySourceManifest(generation.source, expectedSource);
}

function validateRepositoryUnchanged(root, expectedHead, expectedSource) {
  if (!cleanTrackedWorktree(root)) throw new CaribbeanNavalVerificationError('dirty-worktree');
  if (head(root) !== expectedHead) throw new CaribbeanNavalVerificationError('stale-capture');
  const current = collectCaribbeanNavalSourceManifest(root);
  verifySourceManifest(expectedSource, current);
  return current;
}

export function readNavalGeneration(directory) {
  if (!fs.existsSync(directory)) return null;
  const metricsBytes = readContainedBytes(directory, 'metrics.json', { missing: true });
  if (metricsBytes === null) return null;
  const metrics = JSON.parse(metricsBytes.toString('utf8'));
  validateStableNavalManifest(metrics.stableManifest);
  const artifacts = (metrics.stableManifest?.screenshots ?? []).map((row) => ({
    ...row,
    bytes: readContainedBytes(directory, row.name),
  }));
  return { ...metrics, artifacts };
}

let publicationTemporarySequence = 0;

function saveBytesIfChanged(directory, name, bytes, expectedRealDirectory) {
  const base = realDirectory(directory, { create: true });
  if (fs.realpathSync(base) !== expectedRealDirectory) {
    throw new CaribbeanNavalVerificationError('destination');
  }
  const destination = containedFile(base, name);
  const next = Buffer.from(bytes);
  const status = fs.lstatSync(destination, { throwIfNoEntry: false });
  if (status !== undefined && (!status.isFile() || status.isSymbolicLink())) {
    throw new CaribbeanNavalVerificationError('artifact-manifest');
  }
  const current = status?.isFile() ? readContainedBytes(base, name) : null;
  if (current?.equals(next)) return false;
  const temporary = path.join(base, `.${name}.${process.pid}.${publicationTemporarySequence += 1}.tmp`);
  let descriptor;
  try {
    descriptor = fs.openSync(
      temporary,
      fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_WRONLY | fs.constants.O_NOFOLLOW,
      0o600,
    );
    fs.writeFileSync(descriptor, next);
    fs.closeSync(descriptor);
    descriptor = undefined;
    const finalStatus = fs.lstatSync(destination, { throwIfNoEntry: false });
    if (finalStatus !== undefined && (!finalStatus.isFile() || finalStatus.isSymbolicLink())) {
      throw new CaribbeanNavalVerificationError('artifact-manifest');
    }
    if (fs.realpathSync(path.dirname(destination)) !== fs.realpathSync(base)) {
      throw new CaribbeanNavalVerificationError('artifact-manifest');
    }
    fs.renameSync(temporary, destination);
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    fs.rmSync(temporary, { force: true });
  }
  return true;
}

function publishGeneration(tempDirectory, docsDirectory, expectedRealDirectory, generation) {
  validateFreshNavalGeneration(generation);
  const metricsBytes = readContainedBytes(tempDirectory, 'metrics.json');
  const parsedMetrics = JSON.parse(metricsBytes);
  const { artifacts: _artifacts, ...returnedMetrics } = generation;
  if (canonicalJson(parsedMetrics) !== canonicalJson(returnedMetrics)) {
    throw new CaribbeanNavalVerificationError('artifact-manifest');
  }
  let changed = 0;
  changed += Number(saveBytesIfChanged(docsDirectory, 'metrics.json', metricsBytes, expectedRealDirectory));
  for (const artifact of generation.artifacts) {
    changed += Number(saveBytesIfChanged(docsDirectory, artifact.name, artifact.bytes, expectedRealDirectory));
  }
  return changed;
}

function modePrefix(mode) {
  if (mode === 'semantic-probe') return 'NAVAL_SEMANTIC_PROBE';
  if (mode === 'capture') return 'NAVAL_CAPTURE';
  return 'NAVAL_VERIFY';
}

function validateNavalDocsDestination(root, expectedDocs) {
  const absoluteRoot = path.resolve(root);
  const relative = path.relative(absoluteRoot, expectedDocs);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new CaribbeanNavalVerificationError('destination');
  }
  let current = absoluteRoot;
  for (const component of relative.split(path.sep).filter(Boolean)) {
    current = path.join(current, component);
    const status = fs.lstatSync(current, { throwIfNoEntry: false });
    if (status === undefined) break;
    if (!status.isDirectory() || status.isSymbolicLink()) {
      throw new CaribbeanNavalVerificationError('destination');
    }
  }
  const expectedReal = path.join(fs.realpathSync(absoluteRoot), relative);
  if (fs.existsSync(expectedDocs) && fs.realpathSync(expectedDocs) !== expectedReal) {
    throw new CaribbeanNavalVerificationError('destination');
  }
  return expectedReal;
}

export async function runNavalEvidenceCli({
  mode,
  root,
  docsDirectory,
  tempParent = os.tmpdir(),
  generate,
  removeTempDirectory = (directory) => fs.rmSync(directory, { recursive: true, force: true }),
  writeLine = console.log,
}) {
  if (!['semantic-probe', 'capture', 'verify'].includes(mode)) {
    writeLine('NAVAL_CLI_FAILED mode');
    return 1;
  }
  const prefix = modePrefix(mode);
  let tempDirectory = null;
  let result = 1;
  let line = null;
  try {
    const source = collectCaribbeanNavalSourceManifest(root);
    const operationHead = mode === 'semantic-probe' ? null : head(root);
    const expectedDocs = path.join(path.resolve(root), 'docs', 'screenshots', 'caribbean-naval');
    if (path.resolve(docsDirectory) !== expectedDocs) throw new CaribbeanNavalVerificationError('destination');
    const expectedDocsReal = validateNavalDocsDestination(root, expectedDocs);
    if (mode !== 'semantic-probe' && !cleanTrackedWorktree(root)) throw new CaribbeanNavalVerificationError('dirty-worktree');
    tempDirectory = fs.mkdtempSync(path.join(tempParent, 'caribbean-naval-evidence-'));
    const generation = await generate({
      destination: tempDirectory,
      source,
      captureHead: operationHead,
    });
    if (!generation || generation.verdict?.ok !== true) throw new CaribbeanNavalVerificationError('semantic');
    validateFreshNavalGeneration(generation);
    if (mode !== 'semantic-probe') {
      validateGenerationProvenance(generation, operationHead, source);
      validateRepositoryUnchanged(root, operationHead, source);
    }
    if (mode === 'semantic-probe') {
      let tracked = 'stale';
      try {
        const captured = readNavalGeneration(docsDirectory);
        if (captured !== null) {
          verifySourceManifest(captured.stableManifest, source);
          if (canonicalJson(captured.stableManifest) === canonicalJson(generation.stableManifest)) tracked = 'current';
        }
      } catch {
        tracked = 'stale';
      }
      line = `${prefix}_OK tracked=${tracked}`;
      result = 0;
    } else if (mode === 'capture') {
      validateRepositoryUnchanged(root, operationHead, source);
      const changed = publishGeneration(tempDirectory, docsDirectory, expectedDocsReal, generation);
      line = `${prefix}_OK head=${operationHead} changed=${changed}`;
      result = 0;
    } else {
      const captured = readNavalGeneration(docsDirectory);
      if (captured === null) throw new CaribbeanNavalVerificationError('stale-capture');
      const captureHead = captured.capture?.headCommitAtCapture ?? captured.source?.headCommitAtCapture;
      if (typeof captureHead !== 'string' || !captureHeadIsAncestor(root, captureHead)) {
        throw new CaribbeanNavalVerificationError('stale-capture');
      }
      validateGenerationProvenance(captured, captureHead, source);
      verifySourceManifest(captured.stableManifest, source);
      verifyNavalGeneration(captured, generation);
      validateRepositoryUnchanged(root, operationHead, source);
      line = `${prefix}_OK capture=${captureHead} source=${source.sourceHash} artifacts=${generation.artifacts.length}`;
      result = 0;
    }
  } catch (error) {
    const code = error?.code ?? 'semantic';
    const diagnostic = error instanceof CaribbeanNavalSourceAuditError && error.diagnostic
      ? ` diagnostic=${error.diagnostic}`
      : '';
    line = `${prefix}_FAILED ${code}${diagnostic}`;
    result = 1;
  } finally {
    if (tempDirectory !== null) {
      try {
        removeTempDirectory(tempDirectory);
      } catch {
        line = `${prefix}_FAILED cleanup`;
        result = 1;
      }
    }
  }
  writeLine(line);
  return result;
}
