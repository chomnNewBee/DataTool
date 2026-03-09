/**
 * 游戏数据更新脚本 (基于 TTGoals 数据源)
 * 
 * 用途：
 * 1. 读取 assets/pp.yml 文件中的现有游戏配置数据
 * 2. 读取 all-ttgoals.json 文件中的完整游戏数据库
 * 3. 通过 GameCode (API) 字段建立两个数据源之间的映射关系
 * 4. 更新现有游戏的名称信息（从 TTGoals 数据中获取）
 * 5. 下载游戏图标到本地 assets/mx-icons/ 目录
 *    - 图标 URL: https://upld.linkv2.com/ + DefaultImage 字段
 *    - 如果图标文件已存在则跳过下载
 * 6. 保存更新后的 YAML 配置文件
 * 
 * 数据流程：
 * JSON (all-ttgoals.json) -> Map<GameCode, TTItem> -> 更新现有 YAML -> 下载图标
 * 
 * 作者：GitHub Copilot
 * 日期：2025-09-25 (移除新游戏添加功能)
 */

import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as https from 'https';
import * as http from 'http';
import sharp from 'sharp';

// TypeScript 接口定义
interface TTItem {
    GameCode?: string;
    GameName?: string;
    DefaultImage?: string;
    GameNameEn?: string;
    Categories?: string[];
    Status?: number;
    Vendor?: string;
    Metadata?: string;
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
    existBuyFree?: boolean;
}

interface TTGoalsData {
    Result?: TTItem[];
}

interface YamlData {
    games: YItem[];
}

// 配置
const BASE_IMAGE_URL = 'https://upld.linkv2.com/';
const iconsDir = './assets/mx-icons';

// 确保 mx-icons 目录存在
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

        // 2. 读取 all-ttgoals.json
        console.log('读取 all-ttgoals.json...');
        const jsonContent = fs.readFileSync('./all-ttgoals.json', 'utf8');
        const jsonData = JSON.parse(jsonContent) as TTGoalsData;

        // 3. 遍历 JSON 中的 Result 数组，创建 Map<GameCode, TTItem>
        console.log('创建游戏映射...');
        const gameMap = new Map<string, TTItem>();

        if (jsonData.Result) {
            jsonData.Result.forEach((ttItem: TTItem) => {
                if (ttItem.GameCode) {
                    gameMap.set(ttItem.GameCode, ttItem);
                }
            });
        }

        console.log(`找到 ${gameMap.size} 个游戏`);

        // 4. 遍历现有游戏，准备下载任务
        console.log('处理游戏图标下载...');
        const downloadTasks: Array<{ url: string; path: string; symbol: string }> = [];
        const existingSymbols = new Set<string>();

        for (const yItem of yamlData.games) {
            existingSymbols.add(yItem.symbol);
            if (yItem.symbol && gameMap.has(yItem.symbol)) {
                const ttItem = gameMap.get(yItem.symbol)!;

                console.log(`找到映射: ${yItem.symbol} -> ${ttItem.GameName || ttItem.GameNameEn || 'Unknown'}`);

                // 解析 Metadata 获取中文名
                if (ttItem.Metadata) {
                    try {
                        const metadata = JSON.parse(ttItem.Metadata);
                        if (metadata.GameNameZhCn) {
                            yItem.name = metadata.GameNameZhCn;
                            console.log(`从Metadata获取中文名: ${yItem.symbol} -> ${metadata.GameNameZhCn}`);
                        }
                    } catch (err) {
                        console.log(`解析Metadata失败 ${ttItem.GameCode}: ${err}`);
                    }
                }

                if (!yItem.name_en || yItem.name_en == yItem.symbol) {
                    yItem.name_en = ttItem.GameName || '';
                    if (!yItem.name || yItem.name == yItem.symbol) {
                        yItem.name = ttItem.GameName || '';
                    }
                }

                // 准备图片下载任务
                if (ttItem.DefaultImage) {

                    if (!yItem.bg_image) {
                        yItem.bg_image = `${yItem.symbol}.jpg`;
                    }

                    // 构建下载 URL
                    const imgUrl = BASE_IMAGE_URL + ttItem.DefaultImage;

                    // 构建本地文件路径 (移除 /pp/ 前缀，确保只有一个 .jpg 扩展名)
                    let bgImageName = yItem.bg_image.replace(/^\/pp\//, '');
                    yItem.bg_image = bgImageName; // 更新 bg_image 字段
                    // 移除所有现有扩展名
                    bgImageName = bgImageName.replace(/\.(jpg|jpeg|png|webp|avif)$/i, '');
                    const localPath = path.join(iconsDir, bgImageName + '.jpg');

                    // 如果文件不存在才添加到下载任务
                    if (!fs.existsSync(localPath)) {
                        console.log(`添加下载任务: ${imgUrl} -> ${localPath}`);
                        downloadTasks.push({
                            url: imgUrl,
                            path: localPath,
                            symbol: yItem.symbol
                        });
                    } else {
                        console.log(`跳过已存在: ${localPath}`);
                    }
                }
            } else {
                console.log(`未找到映射: ${yItem.symbol}`);
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

        // 8. 保存更新后的 YAML
        console.log('保存更新后的 YAML...');
        const updatedYaml = yaml.dump(yamlData, {
            indent: 2,
            lineWidth: -1,
            noRefs: true
        });

        fs.writeFileSync('./assets/pp.yml', updatedYaml);

        console.log('---');
        console.log(`处理完成！`);
        console.log(`找到映射: ${gameMap.size} 个游戏`);
        console.log(`下载了 ${downloadCount} 个图片`);

    } catch (error) {
        console.error('处理失败:', error);
        process.exit(1);
    }
}

// 运行脚本
main();