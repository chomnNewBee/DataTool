import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

// 接口定义
interface GameMeta {
    gameId: number;
    name: string;
    name_en: string;
    api: string;
    online?: number;
    check?: boolean;
    url?: string;
    bg_image?: string;
    existBuyFree?: number;
    rtp?: string;
    winMode?: boolean;
    respin?: boolean;
    noFreeLimit?: boolean;
    exist?: boolean;
    gameDirId?:string
}

interface PPConfig {
    games: GameMeta[];
}

async function renamePPDirectories() {
    try {
        // 1. 读取 pp.yml 配置文件
        const yamlPath = path.join(process.cwd(), 'assets', 'pp.yml');
        const yamlContent = await fs.promises.readFile(yamlPath, 'utf-8');
        const config = yaml.load(yamlContent) as PPConfig;

        console.log(`从 pp.yml 读取到 ${config.games.length} 个游戏配置`);

        // 2. 检查 assets/pp 目录
        const ppDir = path.join(process.cwd(), 'assets', 'pp');
        if (!fs.existsSync(ppDir)) {
            console.error('❌ assets/pp 目录不存在');
            return;
        }

        const dirs = await fs.promises.readdir(ppDir);
        const gameDirs = dirs.filter(dir => {
            const dirPath = path.join(ppDir, dir);
            const stat = fs.statSync(dirPath);
            return stat.isDirectory() && /^\d+$/.test(dir);
        });

        console.log(`找到 ${gameDirs.length} 个数字目录需要重命名`);

        // 3. 创建 gameId 到 api 的映射
        const gameIdMgr = new Map<number, string>();
        config.games.forEach(game => {
            gameIdMgr.set(game.gameId, game.api);
        });

        // 4. 执行重命名操作
        let successCount = 0;
        let failedCount = 0;
        const renameLog: Array<{ from: string; to: string; success: boolean; error?: string }> = [];

        for (const dir of gameDirs) {
            const gameId = parseInt(dir, 10);
            const api = gameIdMgr.get(gameId);

            if (!api) {
                console.log(`⚠️  跳过目录 ${dir}: 未找到对应的 API 映射`);
                renameLog.push({ from: dir, to: 'N/A', success: false, error: '未找到API映射' });
                failedCount++;
                continue;
            }

            const oldPath = path.join(ppDir, dir);
            const newPath = path.join(ppDir, api);

            // 检查目标目录是否已存在
            if (fs.existsSync(newPath)) {
                console.log(`⚠️  跳过重命名 ${dir} -> ${api}: 目标目录已存在`);
                renameLog.push({ from: dir, to: api, success: false, error: '目标目录已存在' });
                failedCount++;
                continue;
            }

            try {
                await fs.promises.rename(oldPath, newPath);
                console.log(`✅ 重命名成功: ${dir} -> ${api}`);
                renameLog.push({ from: dir, to: api, success: true });
                successCount++;
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                console.log(`❌ 重命名失败: ${dir} -> ${api} (${errorMsg})`);
                renameLog.push({ from: dir, to: api, success: false, error: errorMsg });
                failedCount++;
            }
        }

        // 5. 生成重命名日志文件
        const logData = {
            timestamp: new Date().toISOString(),
            summary: {
                totalDirs: gameDirs.length,
                successCount,
                failedCount
            },
            details: renameLog
        };

        await fs.promises.writeFile(
            path.join(process.cwd(), 'rename-log.json'),
            JSON.stringify(logData, null, 2),
            'utf-8'
        );

        // 6. 输出最终统计
        console.log('\n=== 重命名完成 ===');
        console.log(`✅ 成功重命名: ${successCount} 个目录`);
        console.log(`❌ 重命名失败: ${failedCount} 个目录`);
        console.log(`📄 详细日志已保存至: rename-log.json`);

        // 7. 显示失败的重命名
        const failed = renameLog.filter(log => !log.success);
        if (failed.length > 0) {
            console.log('\n⚠️  重命名失败的目录:');
            failed.forEach(log => {
                console.log(`   ${log.from} -> ${log.to} (${log.error})`);
            });
        }

        // 8. 检查重命名后的目录结构
        console.log('\n=== 验证重命名结果 ===');
        const newDirs = await fs.promises.readdir(ppDir);
        const apiDirs = newDirs.filter(dir => {
            const dirPath = path.join(ppDir, dir);
            const stat = fs.statSync(dirPath);
            return stat.isDirectory() && !(/^\d+$/.test(dir));
        });

        console.log(`重命名后找到 ${apiDirs.length} 个 API 名称目录`);
        console.log('示例目录:', apiDirs.slice(0, 5).join(', '));

    } catch (error) {
        console.error('重命名过程中发生错误:', error);
    }
}

// 运行脚本
if (require.main === module) {
    console.log('🚀 开始重命名 assets/pp 目录...\n');
    renamePPDirectories().then(() => {
        console.log('\n✨ 重命名脚本执行完毕');
    });
}

export default renamePPDirectories;