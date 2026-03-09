#!/usr/bin/env ts-node
// capture.ts
// 采集逻辑说明：
// 1. 回合切割：累积面板直到 endCondition() 返回 true 后判定一局结束，若需要则 doCollect。
// 2. 免费分类：自然触发免费与购买普通免费统一归入 freegame；购买超级免费归入 freegame_sup。
// 3. 分桶倍数：zero / x1_10 / x11_20 / x21_30 / over_30 （>20 及免费桶不决定完成条件）。
// 4. 购买优先：若支持购买，优先填满 freegame (普通购买) 然后 freegame_sup，再收集自然局。
// 5. 完成条件：仅考察 zero, x1_10, x11_20 三个桶达到 limit；其它桶无限制只做截断，或受 --collect 增量目标控制。
// 6. CLI 参数：
//    --symbol=xxx           指定单一游戏；缺省时按 pp.yml 顺序遍历全部游戏。
//    --sleep=ms             每次 spin 之间的休眠毫秒。
//    --limit_<bucket>=n     为各桶设置上限（达到后不再入库）。
//    --collect=freegame:10,x1_10:5  追加采集指定桶数量（在已有基础上再采集 n 条，忽略 limit 截断逻辑对该桶的禁止条件，直到增量完成）。
// 使用 --collect 时优先满足增量目标，其次是完成条件；若两者都满足则结束该游戏采集。

import fetch from 'node-fetch';
import path from 'path';
import crypto from 'crypto';
import Decimal from 'decimal.js';
import fs from 'fs';
const yaml = require('js-yaml');

interface GameMeta { name: string; name_en: string; api?: string; symbol?: string; online: number; check: boolean; url?: string; }
interface PPConfig { games: GameMeta[]; }
const PP_YML = path.resolve(process.cwd(), 'assets', 'pp.yml');
async function loadPPConfig(): Promise<PPConfig> { try { if (!fs.existsSync(PP_YML)) return { games: [] }; return (yaml.load(await fs.promises.readFile(PP_YML, 'utf-8')) as PPConfig) || { games: [] }; } catch { return { games: [] }; } }
async function savePPConfig(cfg: PPConfig) { const dumped = yaml.dump(cfg, { lineWidth: 120 }); await fs.promises.writeFile(PP_YML, dumped, 'utf-8'); }
// gameId 已废弃，使用 symbol 作为唯一键；保留函数位置但移除实现。
// function nextGameId(cfg: PPConfig): number { return 0; }

// openGame 与 gameService 使用不同基址，避免在发现 gameService 路径后破坏后续 openGame.do
const OPEN_BASE = 'https://demogamesfree-asia.pragmaticplay.net/gs2c';
let GAME_BASE = OPEN_BASE; // 运行中若在 HTML 中解析到 /ge/.../gameService 会更新此值
// HTTP logging wrapper
interface HttpLogOptions { method: string; url: string; body?: string; }
let HTTP_LOG_FILE: string | null = null; // http.log
let GS_LOG_FILE: string | null = null;   // gameservice.log
let ERR_LOG_FILE: string | null = null;  // error.log 记录异常与重启细节
let DEBUG_ERRORS = false; // 是否输出完整 raw 到 error.log（通过 --debug_errors=1 开启）
let DEBUG_PURCHASE = false; // 是否输出购买调试 (--debug_purchase=1)
async function httpRequest(opts: HttpLogOptions) {
    const { method, url, body } = opts;
    const start = Date.now();
    let status: number | undefined; let text: string = '';
    try {
        const resp = await fetch(url, { method, headers: body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : undefined, body });
        status = resp.status;
        text = await resp.text();
        const ms = Date.now() - start;
        if (HTTP_LOG_FILE) {
            try {
                const headerLine = `[${new Date().toISOString()}] ${method} status=${status} ms=${ms} bodyLen=${body ? body.length : 0} respLen=${text.length}`;
                const urlLine = `URL: ${url}`;
                const bodyLine = body ? `BODY: ${body}` : 'BODY: <empty>';
                const respLine = `RESPONSE: ${text}`;
                fs.appendFileSync(HTTP_LOG_FILE, headerLine + '\n' + urlLine + '\n' + bodyLine + '\n' + respLine + '\n\n', 'utf-8');
            } catch { }
        }
        return { status, text, headers: resp.headers };
    } catch (e: any) {
        const ms = Date.now() - start;
        if (HTTP_LOG_FILE) {
            try {
                const headerLine = `[${new Date().toISOString()}] ${method} ERROR ms=${ms}`;
                const urlLine = `URL: ${url}`;
                const bodyLine = body ? `BODY: ${body}` : 'BODY: <empty>';
                const errLine = `ERROR: ${(e?.message || String(e)).replace(/\s+/g, ' ')}`;
                fs.appendFileSync(HTTP_LOG_FILE, headerLine + '\n' + urlLine + '\n' + bodyLine + '\n' + errLine + '\n\n', 'utf-8');
            } catch { }
        }
        throw e;
    }
}
const CVERSION = 345780;
const WEBSITE_URL = 'https://demogamesfree.pragmaticplay.net';
const JURISDICTION = 99;
const LOBBY_URL = 'https://www.pragmaticplay.com/en/';
const LANG = 'en';
const CUR = 'USDT';

// 桶重新定义：free_default 合并入 freegame；free_super 更名 freegame_sup
// 采集仍区分 >20 倍的结果但完成条件不再要求这些桶 & 不要求免费桶达标。
type BucketKey = 'freegame' | 'freegame_sup' | 'zero' | 'x1_10' | 'x11_20' | 'x21_30' | 'over_30';
const DEFAULT_LIMIT: Record<BucketKey, number> = {
    freegame: 12,        // 统一自然免费 + 购买普通免费
    freegame_sup: 8,     // 购买超级免费
    zero: 150,
    x1_10: 80,
    x11_20: 30,
    x21_30: 20,
    over_30: 15,
};

