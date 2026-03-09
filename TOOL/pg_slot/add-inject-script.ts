import { promises as fs } from 'fs';
import * as path from 'path';

// 配置
const ROOT = path.resolve(__dirname, 'assets', 'pp');
const TARGET_SNIPPET = '<script type="text/javascript" src="../inject_pp.js"></script>';
const INJECT_REGEX = /<script[^>]+src=["']\.\.\/inject_pp\.js["'][^>]*><\/script>/i;

interface ResultItem { 
  file: string; 
  action: 'skipped' | 'inserted' | 'error'; 
  message?: string 
}

async function processFile(filePath: string): Promise<ResultItem> {
  try {
    let content = await fs.readFile(filePath, 'utf8');

    // 检测是否已存在（任意形式的 inject_pp.js 脚本标签）
    if (INJECT_REGEX.test(content)) {
      return { file: filePath, action: 'skipped', message: 'already present' };
    }

    // 寻找 <head> 开始标签
    const headOpenMatch = content.match(/<head[^>]*>/i);
    let updated: string;
    
    if (headOpenMatch) {
      // 在 <head> 开始标签后面直接插入
      const idx = headOpenMatch.index! + headOpenMatch[0].length;
      updated = content.slice(0, idx) + '\n    ' + TARGET_SNIPPET + content.slice(idx);
    } else if (content.includes('</head>')) {
      // 兜底：找到 </head> 则在其前面插入
      updated = content.replace('</head>', `    ${TARGET_SNIPPET}\n</head>`);
    } else if (content.includes('</body>')) {
      // 再兜底：在 </body> 前插入
      updated = content.replace('</body>', `    ${TARGET_SNIPPET}\n</body>`);
    } else {
      // 最后兜底：追加到文件末尾
      updated = content + '\n' + TARGET_SNIPPET + '\n';
    }

    await fs.writeFile(filePath, updated, 'utf8');
    return { file: filePath, action: 'inserted' };
  } catch (e: any) {
    return { file: filePath, action: 'error', message: e.message };
  }
}

async function walk(dir: string, acc: string[] = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walk(full, acc);
    } else if (entry.isFile() && entry.name === 'index.html') {
      acc.push(full);
    }
  }
  return acc;
}

(async () => {
  console.time('add-inject-script');
  const indexFiles = await walk(ROOT);
  console.log(`Found ${indexFiles.length} index.html files`);
  
  const results = await Promise.all(indexFiles.map(f => processFile(f)));
  const summary = results.reduce((acc, r) => {
    acc[r.action] = (acc[r.action] || 0) + 1; 
    return acc;
  }, {} as Record<string, number>);

  console.table(results.map(r => ({ 
    file: path.relative(ROOT, r.file), 
    action: r.action, 
    message: r.message || '' 
  })));
  
  console.log('\nSummary:', summary);
  console.timeEnd('add-inject-script');
})();
