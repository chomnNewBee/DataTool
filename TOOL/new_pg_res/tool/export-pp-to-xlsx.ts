import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import * as yaml from 'js-yaml';
import Decimal from 'decimal.js';
import { json } from 'stream/consumers';

interface Game {
    gameId?: number;
    name?: string;
    name_en?: string;
    symbol?: string;
    online?: number;
    check?: boolean;
    use?: boolean;
    url?: string;
    bg_image?: string;
    winMode?: boolean;
    respin?: boolean;
    existBuyFree?: number;
    // 可能存在的其他字段
    platform?: string;
    ourTest?: boolean;
    clientTest?: boolean;
    dataValidation?: boolean;
    maxWinMultiple?: number;
    resourceSize?: string;
    firstTime?: string;
    secondTime?: string;
    rtp?: string;
    designRTP?: string;
    designWinRate?: string;
    exist?: boolean;
    muls?: string;
    id?: string;
}

interface PGData {
    games: Game[];
}

const replaceAry = (str: string) => {
    return str.replace('[', '{').replace(']', '}');
}

async function exportPGToXLSX() {
    try {
        // 读取 pg.yml 文件
        const yamlPath = path.join("D:/work/tools/pg_slot/assets", './', 'pg.yml');

        if (!fs.existsSync(yamlPath)) {
            throw new Error(`找不到文件: ${yamlPath}`);
        }

        const yamlContent = fs.readFileSync(yamlPath, 'utf8');

        const pgData: PGData = yaml.load(yamlContent) as PGData;

        const sort = fs.readFileSync(path.join(__dirname, 'sort.txt'), 'utf-8').split("\n");

        if (!pgData || !pgData.games || !Array.isArray(pgData.games)) {
            throw new Error('YAML文件格式不正确，缺少games数组');
        }

        console.log(`找到 ${pgData.games.length} 个游戏`);

        const map = new Map<string, Game>();

        pgData.games.forEach(game => {
            if (game.symbol) {
                map.set(game.symbol, game);
            }
        });

        const excelData: any[] = sort.map((symbol, index) => {

            symbol = symbol.replace("\r", "").replace("\n", "");

            const game = map.get(symbol);

            if (!game) {
                console.warn(`未找到游戏: ${symbol}`, map.has(symbol));
                return {};
            }

            let mulJson = '';
            let mulJson2 = '';

            let normalBets = ""
            let normalBetsByNum = ""

            let freeBets = ""
            let freeBetsByNum = ""

            if (game.muls) {
                delete game.muls;
            }

            try {
                const yamlPath = path.join(process.cwd(), '../', './', symbol, 'payout-table.yml');
                let mul: any = {
                    default: {},
                    freegame: {}
                };
                let all: any = {};
                const payoutTable = fs.readFileSync(yamlPath, 'utf-8');
                if (payoutTable) {
                    const levels = yaml.load(payoutTable) as { [key: string]: any };
                    for (const levelKey in levels) {
                        const level = levels[levelKey];
                        for (let entry of level) {
                            if (levelKey === 'freegame') {
                                mul.freegame[entry.mul] = (mul.freegame[entry.mul] || 0) + 1;
                            } else {
                                mul.default[entry.mul] = (mul.default[entry.mul] || 0) + 1;
                            }
                            all[entry.mul] = (all[entry.mul] || 0) + 1;
                        };
                    }
                } else {
                    console.log('未找到倍数表文件', yamlPath);
                }
                

           

                let s = Object.keys(mul.default).map(Number)
                normalBets = JSON.stringify(Object.keys(mul.default).map(Number).sort((a, b) => a - b))
                freeBets = JSON.stringify(Object.keys(mul.freegame).map(Number).sort((a, b) => a - b))
                
                normalBetsByNum = JSON.stringify(mul.default, Object.keys(mul.default).sort((a, b) => parseFloat(a) - parseFloat(b)));
                freeBetsByNum = JSON.stringify(mul.freegame, Object.keys(mul.freegame).sort((a, b) => parseFloat(a) - parseFloat(b)));
                let a = 1
                   
            } catch (error) {

            }

            return {
                 '游戏id': game.id || '',
                 '游戏名字': game.name || '',
                 '普通倍数': normalBets || '',
                 '普通倍数数量': normalBetsByNum || '',
                 '免费倍数': freeBets || '',
                 '免费倍数数量': freeBetsByNum || '',
                 '数据提取': "完成" ,
                
            }
        });

        console.log(`整理后共有 ${excelData.filter(item => item && item.SYMBOL).length} 个游戏`, sort.length);

        // // 准备Excel数据
        // const excelData = pgData.games.map((game, index) => {
        //     let muls = '';
        //     if (game.muls) {
        //         try {
        //             const mulsObj = JSON.parse(game.muls);
        //             const ary = Object.keys(mulsObj);
        //             let keys: number[] = [];
        //             ary.forEach((v) => {
        //                 keys.push(new Decimal(v).toNumber());
        //             });
        //             keys = keys.sort((a, b) => a - b);
        //             muls = '{' + keys.map((key) => key.toFixed(2)).join(',') + '}';
        //             game.muls = JSON.stringify(mulsObj, ary.sort((a, b) => parseFloat(a) - parseFloat(b)));
        //         } catch (error) {
        //         }
        //     }

        //     return {
        //         'ID': game.gameId || '',
        //         'SYMBOL': game.symbol || '',
        //         '倍数表': game.muls || '',
        //         '倍数表【策划】': muls,
        //         '游戏名字': game.name || '',
        //         '有购买免费': game.existBuyFree == 1 ? '1' : (game.existBuyFree == 0 ? '无' : '2'),
        //         '英语名': game.name_en || '',
        //         '平台': game.platform || '',
        //         '我方已测': game.ourTest ? '是' : (game.ourTest === false ? '否' : ''),
        //         '甲方已测': game.clientTest ? '是' : (game.clientTest === false ? '否' : ''),
        //         '数值验证': game.dataValidation ? '是' : (game.dataValidation === false ? '否' : ''),
        //         '最大中奖倍数': game.maxWinMultiple || '',
        //         '上线': game.online === 1 ? '即将' : (game.online === 0 ? '否' : ''),
        //         '资源大小': game.resourceSize || '',
        //         '第一次时间': game.firstTime || '',
        //         '第二轮时间': game.secondTime || '',
        //         '官方RTP': game.rtp || '',
        //         '设计RTP': game.designRTP || '',
        //         '设计中奖率': game.designWinRate || '',
        //         // 额外信息字段
        //         'URL': game.url || '',
        //         '已经存在': game.exist ? '是' : '否',
        //         '背景图片': game.bg_image || '',
        //         '检查状态': game.check ? '是' : (game.check === false ? '否' : ''),
        //         '使用状态': game.use ? '是' : (game.use === false ? '否' : ''),
        //         '获胜模式': game.winMode ? '是' : (game.winMode === false ? '否' : ''),
        //         '重新旋转': game.respin ? '是' : (game.respin === false ? '否' : '')
        //     }
        // });

        // 创建工作簿
        const wb = XLSX.utils.book_new();

        // 创建工作表
        const ws = XLSX.utils.json_to_sheet(excelData);

        // 设置列宽
        const columnWidths = [
            { wch: 8 },   // ID
            { wch: 25 },  // 游戏名字
            { wch: 12 },  // 有购买免费
            { wch: 30 },  // 英语名
            { wch: 10 },  // 平台
            { wch: 10 },  // 我方已测
            { wch: 10 },  // 甲方已测
            { wch: 10 },  // 数值验证
            { wch: 15 },  // 最大中奖倍数
            { wch: 8 },   // 上线
            { wch: 12 },  // 资源大小
            { wch: 15 },  // 第一次时间
            { wch: 15 },  // 第二轮时间
            { wch: 12 },  // 官方RTP
            { wch: 12 },  // 设计RTP
            { wch: 12 },  // 设计中奖率
            { wch: 20 },  // API
            { wch: 50 },  // URL
            { wch: 25 },  // 背景图片
            { wch: 10 },  // 检查状态
            { wch: 10 },  // 使用状态
            { wch: 10 },  // 获胜模式
            { wch: 10 }   // 重新旋转
        ];

        ws['!cols'] = columnWidths;

        // 添加工作表到工作簿
        XLSX.utils.book_append_sheet(wb, ws, 'PG游戏列表');

        // 生成文件名（包含时间戳）
        const outputPath = path.join(__dirname, `pg-games-export.xlsx`);

        // 写入Excel文件
        XLSX.writeFile(wb, outputPath);

        console.log('✅ Excel文件已成功生成！');
        console.log(`📄 文件路径: ${outputPath}`);
        console.log(`📊 共导出 ${excelData.length} 个游戏`);

        // 显示统计信息
        const stats = {
            hasExistBuyFree: excelData.filter(row => row['有购买免费']).length,
            isOnline: excelData.filter(row => row['上线'] === '是').length,
            hasWinMode: excelData.filter(row => row['获胜模式'] === '是').length,
            hasRespin: excelData.filter(row => row['重新旋转'] === '是').length
        };

        console.log('\n📈 统计信息:');
        console.log(`- 有购买免费功能: ${stats.hasExistBuyFree} 个`);
        console.log(`- 已上线: ${stats.isOnline} 个`);
        console.log(`- 有获胜模式: ${stats.hasWinMode} 个`);
        console.log(`- 有重新旋转: ${stats.hasRespin} 个`);

    } catch (error) {
        console.error('❌ 导出失败:', error instanceof Error ? error.message : String(error));
        process.exit(1);
    }
}

// 如果直接运行此脚本
if (require.main === module) {
    exportPGToXLSX();
}

export default exportPGToXLSX;