function parseArgs(argv: string[]): Record<string, string> {
    const r: Record<string, string> = {};
    for (const a of argv) {
        if (!a.startsWith('--')) continue;
        const [k, v] = a.slice(2).split('=');
        r[k] = v || '';
    }
    return r;
}

function appendErrorLog(lines: string[]) {
    if (!ERR_LOG_FILE) return;
    try { fs.appendFileSync(ERR_LOG_FILE, lines.join('\n') + '\n', 'utf-8'); } catch { }
}

function parseParams(res?: string) { const result: Record<string, string> = {}; if (!res) return result; for (const pair of res.split('&')) { if (!pair) continue; const [key, value] = pair.split('=').map(decodeURIComponent); if (key) result[key] = value || ''; } return result; }
function sha1Hex(s: string): string { return crypto.createHash('sha1').update(s).digest('hex'); }
function crc32Hex(str: string): string { let crc = 0 ^ -1; const buf = Buffer.from(str, 'utf8'); for (let i = 0; i < buf.length; i++) { let x = (crc ^ buf[i]) & 0xff; for (let k = 0; k < 8; k++) x = x & 1 ? 0xedb88320 ^ (x >>> 1) : x >>> 1; crc = (crc >>> 8) ^ x; } return ((crc ^ -1) >>> 0).toString(16).padStart(8, '0'); }
function makeDeterministicName(raw: string): string { return `${sha1Hex(raw).slice(0, 6)}${crc32Hex(raw)}.json`; }
async function ensureDir(d: string) { await fs.promises.mkdir(d, { recursive: true }).catch(() => { }); }
function toDec(v: any): Decimal { if (v == null) return new Decimal(0); return new Decimal(String(v).replace(/,/g, '')); }
function toNum(v: any): number { if (v == null) return 0; return Number(String(v).replace(/,/g, '')) || 0; }

// 购买支持检测：解析 doInit 中 purInit / purInit_e
interface PurchaseModeEntry { type: 'default' | 'super'; bet: number; raw: string; }
interface PurchaseModes { default?: boolean; super?: boolean; entries?: PurchaseModeEntry[]; }
// 已合并 init-log.ts 内容到本文件，取消外部依赖。
// 购买模式与初始化日志相关类型与函数
interface InitLogOptions {
    initText: string;   // 原始 doInit 响应文本
    c: string;          // 单线 coin (c)
    l: string;          // 线数 (l)
    purchase: PurchaseModes; // 购买支持与条目
    prefix?: string;    // 前缀（用于重启会话日志）
}

// 比例计算：与 generateInitLog 使用同一逻辑抽取 anteRatio / defaultPurchaseRatio / superPurchaseRatio
interface InitDerivedContext {
    coinVal: number;
    baseLines: number;
    anteLines: number | null;
    internalBaseBet: number;
    scale: number;
    displayBaseBet: number;
    displayAnteBet: number | null;
    detailedPurchase: { default: number[]; super: number[] } | null;
    anteRatio: number | null;
    defaultPurchaseRatio: number | null;
    superPurchaseRatio: number | null;
}

function buildInitContext(initText: string, c: string, l: string, purchase: PurchaseModes): InitDerivedContext {
    const coinVal = Number(c);
    const blsRawMatch = initText.match(/bls=([^&]+)/);
    const blsRaw = blsRawMatch ? blsRawMatch[1] : '';
    const lineChoices = blsRaw ? blsRaw.split(',').map(v => Number(v)) : [Number(l)];
    const baseLines = lineChoices[0] || Number(l);
    const anteLines = lineChoices.length > 1 ? lineChoices[1] : null;
    const internalBaseBet = coinVal * baseLines;
    const scale = internalBaseBet !== 0 ? 2 / internalBaseBet : 1;
    const displayBaseBet = internalBaseBet * scale;
    const internalAnteBet = anteLines ? coinVal * anteLines : null;
    const displayAnteBet = internalAnteBet != null ? internalAnteBet * scale : null;
    const detailedPurchase = purchase.entries && purchase.entries.length
        ? purchase.entries.reduce((acc: { default: number[]; super: number[] }, e) => {
            const v = e.bet / 100; // 展示价格
            if (e.type === 'default') acc.default.push(v); else if (e.type === 'super') acc.super.push(v);
            return acc;
        }, { default: [], super: [] })
        : null;
    const anteRatio = (anteLines && baseLines) ? (anteLines / baseLines) : null;
    const defaultFirst = detailedPurchase?.default?.[0] ?? null;
    const superFirst = detailedPurchase?.super?.[0] ?? null;
    const defaultPurchaseRatio = (defaultFirst != null && displayBaseBet) ? (defaultFirst / displayBaseBet) : null;
    const superPurchaseRatio = (superFirst != null && displayBaseBet) ? (superFirst / displayBaseBet) : null;
    return { coinVal, baseLines, anteLines, internalBaseBet, scale, displayBaseBet, displayAnteBet, detailedPurchase, anteRatio, defaultPurchaseRatio, superPurchaseRatio };
}

interface RatioValues {
    anteRatio: number | null;
    defaultPurchaseRatio: number | null;
    superPurchaseRatio: number | null;
}

function buildInitContextWithRatios(initText: string, c: string, l: string, purchase: PurchaseModes): { ctx: InitDerivedContext; ratios: RatioValues } {
    const ctx = buildInitContext(initText, c, l, purchase);
    const to2 = (v: number | null) => v == null ? null : Number(new Decimal(v).toDecimalPlaces(2).toString());
    const ratios: RatioValues = {
        anteRatio: to2(ctx.anteRatio),
        defaultPurchaseRatio: to2(ctx.defaultPurchaseRatio),
        superPurchaseRatio: to2(ctx.superPurchaseRatio),
    };
    return { ctx, ratios };
}

