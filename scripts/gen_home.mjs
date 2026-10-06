// 由 public/index.html 重新生成 functions/home.js
// 用法: node scripts/gen_home.mjs
// 背景: Pages 的静态输出目录若未配对，首页会 404；
//       函数直接从 home.js 伺服首页可完全绕开静态发布问题。
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const html = readFileSync(join(root, 'public/index.html'), 'utf8');
const s = html.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
const out =
  '// 由 public/index.html 生成，勿手改。运行: node scripts/gen_home.mjs\n' +
  'export const HOME_HTML = `\n' + s + '\n`;\n';
writeFileSync(join(root, 'functions/home.js'), out);
console.log('functions/home.js regenerated:', out.length, 'bytes');
