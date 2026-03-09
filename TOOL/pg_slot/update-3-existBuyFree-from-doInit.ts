import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

interface Game {
	gameId?: number;
	name?: string;
	name_en?: string;
	symbol: string;
	online?: number;
	check?: boolean;
	use?: boolean;
	url?: string;
	bg_image?: string;
	winMode?: boolean;
	respin?: boolean;
	existBuyFree?: number;
	rtp?: string;
	// 其他可能字段
	[key: string]: any;
}

interface PPData {
	games: Game[];
}

/**
 * 分析 doInit 文件内容，获取 purInit_e 参数
 * @param content doInit 文件内容
 * @returns purInit_e 的值，如果不存在则返回 null
 */
function parsePurInitE(content: string): string | null {
	// 查找 purInit_e= 参数
	const match = content.match(/purInit_e=([^&]*)/);
	return match ? match[1] : null;
}

/**
 * 分析 doInit 文件内容，获取 RTP 值
 * @param content doInit 文件内容
 * @returns RTP 值，如果不存在则返回 null
 */
function parseRTP(content: string, symbol: string): string | null {

	// 提取嵌套的 rtp 值
	const rtpMatch = content.match(/rtp=(.*?)[&,]/);

	if (rtpMatch) {
		return rtpMatch[1];
	}

	// 尝试 purchase
	const purchaseMatch = content.match(/purchase:"([^"]+)"/);
	if (purchaseMatch) {
		return purchaseMatch[1];
	}

	// 提取 regular RTP 值
	const regularMatch = content.match(/regular:"([^"]+)"/);
	if (regularMatch) {
		return regularMatch[1];
	}

	// 如果没有 regular，尝试提取 ante 值
	const anteMatch = content.match(/ante:"([^"]+)"/);
	if (anteMatch) {
		return anteMatch[1];
	}

	return null;
}

/**
 * 根据 purInit_e 的值确定 existBuyFree 的值
 * @param purInitE purInit_e 参数值
 * @returns existBuyFree 的值 (0, 1, 2)
 */
function determineExistBuyFree(purInitE: string | null): number {
	if (!purInitE) {
		return 0;
	}

	// 如果 purInit_e = 1，existBuyFree = 1
	if (purInitE === '1') {
		return 1;
	}

	// 如果 purInit_e = 1,1，existBuyFree = 2
	if (purInitE === '1,1') {
		return 2;
	}

	// 其他情况 existBuyFree = 0
	return 0;
}

interface GameAnalysisResult {
	existBuyFree: number;
	rtp: string | null;
}

/**
 * 分析单个游戏的 doInit 文件
 * @param symbol 游戏symbol
 * @returns 包含 existBuyFree 和 RTP 的分析结果
 */
async function analyzeGameDoInit(symbol: string): Promise<GameAnalysisResult> {
	try {
		const doInitPath = path.join(__dirname, 'assets', 'pp', symbol, 'doInit.txt');

		// 检查文件是否存在
		if (!fs.existsSync(doInitPath)) {
			console.log(`⚠️  游戏 ${symbol}: doInit.txt 文件不存在`);
			return { existBuyFree: 0, rtp: null };
		}

		// 读取文件内容
		const content = fs.readFileSync(doInitPath, 'utf8');

		// 解析 RTP 值
		const rtp = parseRTP(content, symbol);

		// 确定 existBuyFree 值
		let existBuyFree

		if (content.includes("fspps") || content.includes("fspps_mask")) {
			existBuyFree = 1;
		} else {
			// 解析 purInit_e 参数
			const purInitE = parsePurInitE(content);
			existBuyFree = determineExistBuyFree(purInitE);
		}

		return { existBuyFree, rtp };

	} catch (error) {
		console.error(`❌ 分析游戏 ${symbol} 时出错:`, error instanceof Error ? error.message : String(error));
		return { existBuyFree: 0, rtp: null };
	}
}

/**
 * 主函数：更新 pp.yml 中所有游戏的 existBuyFree 字段
 */
