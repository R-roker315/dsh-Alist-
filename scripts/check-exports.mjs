// 静态自检：index.js 的 internals 导出对象里引用的每个标识符，
// 必须在同一文件内有本地定义或从 catalog.js 显式 import。
// 背景：ESM 的 export const obj = { foo } 会在模块加载时立即求值，
// 一旦 foo 既没定义也没 import，整个插件会在加载阶段 ReferenceError 崩溃，
// 而 node --check 只做语法检查、发现不了。
// 用法：node scripts/check-exports.mjs
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = await readFile(resolve(root, "index.js"), "utf8");

const block = source.slice(source.indexOf("export const internals"));
if (!block) {
  console.error("✗ 找不到 export const internals 块");
  process.exit(1);
}

const referenced = [...block.matchAll(/^ {2}(\w+),$/gm)].map((m) => m[1]);

const imported = new Set(
  [...source.matchAll(/import \{([^}]*)\} from/g)].flatMap((m) =>
    m[1].split(",").map((x) => x.trim().split(/\s+as\s+/).pop()).filter(Boolean),
  ),
);
const defaultImported = new Set(
  [...source.matchAll(/import (\w+) from/g)].map((m) => m[1]),
);
const declared = new Set(
  [...source.matchAll(/^(?:export )?(?:const|let|var|function|async function|class) (\w+)/gm)].map(
    (m) => m[1],
  ),
);

const missing = referenced.filter((n) => !imported.has(n) && !defaultImported.has(n) && !declared.has(n));

if (missing.length > 0) {
  console.error(`✗ internals 引用了 ${missing.length} 个未定义/未导入的标识符: ${missing.join(", ")}`);
  console.error("  → 把它们加进顶部 import，或从 internals 里移除；否则插件加载即崩。");
  process.exit(1);
}

console.log(`✓ internals 自检通过：${referenced.length} 个引用全部在作用域内`);
