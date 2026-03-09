/**
 * 游戏数据更新脚本
 * 
 * 用途：
 * 1. 读取 assets/pp.yml 文件中的游戏配置数据
 * 2. 读取 all-pggame-io.json 文件中的完整游戏数据库
 * 3. 通过 provider_gid (API) 字段建立两个数据源之间的映射关系
 * 4. 将 JSON 数据中的 game_name 更新到 YAML 配置的 name_en 字段
 * 5. 下载 JSON 数据中的游戏图标到本地 assets/mx-icons/ 目录
 * 6. 保存更新后的 YAML 配置文件
 * 
 * 数据流程：
 * JSON (all-pggame-io.json) -> Map<provider_gid, JItem> -> YAML (pp.yml) -> 更新 name_en 字段 + 下载图片
 * 
 * 作者：GitHub Copilot
 * 日期：2025-09-24
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as https from 'https';
import * as http from 'http';
import sharp from 'sharp';

// TypeScript 接口定义
interface JItem {
    provider_gid?: string;
    game_name?: string;
    img_src?: string;
    slug?: string;
}

interface YItem {
    gameId: number;
    name: string;
    name_en: string;
    symbol: string;
    online: number;
    check: boolean;
    url?: string;
    bg_image: string;
    winMode?: boolean;
    respin?: boolean;
    noFreeLimit?: boolean;
    noCheckSum?: boolean;
}

interface JsonData {
    data?: {
        games?: JItem[];
    };
}

interface YamlData {
    games: YItem[];
}

// 确保 mx-icons 目录存在
const iconsDir = './assets/mx-icons';
if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir, { recursive: true });
}

// 下载并转换图片为 JPG 格式
function downloadAndConvertImage(url: string, filepath: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https:') ? https : http;

        protocol.get(url, (response) => {
            if (response.statusCode === 200) {
                const chunks: Buffer[] = [];

                response.on('data', (chunk) => {
                    chunks.push(chunk);
                });

                response.on('end', async () => {
                    try {
                        const buffer = Buffer.concat(chunks);

                        // 使用 sharp 转换为 JPG 格式
                        await sharp(buffer)
                            .jpeg({
                                quality: 90,  // 设置 JPG 质量
                                progressive: true
                            })
                            .toFile(filepath);

                        console.log(`已下载并转换: ${filepath}`);
                        resolve();
                    } catch (err) {
                        fs.unlink(filepath, () => { }); // 删除不完整的文件
                        reject(err);
                    }
                });

                response.on('error', reject);
            } else if (response.statusCode === 302 || response.statusCode === 301) {
                // 处理重定向
                downloadAndConvertImage(response.headers.location!, filepath).then(resolve).catch(reject);
            } else {
                reject(new Error(`HTTP ${response.statusCode}: ${url}`));
            }
        }).on('error', reject);
    });
}

async function main(): Promise<void> {
    try {
        // 1. 读取 assets/pp.yml
        console.log('读取 pp.yml...');
        const yamlContent = fs.readFileSync('./assets/pp.yml', 'utf8');
        const yamlData = yaml.load(yamlContent) as YamlData;

        // 2. 读取 all-pggame-io.json
        console.log('读取 all-pggame-io.json...');
        const jsonContent = fs.readFileSync('./all-pggame-io.json', 'utf8');
        const jsonData = JSON.parse(jsonContent) as JsonData;

        // 3. 遍历 JSON 中的 data.games 数组，创建 Map<provider_gid, item>
        console.log('创建游戏映射...');
        const gameMap = new Map<string, JItem>();

        if (jsonData.data && jsonData.data.games) {
            jsonData.data.games.forEach((jItem: JItem) => {
                if (jItem.provider_gid) {
                    gameMap.set(jItem.provider_gid, jItem);
                }
            });
        }

        console.log(`找到 ${gameMap.size} 个游戏`);

        // 4. 从后往前遍历 YAML 中的 games 数组，准备下载任务
        console.log('处理 YAML 游戏数据...');
        let updatedCount = 0;
        let deletedCount = 0;
        const downloadTasks: Array<{ url: string; path: string; symbol: string }> = [];

        // 从后往前遍历，这样删除元素时不会影响索引
        for (let i = yamlData.games.length - 1; i >= 0; i--) {
            const yItem = yamlData.games[i];
            if (yItem.symbol && gameMap.has(yItem.symbol)) {
                const jItem = gameMap.get(yItem.symbol)!;

                // 更新 name_en 字段
                if (jItem.game_name) {
                    yItem.name_en = jItem.game_name;
                    console.log(`更新 ${yItem.symbol}: ${jItem.game_name}`);
                    updatedCount++;
                }
                
                // 更新 url 字段
                if (jItem.slug) {
                    yItem.url = `https://www.pragmaticplay.com/zh/%E6%B8%B8%E6%88%8F/${jItem.slug}/`;
                    console.log(`更新 URL ${yItem.symbol}: ${yItem.url}`);
                }

                // 准备图片下载任务
                if (jItem.img_src) {
                    // 构建下载 URL (添加 .avif?v=0.4 后缀)
                    const imgUrl = jItem.img_src + '.avif?v=0.4';

                    // 构建本地文件路径 (移除 /pp/ 前缀，确保只有一个 .jpg 扩展名)
                    let bgImageName = yItem.bg_image.replace(/^\/pp\//, '');

                    yItem.bg_image = bgImageName; // 更新 bg_image 字段

                    // 移除所有现有扩展名
                    bgImageName = bgImageName.replace(/\.(jpg|jpeg|png|webp|avif)$/i, '');

                    const localPath = path.join(iconsDir, bgImageName + '.jpg');

                    // 如果文件不存在才添加到下载任务
                    downloadTasks.push({
                        url: imgUrl,
                        path: localPath,
                        symbol: yItem.symbol
                    });
                }
            }
        }

        // 5. 并行下载图片
        console.log(`开始并行下载 ${downloadTasks.length} 个图片...`);
        const maxConcurrent = 10; // 最大并发数
        let downloadCount = 0;

        const downloadWithLimit = async (tasks: typeof downloadTasks) => {
            const results = [];

            for (let i = 0; i < tasks.length; i += maxConcurrent) {
                const batch = tasks.slice(i, i + maxConcurrent);
                const batchPromises = batch.map(async (task) => {
                    try {
                        await downloadAndConvertImage(task.url, task.path);
                        downloadCount++;
                        return { success: true, symbol: task.symbol };
                    } catch (err) {
                        console.error(`下载失败 ${task.symbol}: ${(err as Error).message}`);
                        return { success: false, symbol: task.symbol, error: err };
                    }
                });

                const batchResults = await Promise.allSettled(batchPromises);
                results.push(...batchResults);

                console.log(`批次 ${Math.floor(i / maxConcurrent) + 1} 完成 (${Math.min(i + maxConcurrent, tasks.length)}/${tasks.length})`);
            }

            return results;
        };

        await downloadWithLimit(downloadTasks);

        // 6. 保存更新后的 YAML
        console.log('保存更新后的 YAML...');
        const updatedYaml = yaml.dump(yamlData, {
            indent: 2,
            lineWidth: -1,
            noRefs: true
        });

        fs.writeFileSync('./assets/pp.yml', updatedYaml);

        console.log('---');
        console.log(`处理完成！`);
        console.log(`更新了 ${updatedCount} 个游戏名称`);
        console.log(`删除了 ${deletedCount} 个游戏`);
        console.log(`下载了 ${downloadCount} 个图片`);

    } catch (error) {
        console.error('处理失败:', error);
        process.exit(1);
    }
}

// 运行脚本
main();