async function updateExistBuyFreeFromDoInit() {
	try {
		// 读取 pp.yml 文件
		const yamlPath = path.join(__dirname, 'assets', 'pp.yml');

		if (!fs.existsSync(yamlPath)) {
			throw new Error(`找不到文件: ${yamlPath}`);
		}

		console.log('📂 读取 pp.yml 文件...');
		const yamlContent = fs.readFileSync(yamlPath, 'utf8');
		const ppData: PPData = yaml.load(yamlContent) as PPData;

		if (!ppData || !ppData.games || !Array.isArray(ppData.games)) {
			throw new Error('YAML文件格式不正确，缺少games数组');
		}

		console.log(`🎮 找到 ${ppData.games.length} 个游戏，开始分析 doInit 文件...`);

		let updatedCount = 0;
		let totalCount = 0;
		let missingDoInitCount = 0;

		// 遍历所有游戏
		for (const game of ppData.games) {
			totalCount++;

			// 检查 doInit 文件是否存在
			const doInitPath = path.join(__dirname, 'assets', 'pp', game.symbol, 'doInit.txt');
			if (!fs.existsSync(doInitPath)) {
				missingDoInitCount++;
			}

			// 分析 doInit 文件
			const analysisResult = await analyzeGameDoInit(game.symbol);

			// 更新游戏的 existBuyFree 字段
			const oldExistBuyFree = game.existBuyFree;
			const oldRtp = game.rtp;

			game.existBuyFree = analysisResult.existBuyFree;
			if (analysisResult.rtp) {
				game.rtp = analysisResult.rtp;
			}

			if (!game.rtp) {
				console.log(game.symbol, '没有找到 RTP');
			}

			// 检查是否有更新
			let hasUpdates = false;
			if (oldExistBuyFree !== analysisResult.existBuyFree) {
				hasUpdates = true;
			}
			if (analysisResult.rtp && oldRtp !== analysisResult.rtp) {
				hasUpdates = true;
			}

			if (hasUpdates) {
				updatedCount++;
				const rtpInfo = analysisResult.rtp ? `, RTP: ${oldRtp || '无'} → ${analysisResult.rtp}` : '';
				console.log(`🔄 游戏 ${game.symbol} (${game.name || 'Unknown'}): existBuyFree: ${oldExistBuyFree} → ${analysisResult.existBuyFree}${rtpInfo}`);
			}
		}

		// 保存更新后的 YAML 文件
		const updatedYaml = yaml.dump(ppData, {
			indent: 2,
			lineWidth: -1,
			noRefs: true
		});

		// 备份原文件
		const backupPath = `${yamlPath}.backup.${Date.now()}`;
		fs.copyFileSync(yamlPath, backupPath);
		console.log(`📋 创建备份文件: ${backupPath}`);

		// 写入更新后的文件
		fs.writeFileSync(yamlPath, updatedYaml, 'utf8');

		console.log('\n✅ 更新完成！');
		console.log(`📊 统计信息:`);
		console.log(`  - 总游戏数: ${totalCount}`);
		console.log(`  - 更新数量: ${updatedCount}`);
		console.log(`  - 缺少doInit文件: ${missingDoInitCount} 个`);
		// console.log(`  - 备份文件: ${path.basename(backupPath)}`);

		// 显示 existBuyFree 分布统计
		const stats = {
			noBuyFree: ppData.games.filter(g => g.existBuyFree === 0).length,
			hasBuyFree: ppData.games.filter(g => g.existBuyFree === 1).length,
			hasAdvancedBuyFree: ppData.games.filter(g => g.existBuyFree === 2).length
		};

		console.log(`\n📈 existBuyFree 分布:`);
		console.log(`  - 无购买免费 (0): ${stats.noBuyFree} 个`);
		console.log(`  - 有购买免费 (1): ${stats.hasBuyFree} 个`);
		console.log(`  - 高级购买免费 (2): ${stats.hasAdvancedBuyFree} 个`);

		console.log(`\n📁 doInit 文件统计:`);
		console.log(`  - 存在doInit文件: ${totalCount - missingDoInitCount} 个`);
		console.log(`  - 缺少doInit文件: ${missingDoInitCount} 个`);

		// RTP 统计
		const rtpStats = {
			hasRtp: ppData.games.filter(g => g.rtp).length,
			noRtp: ppData.games.filter(g => !g.rtp).length
		};

		console.log(`\n📊 RTP 统计:`);
		console.log(`  - 有RTP值: ${rtpStats.hasRtp} 个`);
		console.log(`  - 无RTP值: ${rtpStats.noRtp} 个`);

		// 显示一些 RTP 值的示例
		const rtpExamples = ppData.games
			.filter(g => g.rtp)
			.slice(0, 5)
			.map(g => `${g.symbol}(${g.name}): ${g.rtp}`)
			.join(', ');

		if (rtpExamples) {
			console.log(`\n🔍 RTP 示例: ${rtpExamples}`);
		}

	} catch (error) {
		console.error('❌ 更新失败:', error instanceof Error ? error.message : String(error));
		process.exit(1);
	}
}

// 如果直接运行此脚本
if (require.main === module) {
	updateExistBuyFreeFromDoInit();
}

export default updateExistBuyFreeFromDoInit;