// 生成初始化/重启日志：
// 1. 默认下注 / 加注下注（若存在 ante 线数）
// 2. 中文购买支持行：免费游戏购买支持 默认:XX, 超级:YY（价格 bet/100，缺失用 -）或 无购买免费支持
// 3. 比例行：加注比例 / 普通购买首价比例 / 超级购买首价比例
function generateInitLog(opts: InitLogOptions & { prebuilt?: { ctx: InitDerivedContext; ratios: RatioValues } }): string[] {
    const { initText, c, l, purchase, prefix, prebuilt } = opts;
    const built = prebuilt || buildInitContextWithRatios(initText, c, l, purchase);
    const { ctx, ratios } = built;
    const fmtBet = (n: number | null | undefined) => {
        if (n == null) return '-';
        const v = Number(n.toFixed(10));
        return v % 1 === 0 ? v.toFixed(0) : v.toString();
    };
    const detailedStrings = purchase.entries && purchase.entries.length
        ? purchase.entries.reduce((acc: { default: string[]; super: string[] }, e) => {
            const v = (e.bet / 100).toString();
            if (e.type === 'default') acc.default.push(v); else if (e.type === 'super') acc.super.push(v);
            return acc;
        }, { default: [], super: [] })
        : null;
    const purchaseLine = (purchase.default || purchase.super)
        ? '免费游戏购买支持 ' + [
            purchase.default ? `默认:${(detailedStrings?.default[0] || '-')}` : '',
            purchase.super ? `超级:${(detailedStrings?.super[0] || '-')}` : ''
        ].filter(Boolean).join(', ')
        : '无购买免费支持';
    const mainLine = `${prefix ? prefix + ' ' : ''}默认下注:${fmtBet(ctx.displayBaseBet)}${ctx.displayAnteBet != null ? ' 加注下注:' + fmtBet(ctx.displayAnteBet) : ''} ${purchaseLine}`;
    const ratioLines: string[] = [];
    if (ratios.anteRatio != null) ratioLines.push(`加注比例:${ratios.anteRatio}`);
    if (ratios.defaultPurchaseRatio != null) ratioLines.push(`普通购买首价比例:${ratios.defaultPurchaseRatio}`);
    if (ratios.superPurchaseRatio != null) ratioLines.push(`超级购买首价比例:${ratios.superPurchaseRatio}`);
    return [mainLine, ...ratioLines];
}

function extractMgckey(url: string): string | null {
    try {
        if (!url) return null;
        const qIndex = url.indexOf('?');
        const search = qIndex >= 0 ? url.slice(qIndex + 1) : url;
        const usp = new URLSearchParams(search);
        const val = usp.get('mgckey');
        return val ? decodeURIComponent(val) : null;
    } catch { return null; }
}

