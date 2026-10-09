// Builds the single-file Claude page (artifact/dist/ekfba.html) from artifact/page.html,
// inlining the tested core modules from src/core so the page runs exactly the code the tests cover.
// Each module is wrapped in its own scope; imports become reads from earlier modules.
// Run: node tools/build-artifact.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const MODULES = ['ids', 'money', 'sensitive', 'schema', 'card', 'backup', 'rulepack', 'feedates', 'purchases', 'merchants', 'recommend', '../ui/html'];

function bundleModule(name) {
  const file = join(root, 'src/core', name + '.js');
  let src = readFileSync(file, 'utf8');
  const varName = '__m_' + name.replace(/[^a-z]/gi, '');
  const exportsList = [];
  src = src.replace(/^import\s*\{([^}]+)\}\s*from\s*'\.\.?\/(?:core\/|ui\/)?([\w-]+)\.js';\s*$/gm, (_, names, mod) => {
    const target = '__m_' + mod.replace(/[^a-z]/gi, '');
    return `const {${names}} = ${target};`;
  });
  src = src.replace(/^export\s+(async\s+function|function|const|let|class)\s+([A-Za-z_$][\w$]*)/gm, (_, kw, id) => {
    exportsList.push(id);
    return `${kw} ${id}`;
  });
  if (/^\s*(import|export)\b/m.test(src)) throw new Error(`Unhandled import/export in ${name}.js`);
  return `const ${varName} = (() => {\n${src}\nreturn { ${exportsList.join(', ')} };\n})();\n`;
}

const core = MODULES.map(bundleModule).join('\n')
  + `const __core = Object.assign({}, ${MODULES.map((m) => '__m_' + m.replace(/[^a-z]/gi, '')).join(', ')});\n`;
const page = readFileSync(join(root, 'artifact/page.html'), 'utf8');
if (!page.includes('/*@@CORE@@*/')) throw new Error('page.html is missing the /*@@CORE@@*/ marker');
mkdirSync(join(root, 'artifact/dist'), { recursive: true });
const out = page.replace('/*@@CORE@@*/', () => core);
writeFileSync(join(root, 'artifact/dist/ekfba.html'), out);
console.log(`artifact/dist/ekfba.html written (${Math.round(out.length / 1024)} KB)`);