async function getToken(symbol: string, retry = 3, backoffMs = 500): Promise<string> {
    let lastErr: any;
    for (let attempt = 1; attempt <= retry; attempt++) {
        try {
            const openUrl = `${OPEN_BASE}/openGame.do?gameSymbol=${symbol}&websiteUrl=${WEBSITE_URL}&jurisdiction=${JURISDICTION}&lobby_url=${LOBBY_URL}&lang=${LANG}&cur=${CUR}`;
            const openResp = await fetch(openUrl, { redirect: 'manual' });
            const location = openResp.headers.get('location') || openResp.headers.get('Location') || '';
            console.log(`[HTTP] GET openGame.do status=${openResp.status} locationLen=${location.length}`);
            const mgckey = extractMgckey(location || '');
            if (!mgckey) throw new Error('mgckey not found');
            if (location) {
                try {
                    const htmlResp = await fetch(location, { redirect: 'manual' });
                    const html = await htmlResp.text();
                    console.log(`[HTTP] GET game html status=${htmlResp.status} len=${html.length}`);
                    const apiMatch = html.match(/https?:\/\/[^"']+\/ge\/(v\d+)?\/gameService/);
                    if (apiMatch) {
                        GAME_BASE = apiMatch[0];
                        // 解析成功后打印一次以便调试
                        console.log('解析到 gameService 基址:', GAME_BASE);
                    }
                } catch { /* ignore html parse */ }
            }
            if (attempt > 1) console.log(`getToken 重试成功 attempt=${attempt}`);
            return mgckey;
        } catch (e) {
            lastErr = e;
            console.warn(`getToken 失败 attempt=${attempt} error=${(e as any)?.message || e}`);
            if (attempt < retry) await new Promise(r => setTimeout(r, backoffMs * attempt));
        }
    }
    throw lastErr || new Error('mgckey not found after retries');
}

async function doInit(symbol: string, mgckey: string): Promise<{ text: string; c: string; l: string; purchase: PurchaseModes; }> {
    const data = new URLSearchParams({ action: 'doInit', symbol, cver: CVERSION.toString(), index: '1', counter: '1', repeat: '0', mgckey });
    const http = await httpRequest({ method: 'POST', url: GAME_BASE, body: data.toString() });
    const text = http.text;
    appendGameServiceLog('doInit', text);
    const params = parseParams(text);
    const c = params.defc || params.c || '0.2';
    const l = params.l || '20';
    const purchase: PurchaseModes = {};
    if (DEBUG_PURCHASE) {
        console.log('[doInit-purchase-raw] purInit_e=', params.purInit_e || '<none>', 'purInit.len=', (params.purInit || '').length);
    }
    if (params.purInit || params.purInit_e) {
        const content = params.purInit || '';
        // purInit_e=1,1 结构：第一个值表示 default 支持，第二个表示 super 支持
        if (params.purInit_e) {
            const flags = params.purInit_e.split(',').map(s => s.trim());
            if (flags[0] === '1') purchase.default = true;
            if (flags[1] === '1') purchase.super = true;
        }
        // 兼容旧方式：content 内的 type 字符串
        if (/type:"default"/.test(content)) purchase.default = true;
        if (/type:"super"/.test(content)) purchase.super = true;
        // 如果两者都未解析到但存在 purInit/purInit_e 则默认支持 default
        if (!purchase.default && !purchase.super) purchase.default = true;
        // 解析形如 purInit=[{bet:2000,type:"default"},{bet:10000,type:"default"}]
        const entries: PurchaseModeEntry[] = [];
        const arrMatch = content.match(/\[(.*)\]/);
        if (arrMatch) {
            const inner = arrMatch[1];
            // 拆分对象：用 '},{' 分割
            const objParts = inner.split(/\},\{/).map((part, idx) => {
                if (!part.startsWith('{')) part = '{' + part;
                if (!part.endsWith('}')) part = part + '}';
                return part;
            });
            for (const obj of objParts) {
                const betMatch = obj.match(/bet:(\d+)/);
                const typeMatch = obj.match(/type:"(default|super)"/);
                if (betMatch && typeMatch) {
                    entries.push({ bet: Number(betMatch[1]), type: typeMatch[1] as any, raw: obj });
                }
            }
            if (entries.length) purchase.entries = entries;
        }
        if (DEBUG_PURCHASE) console.log('[doInit-purchase-parsed]', purchase);
    }
    return { text, c, l, purchase };
}

async function doSpin(symbol: string, mgckey: string, opt: { c: string; l: string; index: number; counter: number; pur?: string; sInfo?: string; }): Promise<any> {
    const baseParams: Record<string,string> = { action: 'doSpin', symbol, c: opt.c, l: opt.l, sInfo: opt.sInfo || 't', bl: '0', index: String(opt.index), counter: String(opt.counter), repeat: '0', mgckey };
    if (opt.pur !== undefined) baseParams.pur = opt.pur; // 仅首次购买传入 pur
    const data = new URLSearchParams(baseParams);
    const http = await httpRequest({ method: 'POST', url: GAME_BASE, body: data.toString() });
    const raw = http.text;
    appendGameServiceLog('doSpin', raw);
    const params = parseParams(raw); params.raw = raw; return params;
}

async function doCollect(symbol: string, mgckey: string, index: number, counter: number, bonus = false) {
    const data = new URLSearchParams({ action: bonus ? 'doCollectBonus' : 'doCollect', symbol, index: String(index), counter: String(counter), repeat: '0', mgckey });
    const http = await httpRequest({ method: 'POST', url: GAME_BASE, body: data.toString() });
    appendGameServiceLog(bonus ? 'doCollectBonus' : 'doCollect', http.text);
    return http.text;
}

// 新分割判定
function isFreeGame(obj: any): boolean {
    return !!(obj &&
        (
            obj.fs !== undefined ||
            obj.fs_total !== undefined ||
            obj.fs_bought !== undefined ||
            obj.fsmax !== undefined ||
            obj.fswin !== undefined ||
            obj.fsmul !== undefined ||
            obj.rs?.includes('fg')
        )
    );
}

function endCondition(spins: any[]): boolean {
    if (spins.length === 0) return false;
    const last = spins[spins.length - 1];
    const freeActive = spins.some(s => isFreeGame(s));
    const respinActive = spins.some(s => s.rs_c !== undefined || s.rs_t !== undefined);
    const jackpotActive = spins.some(s => s.mo_c == '1');
    // 免费局结束：只依据 na=c / na=cb / fsend_total=1 （更加保守，避免 fsres_total 过早结束导致错误 collect）
    if (freeActive) {
        if (last.na === 'c' || last.na === 'cb') return true;
        if (last.fsend_total == '1') return true;
        return false;
    }
    // 重旋结束：rs_t=1 或 na=c
    if (respinActive) {
        if (last.rs_t == '1') return true;
        if (last.na === 'c') return true;
        return false;
    }
    // Jackpot：最后面板收束
    if (jackpotActive && last.mo_c == '1' && (last.na === 'c' || last.na === 'cb')) return true;
    // 普通局：下一面板 w=0.00 判定结束（与旧逻辑保持）
    if (last.w === '0.00') return true;
    return false;
}

// 是否需要调用 collect（更严格）
function shouldCollect(spins: any[]): boolean {
    if (!spins.length) return false;
    const last = spins[spins.length - 1];
    const freeActive = spins.some(s => isFreeGame(s));
    const respinActive = spins.some(s => s.rs_c !== undefined || s.rs_t !== undefined);
    const jackpotActive = spins.some(s => s.mo_c == '1');
    // Jackpot 结束需要 collect
    if (jackpotActive && last.mo_c == '1' && (last.na === 'c' || last.na === 'cb')) return true;
    // 免费局：只有 na=cb（带 bonus collect）或特殊购买 free 的结束面板（一般 cb 表示 bonus collect）才 collect；普通 na=c 不 collect
    if (freeActive && last.na === 'cb') return true;
    // 重旋：结束时（rs_t=1 或 na=c）需要 collect
    if (respinActive && (last.rs_t == '1' || last.na === 'c')) return true;
    return false;
}

function bucketForNaturalOrPurchased(mul: number, isNaturalFree: boolean, purchaseType: 'default' | 'super' | null): BucketKey {
    // 购买普通 & 自然免费统一归入 freegame
    if (purchaseType === 'default' || isNaturalFree) return 'freegame';
    if (purchaseType === 'super') return 'freegame_sup';
    if (mul <= 0) return 'zero';
    if (mul <= 10) return 'x1_10';
    if (mul <= 20) return 'x11_20';
    if (mul <= 30) return 'x21_30';
    return 'over_30';
}

// ---------------------- 重构辅助类型与工具函数 ----------------------
type CollectTargetsMap = Partial<Record<BucketKey, number>>;
type LimitsMap = Record<BucketKey, number>;
interface SessionSummary { start: string; games: any[]; rounds: any[] }
interface GameContext {
    symbol: string;
    gameDir: string;
    tablePath: string;
    payoutObj: { [k in BucketKey]?: any[] } & { ratios?: RatioValues };
    token: string;
    c: string;
    l: string;
    purchaseModes: PurchaseModes;
    index: number;
    counter: number;
    collectedRounds: number;
    baselineCounts: Record<BucketKey, number>; // 初始已有数量，用于进度显示新增
}

// 回合累积器：负责临时保存一局的所有 spin 面板
class RoundAccumulator {
    public spins: any[] = [];
    reset() { this.spins.length = 0; }
    push(spin: any) { this.spins.push(spin); }
    isEnded(): boolean { return endCondition(this.spins); }
    get length() { return this.spins.length; }
    last() { return this.spins[this.spins.length - 1]; }
    // 校验 sum(w)==tw
    validateSum(): boolean {
        if (!this.spins.length) return false;
        const sumW = this.spins.map(o => toDec(o.w || 0)).reduce((a, b) => a.plus(b), new Decimal(0));
        const tw = toDec(this.last().tw || 0);
        return sumW.eq(tw);
    }
    getBetWinMul(): { bet: number; win: number; mul: number } {
        if (!this.spins.length) return { bet: 0, win: 0, mul: 0 };
        const bet = toNum(this.spins[0].c) * toNum(this.spins[0].l);
        const win = toDec(this.last().tw || 0).toNumber();
        const mul = bet > 0 ? win / bet : 0;
        return { bet, win, mul };
    }
}

// 解析 --collect 参数
function parseCollectTargets(raw: string): CollectTargetsMap {
    const map: CollectTargetsMap = {};
    if (!raw) return map;
    for (const seg of raw.split(',').map(s => s.trim()).filter(Boolean)) {
        const [bk, numStr] = seg.split(':');
        if (!bk || !numStr) continue;
        if ((['freegame', 'freegame_sup', 'zero', 'x1_10', 'x11_20', 'x21_30', 'over_30'] as string[]).includes(bk)) {
            const n = Number(numStr);
            if (!Number.isNaN(n) && n > 0) map[bk as BucketKey] = n;
        }
    }
    return map;
}

// 加载并迁移 payout-table.yml
async function loadOrInitPayout(tablePath: string): Promise<{ [k in BucketKey]?: any[] } & { ratios?: RatioValues }> {
    let obj: any = { freegame: [], freegame_sup: [], zero: [], x1_10: [], x11_20: [], x21_30: [], over_30: [] };
    try { const loaded = yaml.load(await fs.promises.readFile(tablePath, 'utf-8')) as any; if (loaded) obj = loaded; } catch { }
    // 迁移旧桶
    if (obj.free_default) { obj.freegame = (obj.freegame || []).concat(obj.free_default); delete obj.free_default; }
    if (obj.free_super) { obj.freegame_sup = (obj.freegame_sup || []).concat(obj.free_super); delete obj.free_super; }
    for (const k of Object.keys(DEFAULT_LIMIT) as BucketKey[]) { if (!obj[k]) obj[k] = []; }
    return obj;
}

// 更新 pp.yml 中对应游戏的比例字段（不再写入 payout-table.yml）
// 已废弃：按 symbol 直接识别游戏，不再写入 pp.yml 比例字段
// async function updateGameRatios(gameId: number, symbol: string, ratios: RatioValues) { /* deprecated */ }

// 初始化游戏：获取 token + doInit + 写入初始比例与购买信息
async function initGame(meta: GameMeta, limits: LimitsMap): Promise<GameContext> {
    const symbol = meta.api || (meta as any).symbol || meta.name_en || meta.name;
    // 使用 symbol 作为目录名（需做文件系统安全处理）
    const safeSymbol = symbol.replace(/[^a-zA-Z0-9_-]/g, '_');
    const gameDir = path.resolve(process.cwd(), 'assets', 'pp', safeSymbol); await ensureDir(gameDir);
    const tablePath = path.join(gameDir, 'payout-table.yml');
    // 初始化日志文件
    HTTP_LOG_FILE = path.join(gameDir, 'http.log');
    GS_LOG_FILE = path.join(gameDir, 'gameservice.log');
    ERR_LOG_FILE = path.join(gameDir, 'error.log');
    try { fs.writeFileSync(HTTP_LOG_FILE, ''); } catch { }
    try { fs.writeFileSync(GS_LOG_FILE, ''); } catch { }
    try { fs.writeFileSync(ERR_LOG_FILE, ''); } catch { }
    let payoutObj = await loadOrInitPayout(tablePath);
    let token = await getToken(symbol); console.log('token:', token);
    const init = await doInit(symbol, token); fs.writeFileSync(path.join(gameDir, 'doInit.txt'), init.text, 'utf-8');
    const c = init.c; const l = init.l; const purchaseModes = init.purchase;
    const builtInit = buildInitContextWithRatios(init.text, c, l, purchaseModes);
    const initLogLines = generateInitLog({ initText: init.text, c, l, purchase: purchaseModes, prebuilt: builtInit });
    for (const line of initLogLines) console.log(line);
    // 废弃：不再写入 pp.yml 比例字段
    // await updateGameRatios(meta.gameId, symbol, builtInit.ratios);
    // 赔付表不再写 ratios，仅保存原有结构（确保不存在遗留 ratios 字段）
    if ((payoutObj as any).ratios) { delete (payoutObj as any).ratios; }
    await fs.promises.writeFile(tablePath, yaml.dump(payoutObj), 'utf-8');
    // (已移除 purchase-modes.txt 生成逻辑)
    const baselineCounts: Record<BucketKey, number> = {
        freegame: payoutObj.freegame?.length || 0,
        freegame_sup: payoutObj.freegame_sup?.length || 0,
        zero: payoutObj.zero?.length || 0,
        x1_10: payoutObj.x1_10?.length || 0,
        x11_20: payoutObj.x11_20?.length || 0,
        x21_30: payoutObj.x21_30?.length || 0,
        over_30: payoutObj.over_30?.length || 0,
    };
    return { symbol, gameDir, tablePath, payoutObj, token, c, l, purchaseModes, index: 2, counter: 3, collectedRounds: 0, baselineCounts };
}

// 重置当前局状态（索引、计数器、累积面板）
function resetCaptureState(ctx: GameContext, round: RoundAccumulator) {
    ctx.index = 2; ctx.counter = 3; round.reset();
}

// 是否满足完成条件和增量采集目标
function isGameFinished(ctx: GameContext, limits: LimitsMap, collectTargets: CollectTargetsMap): boolean {
    const isCompletionBucket = (b: BucketKey) => ['zero', 'x1_10', 'x11_20'].includes(b);
    const completionOk = Object.entries(limits).every(([b, lim]) => !isCompletionBucket(b as BucketKey) || (ctx.payoutObj[b as BucketKey] || []).length >= lim);
    const collectOk = Object.entries(collectTargets).every(([bk, need]) => (ctx.payoutObj[bk as BucketKey] || []).length >= (need || 0));
    return completionOk && collectOk;
}

// 持久化一局到对应桶
async function persistRound(ctx: GameContext, round: RoundAccumulator, bucket: BucketKey, mul: number, bet: number, win: number, purchaseType: string | null) {
    const content = JSON.stringify(round.spins.map(o => o.raw));
    const fileName = makeDeterministicName(content);
    const outDir = path.join(ctx.gameDir, bucket); await ensureDir(outDir);
    const fullPath = path.join(outDir, fileName);
    if (!fs.existsSync(fullPath)) fs.writeFileSync(fullPath, content, 'utf-8');
    (ctx.payoutObj[bucket] ||= []).push({ file: fileName, mul: parseFloat(mul.toFixed(2)), check: false });
    await fs.promises.writeFile(ctx.tablePath, yaml.dump(ctx.payoutObj), 'utf-8');
    console.log(`采集完成 局面板:${round.length} bet:${bet} win:${win} mul:${mul.toFixed(2)} bucket:${bucket} purchaseType:${purchaseType || '-'} file:${fileName}`);
}

// 检测是否达到某桶 limit（若该桶没有 collect 目标）
function bucketLimitReached(bucket: BucketKey, ctx: GameContext, limits: LimitsMap, collectTargets: CollectTargetsMap): boolean {
    const targetExtra = collectTargets[bucket];
    if (targetExtra !== undefined) return false; // 有增量要求则忽略 limit
    return (ctx.payoutObj[bucket]?.length || 0) >= limits[bucket];
}

// 处理需要重启的情况
interface RestartResult { aborted: boolean; restarted: boolean; }
async function handleRestartIfNeeded(spinObj: any, ctx: GameContext, round: RoundAccumulator): Promise<RestartResult> {
    if (!(spinObj.frozen || spinObj.msg_code === '7' || spinObj.ext_code === 'SystemError')) return { aborted: false, restarted: false };
    const reason = spinObj.frozen ? 'frozen' : (spinObj.ext_code === 'SystemError' ? 'SystemError' : 'msg_code=' + spinObj.msg_code);
    console.warn(`检测到异常(${reason})，尝试重启会话，当前面板丢弃`);
    const rawSnippet = (spinObj.raw || '').slice(0, DEBUG_ERRORS ? 10000 : 300); // 默认截断300，debug时放大
    appendErrorLog([
        `[DETECT] time=${new Date().toISOString()} reason=${reason} index=${ctx.index} counter=${ctx.counter} spinsInRound=${round.length}`,
        `fields frozen=${spinObj.frozen || ''} msg_code=${spinObj.msg_code || ''} ext_code=${spinObj.ext_code || ''} na=${spinObj.na || ''} rs=${spinObj.rs || ''}`,
        `raw${DEBUG_ERRORS ? '' : '(slice)'}=${rawSnippet}`,
        ''
    ]);
    round.reset();
    for (let rAttempt = 1; rAttempt <= 3; rAttempt++) {
        try {
            GAME_BASE = OPEN_BASE; // 重置基址
            ctx.token = await getToken(ctx.symbol, 3);
            const init = await doInit(ctx.symbol, ctx.token);
            ctx.c = init.c; ctx.l = init.l; ctx.purchaseModes = init.purchase;
            // 重启并确保 pp.yml 中已有比例（若之前不存在则补写）
            try {
                const builtRestart = buildInitContextWithRatios(init.text, ctx.c, ctx.l, ctx.purchaseModes);
                // 废弃：不再同步比例至 pp.yml
                console.log(`会话重启成功 attempt=${rAttempt} token:${ctx.token} reason=${reason}`);
                appendErrorLog([
                    `[RESTART_OK] time=${new Date().toISOString()} attempt=${rAttempt} reason=${reason} token=${ctx.token}`,
                    ''
                ]);
            } catch (e) {
                console.log(`会话重启成功 attempt=${rAttempt} token:${ctx.token} reason=${reason} (比例写入失败忽略)`);
                appendErrorLog([
                    `[RESTART_OK] time=${new Date().toISOString()} attempt=${rAttempt} reason=${reason} token=${ctx.token} ratiosWrite=FAIL ${(e as any)?.message || e}`,
                    ''
                ]);
            }
            resetCaptureState(ctx, round);
            return { aborted: false, restarted: true };
        } catch (e) {
            console.error(`重启会话失败 attempt=${rAttempt} reason=${reason}`, e);
            appendErrorLog([
                `[RESTART_FAIL] time=${new Date().toISOString()} attempt=${rAttempt} reason=${reason} error=${(e as any)?.message || e}`,
                ''
            ]);
            await new Promise(r => setTimeout(r, 800 * rAttempt));
        }
    }
    console.error(`连续重启失败 reason=${reason}，终止当前游戏采集`);
    appendErrorLog([
        `[ABORT] time=${new Date().toISOString()} reason=${reason} afterAttempts=3`,
        ''
    ]);
    return { aborted: true, restarted: false };
}

function appendGameServiceLog(action: string, raw: string) {
    if (!GS_LOG_FILE) return;
    try {
        const line = `[${action}] len: ${raw.length} raw: ${raw}`;
        fs.appendFileSync(GS_LOG_FILE, line + '\n', 'utf-8');
    } catch { }
}

// 选择购买类型（优先普通再超级）
// 购买参数映射假设：pur=0 普通旋转；pur=1 普通购买；pur=2 超级购买。
// 若实际游戏返回其它编码，可在此集中调整。
// 购买参数语义调整：仅首次购买 spin 传入 pur
// 普通购买 -> pur=0 ; 超级购买 -> pur=1 ; 未购买 -> 不传(undefined)
function choosePurchase(ctx: GameContext, limits: LimitsMap, forceDefault: boolean, forceSuper: boolean): { pur: string | undefined; purchaseType: 'default' | 'super' | null } {
    const fgCount = ctx.payoutObj['freegame']?.length || 0;
    const fgsCount = ctx.payoutObj['freegame_sup']?.length || 0;
    const fgFinished = fgCount >= limits['freegame'];
    const fgsFinished = fgsCount >= limits['freegame_sup'];
    let pur: string | undefined = undefined;
    let purchaseType: 'default' | 'super' | null = null;
    const pm = ctx.purchaseModes;
    // 若两个购买桶都完成则直接返回普通旋转
    if (fgFinished && fgsFinished) return { pur, purchaseType }; // 不传 pur
    // 强制优先级
    if (forceSuper && pm.super && !fgsFinished) { pur = '1'; purchaseType = 'super'; return { pur, purchaseType }; }
    if (forceDefault && pm.default && !fgFinished) { pur = '0'; purchaseType = 'default'; return { pur, purchaseType }; }
    // 默认策略：先补普通再补超级
    if (!fgFinished && pm.default) { pur = '0'; purchaseType = 'default'; }
    else if (!fgsFinished && pm.super) { pur = '1'; purchaseType = 'super'; }
    return { pur, purchaseType };
}

// ---------------------- 主流程：处理单游戏 ----------------------
async function processGame(meta: GameMeta, limits: LimitsMap, collectTargets: CollectTargetsMap, sleep: number, sessionSummary: SessionSummary) {
    const symbol = meta.api || (meta as any).symbol || meta.name_en || meta.name;
    console.log('开始采集游戏:', symbol);
    const ctx = await initGame(meta, limits);
    const round = new RoundAccumulator();
    const isCompletionBucket = (b: BucketKey) => ['zero', 'x1_10', 'x11_20'].includes(b);
    let lastProgressAt = Date.now();

    function formatProgress(): string {
        const parts: string[] = [];
        for (const b of Object.keys(limits) as BucketKey[]) {
            // 若游戏不支持超级购买，则不输出 freegame_sup 进度
            if (b === 'freegame_sup' && !ctx.purchaseModes.super) continue;
            const currentTotal = (ctx.payoutObj[b]?.length || 0);
            const base = ctx.baselineCounts[b];
            let target: number;
            if (collectTargets[b] != null) {
                // 增量目标：若 baseline 已 >= collectTargets 则无需新增（目标=0）
                const ct = collectTargets[b]!;
                target = ct - base;
            } else {
                // limit 目标：若 baseline 已 >= limit 则无需新增
                target = limits[b] - base;
            }
            if (target < 0) target = 0;
            const newCollected = currentTotal <= base ? 0 : (currentTotal - base);
            parts.push(`${b}:${newCollected}/${target}`);
        }
        const line = `[progress] game:${symbol} ${parts.join(' ')}`;
        return `\x1b[33m${line}\x1b[0m`;
    }

    // 初始立即输出一次进度（回合数为0，面板=0）
    console.log(formatProgress());

    // 保存当前回合的购买类型（仅第一次购买触发免费时记录，后续免费局内不再改变）
    let roundPurchaseType: 'default' | 'super' | null = null;
    const forceDefault = (process.argv.includes('--force_default'));
    const forceSuper = (process.argv.includes('--force_super'));
    while (true) {
        if (isGameFinished(ctx, limits, collectTargets)) break;
        if (sleep > 0) await new Promise(r => setTimeout(r, sleep));
        // 如果当前回合已经进入免费（有免费面板），则后续 spin 禁止再次购买，保持 roundPurchaseType 不变
        let purchaseDecision: { pur: string | undefined; purchaseType: 'default' | 'super' | null };
        if (round.spins.length > 0 && round.spins.some(s => isFreeGame(s))) {
            purchaseDecision = { pur: undefined, purchaseType: null }; // 免费过程中不再传购买参数
        } else {
            purchaseDecision = choosePurchase(ctx, limits, forceDefault, forceSuper);
        }
        const { pur, purchaseType } = purchaseDecision;
        if (DEBUG_PURCHASE) {
            const fgCount = (ctx.payoutObj['freegame']?.length || 0);
            const fgsCount = (ctx.payoutObj['freegame_sup']?.length || 0);
            const fgFinished = fgCount >= limits['freegame'];
            const fgsFinished = fgsCount >= limits['freegame_sup'];
            if (ctx.purchaseModes.super) {
                console.log(`[spin-decision] index=${ctx.index} counter=${ctx.counter} pur=${pur === undefined ? '-' : pur} purchaseType=${purchaseType || '-'} locked=${roundPurchaseType || '-'} fg(${fgCount}/${limits['freegame']}) finished=${fgFinished} fgs(${fgsCount}/${limits['freegame_sup']}) finished=${fgsFinished}`);
                if (fgFinished && fgsFinished && pur === undefined) {
                    console.log('[purchase-skip] all purchase buckets finished, remain natural spins only');
                } else if (pur !== undefined) {
                    console.log(`[purchase-detail] will purchase type=${purchaseType} pur=${pur}`);
                }
            } else {
                // 不支持超级购买时只输出普通购买相关的最小信息
                console.log(`[spin-decision] index=${ctx.index} counter=${ctx.counter} pur=${pur === undefined ? '-' : pur}`);
                if (pur === undefined && fgFinished) console.log('[purchase-skip] freegame bucket finished');
                else if (pur !== undefined) console.log(`[purchase-detail] will purchase normal pur=${pur}`);
            }
        }
        const spinObj = await doSpin(ctx.symbol, ctx.token, { c: ctx.c, l: ctx.l, index: ctx.index, counter: ctx.counter, ...(pur !== undefined ? { pur } : {}), sInfo: pur !== undefined ? 'n' : 't' });
        // 重启处理
        const restartResult = await handleRestartIfNeeded(spinObj, ctx, round);
        if (restartResult.aborted) break; // 终止当前游戏
        if (restartResult.restarted) {
            lastProgressAt = Date.now(); // 重启后立即重置进度计时
            roundPurchaseType = null;
            continue;
        }
        ctx.index++; ctx.counter += 2;
        round.push(spinObj);
        // 若此 spin 触发免费且是本回合第一次出现免费，并且产生于购买，则记录回合购买类型
        if (round.spins.length === 1 && purchaseType && isFreeGame(spinObj)) {
            roundPurchaseType = purchaseType;
        }
        // 单局面板添加时仅在调试需要可打开输出：console.log('spin', round.length, 'pur=', pur);
        if (Date.now() - lastProgressAt >= 5000) { // 每5秒输出一次进度
            console.log(formatProgress());
            lastProgressAt = Date.now();
        }
        if (!round.isEnded()) continue;
        // collect 条件：多于1面板或 jackpot
        const last = round.last();
        // 更严格的 collect 触发条件，避免 "action invalid" 导致后续 frozen
        if (shouldCollect(round.spins)) {
            const collectRaw = await doCollect(ctx.symbol, ctx.token, ctx.index, ctx.counter, last.na === 'cb');
            if (/balance=/.test(collectRaw)) {
                ctx.index++; ctx.counter += 2;
                console.log('collect:', collectRaw);
            } else {
                // 不成功不推进 index/counter，记录错误但仍尝试使用当前回合结果（多数游戏免费局无需 collect）
                console.warn('collect returned invalid, skip advancing index/counter');
                appendErrorLog([
                    `[COLLECT_INVALID] time=${new Date().toISOString()} index=${ctx.index} counter=${ctx.counter} raw=${collectRaw.replace(/\n/g, ' ')}`,
                    ''
                ]);
            }
        } else {
            appendErrorLog([
                `[COLLECT_SKIP] time=${new Date().toISOString()} reason=not-required index=${ctx.index} counter=${ctx.counter} last_na=${last.na || ''}`,
                ''
            ]);
        }
        if (!round.validateSum()) { console.warn('校验失败 sum(w)!=tw 丢弃当前面板'); round.reset(); continue; }
        const { bet, win, mul } = round.getBetWinMul();
        console.log(`回合结束 面板数:${round.length} bet:${bet} win:${win} mul:${mul.toFixed(2)}`);
        const naturalFree = roundPurchaseType === null && round.spins.some(o => isFreeGame(o));
        const bucket = bucketForNaturalOrPurchased(mul, naturalFree, roundPurchaseType);
        if (DEBUG_PURCHASE) console.log(`[bucket-eval] roundType=${roundPurchaseType || '-'} naturalFree=${naturalFree} mul=${mul.toFixed(2)} -> ${bucket}`);
        if (bucketLimitReached(bucket, ctx, limits, collectTargets)) { round.reset(); continue; }
        await persistRound(ctx, round, bucket, mul, bet, win, roundPurchaseType);
        sessionSummary.rounds.push({ bucket, mul: Number(mul.toFixed(2)), bet, win, file: (ctx.payoutObj[bucket]!.slice(-1)[0].file), purchaseType: roundPurchaseType || (naturalFree ? 'natural' : '-') });
        ctx.collectedRounds++;
        round.reset();
        roundPurchaseType = null; // 新回合重置
        if (isGameFinished(ctx, limits, collectTargets)) break;
    }
    console.log('游戏完成采集:', ctx.symbol, 'rounds=', ctx.collectedRounds);
    sessionSummary.games.push({ symbol: ctx.symbol, rounds: ctx.collectedRounds });
}

async function main() {
    const sessionSummary: SessionSummary = { start: new Date().toISOString(), games: [], rounds: [] };
    const args = parseArgs(process.argv.slice(2));
    // 默认开启调试；显式传 0 才关闭
    if (args.debug_errors === '0') DEBUG_ERRORS = false; else DEBUG_ERRORS = true;
    if (args.debug_purchase === '0') DEBUG_PURCHASE = false; else DEBUG_PURCHASE = true;
    const symbolArg = args.symbol; // 若提供 symbol 仅采集该游戏；否则按 pp.yml 顺序批量采集
    const sleep = Number(args.sleep || '100'); // 默认延迟 100ms
    const limits: Record<BucketKey, number> = { ...DEFAULT_LIMIT };
    for (const k of Object.keys(limits) as BucketKey[]) { const v = args['limit_' + k]; if (v) limits[k] = Number(v); }
    const collectTargets = parseCollectTargets(args.collect || '');

    const cfg = await loadPPConfig();

    // 需要采集的游戏列表：若指定 symbol，仅该游戏；否则按 pp.yml 顺序全部。
    const rawGameList: GameMeta[] = symbolArg
        ? cfg.games.filter(g => [g.api, (g as any).symbol, g.name_en, g.name].filter(Boolean).includes(symbolArg))
        : cfg.games.slice();
    // 去重：按解析出的符号唯一
    const gameMap = new Map<string, GameMeta>();
    for (const g of rawGameList) {
        const sym = g.api || (g as any).symbol || g.name_en || g.name;
        if (!sym) continue;
        if (!gameMap.has(sym)) gameMap.set(sym, g);
    }
    const gameList: GameMeta[] = Array.from(gameMap.values());

    for (const meta of gameList) {
        if (!meta) continue;
        await processGame(meta, limits, collectTargets, sleep, sessionSummary);
    }

    console.log('全部采集完成');
    const summaryPath = path.resolve(process.cwd(), 'assets', 'session-summary.yml');
    await fs.promises.writeFile(summaryPath, yaml.dump(sessionSummary), 'utf-8');
}

if (require.main === module) { main().catch(e => { console.error('capture error', e); process.exit(1); }); }
