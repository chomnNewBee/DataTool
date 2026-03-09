import path from "path";
import fs from "fs";
import AsyncLock from "async-lock";
import fetch from "node-fetch";
import Decimal from "decimal.js";
import crypto from "crypto";
import { log, table } from "console";
import { json } from "stream/consumers";
import Tool from "./Tool";
// 使用 require 兼容 CJS
// eslint-disable-next-line @typescript-eslint/no-var-requires
const yaml = require("js-yaml");

interface GameMeta {
    gameId: number;
    name: string;
    name_en: string;
    app_image?: string;
    symbol: string;
    url?: string;
    winMode?: boolean; // 线分模式
    respin?: boolean; // respin模式
    noFreeLimit?: boolean; // 跳过免费转limit
    noCheckSum?: boolean; // 跳过校验和
    completed?: boolean; // 采样完成标记
    gameDirId:string;
    freeST:number;
}

interface PPConfig {
    games: GameMeta[];
}

const PP_YML = path.resolve(process.cwd(), "assets", "pg.yml");
const lock = new AsyncLock();
// 配置缓存（进程内）
let ppConfigCache: PPConfig | null = null;
let ppConfigLoaded = false;

// 统一错误格式化 & 打印
function formatError(err: any) {
    if (!err) return { message: "unknown", stack: "" };
    if (err instanceof Error)
        return { message: err.message, stack: err.stack || "" };
    if (typeof err === "string") return { message: err, stack: "" };
    try {
        return { message: JSON.stringify(err), stack: "" };
    } catch {
        return { message: String(err), stack: "" };
    }
}

async function delay(ms: number) {
    return new Promise((r) => (ms ? setTimeout(r, ms) : r(null)));
}

function createTraceId(extraString:string){
    const traceId = Array.from({length: 6}, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join('') + extraString;
    return traceId
}

function createTraceId_27() {
    const traceId = createTraceId("27")
    return traceId
}

function createTraceId_28() {
    const traceId = createTraceId("28")
    return traceId
}


function createUserID(suffix = 'DemoUser') {
  const prefix = 'WcWDwUGt';
  const timestamp = Date.now();
  const randomTail = Math.random().toString(36).substring(2, 6); // 4位随机字符
  return `${prefix}-${timestamp}-${suffix}-${randomTail}`;
}


function logError(ctx: {
    symbol?: string;
    action?: string;
    phase?: string;
    extra?: any;
    err: any;
}) {
    const { symbol, action, phase, extra, err } = ctx;
    const { message, stack } = formatError(err);
    const prefix = ["[ERR]", phase, symbol, action].filter(Boolean).join(" ");
    const base: any = { msg: message };
    if (extra !== undefined) base.extra = extra;
    console.error(prefix, JSON.stringify(base));
    if (stack)
        console.error(
            prefix + " stack\n" + stack.split("\n").slice(0, 6).join("\n"),
        );
}
async function loadConfig(): Promise<PPConfig> {
    if (ppConfigLoaded && ppConfigCache) return ppConfigCache;
    // 纯读操作不加锁，减少锁重入风险；写入统一由 saveConfig 控制
    if (!fs.existsSync(PP_YML)) {
        ppConfigCache = { games: [] };
        ppConfigLoaded = true;
        return ppConfigCache;
    }
    const text = await fs.promises.readFile(PP_YML, "utf-8");
    try {
        ppConfigCache = (yaml.load(text) as PPConfig) || { games: [] };
    } catch {
        ppConfigCache = { games: [] };
    }
    ppConfigLoaded = true;
    return ppConfigCache;
}

function findPgConfigCacheBySymbol(symbol: string) {
    if (!ppConfigCache) {
        return null
    }
    return ppConfigCache.games.find(config => config.symbol === symbol);

}
// 从 pg.yml 中获取已存在的 meta，不再创建新条目
async function getMeta(api: string): Promise<GameMeta | null> {
    const cfg = await loadConfig();
    return cfg.games.find((g) => g.symbol === api) || null;
}

async function writeYamlLocked(filePath: string, data: any) {
    const key = "yml:" + filePath;
    await lock.acquire(key, async () => {
        const dumped = yaml.dump(data);
        await fs.promises.writeFile(filePath, dumped, "utf-8");
    });
}

// 更新游戏的采样完成状态
async function updateSamplingStatus(symbol: string, completed: boolean) {
    const cfg = await loadConfig();
    const game = cfg.games.find((g) => g.symbol === symbol);
    if (game) {
        const oldStatus = game.completed || false;
        game.completed = completed;

        // 只在状态发生变化时更新文件和输出日志
        if (oldStatus !== completed) {
            await writeYamlLocked(PP_YML, cfg);
            // 更新缓存
            ppConfigCache = cfg;

            const statusText = completed ? "已完成" : "未完成";
            console.log(`[${symbol}] 采样状态更新: ${statusText}`);
        }
    }
}

function extractTitle(html: string): string | undefined {
    const m = html.match(/<title>(.*?)<\/title>/i);
    return m ? m[1].trim() : undefined;
}

function extractApi(html: string): string | undefined {
    const m = html.match(/gameSymbol=([a-z0-9_]+)/i);
    return m ? m[1] : undefined;
}

async function fetchWithRedirect(
    url: string,
): Promise<{ location?: string; html?: string }> {
    const resp = await fetch(url, { redirect: "manual" });
    const loc = resp.headers.get("location") || undefined;
    if (loc) {
        const htmlResp = await fetch(loc, { redirect: "manual" });
        const html = await htmlResp.text();
        return { location: loc, html };
    }
    const html = await resp.text();
    return { html };
}

function escapeReg(s: string) {
    return s.replace(/[-/\\^$*+?.()|[\]{}]/g, (r) => "\\" + r);
}

function replaceToken(html: string, token: string): string {
    if (!token) return html;
    return html.replace(new RegExp(escapeReg(token), "g"), "{{TOKEN}}");
}

// 全局统一采样上限
export const GLOBAL_LIMIT: { [k: string]: number } = {
    zero: 300,
    x1_10: 250,
    x11_20: 150,
    x21_30: 50,
    freegame: 110,
};

const GLOBAL_FREE_LIMIT: { [k: string]: number } = {
    x1_x10:5,
    x10_x20:5,
    x21_x30:5,
    x31_x35:5,
    x36_x40:5,
    x41_x45:5,
    x46_x50:4,
    x51_x55:2,
    x56_x60:2,
    x61_x70:2,
    x71_x80:2,
    x81_x90:2,
    x91_x100:2,
    
    x101_x120:3,
    x121_x135:3,
    x136_x150:3,
    x151_x170:5,
    x171_x190:5,
    x191_x210:5,
    x211_x230:5,
    free_free:10,
 
};


// 版本号常量
const CVERSION = "345780";

// 简易并发执行器，避免 p-limit ESM 兼容问题
async function runParallel<T>(
    items: T[],
    concurrency: number,
    worker: (item: T) => Promise<void>,
) {
    if (concurrency < 1) concurrency = 1;
    let cursor = 0;
    const total = items.length;
    const runners: Promise<void>[] = [];
    async function runOne() {
        while (true) {
            let idx: number;
            if (cursor >= total) return;
            idx = cursor++;
            const it = items[idx];
            try {
                await worker(it);
            } catch (e) {
                logError({
                    action: "worker",
                    phase: "parallel",
                    err: e,
                    extra: { item: it },
                });
            }
        }
    }
    for (let i = 0; i < Math.min(concurrency, total || 1); i++) {
        runners.push(runOne());
    }
        

    await Promise.all(runners);
}

export class GameCollector {
    symbol: string;
    sleep: number;
    baseUrl = "https://m7.hgapi365.com"//"https://demogamesfree-asia.pragmaticplay.net/gs2c";
    token = "";
    cBet = "0.2";
    lLines = "20";
    free = false;
    cs = 0.01;
    ml = 1;
    maxLine = 0;
    id = "0"
    lastRaw = "";
    gameId?: number;
    earlyCompleted = false; // 启动时即已完成标志
    // 当为 true 时，普通局使用 tw!=0.00 判断结束；否则沿用 w==0.00 逻辑r
    winMode = false;
    respin = false; // respin 模式标志
    noFreeLimit = false; // 跳过免费转limit标志
    noCheckSum = false; // 跳过校验和标志
    needBonus = false; // 下次需要调用doBonus标志
    static first = false

    // 共享的统计数据（多个处理器共享）
    static sharedPayoutObj: Map<string, { [k: string]: any[] }> = new Map();
    // 跟踪哪些游戏的YAML文件已经加载过
    static yamlLoadedGames: Set<string> = new Set();
    static data_records = new Map<string,any>()
    gameDirId:string = ""
    freeST:number = 0;

    payoutObj: { [k: string]: any[] } = {
        freegame: [],
        zero: [],
        x1_10: [],
        x11_20: [],
        x21_30: [],
        over_30: [],
    };

    //免费游戏细节分布
    static detailFreePayoutObj: any

    gameDir = "";

    processorId: string; // 处理器ID

    constructor(symbol: string, sleep = 200, processorId = "") {
        this.symbol = symbol;
        this.sleep = sleep;
        this.processorId = processorId;
        let cfg = findPgConfigCacheBySymbol(symbol) as GameMeta
        this.gameDirId = cfg.gameDirId
        this.freeST = cfg.freeST
        
        // 获取或创建共享的统计对象
        if (!GameCollector.sharedPayoutObj.has(symbol)) {
            GameCollector.sharedPayoutObj.set(symbol, {
                freegame: [],
                zero: [],
                x1_10: [],
                x11_20: [],
                x21_30: [],
                over_30: [],
            });
        }
        // 引用共享的统计对象
        this.payoutObj = GameCollector.sharedPayoutObj.get(symbol)!;
    }

    // 加载YAML文件数据到共享统计对象（确保只加载一次）
    private async loadYamlOnce(symbol: string, gameDir: string) {
        if (GameCollector.yamlLoadedGames.has(symbol)) {
            return; // 已经加载过，跳过
        }

        const tablePathEarly = path.join(gameDir, "payout-table.yml");
        try {
            const loadedData = yaml.load(
                await fs.promises.readFile(tablePathEarly, "utf-8"),
            );
            if (loadedData) {
                // 更新共享统计对象的内容
                Object.keys(loadedData).forEach((key) => {
                    if (this.payoutObj[key]) {
                        this.payoutObj[key] = loadedData[key] || [];
                    }
                });
            }
            GameCollector.yamlLoadedGames.add(symbol);
        } catch {
            // 文件不存在或格式错误，使用默认值
            GameCollector.yamlLoadedGames.add(symbol);
        }
    }

    private async delay(ms: number) {
        return new Promise((r) => (ms ? setTimeout(r, ms) : r(null)));
    }

    private toNum(v: any) {
        if (v == null) return 0;
        v = String(v).replace(/,/g, "");
        return new Decimal(v).toNumber();
    }

    private toDecimal(v: any) {
        if (v == null) return new Decimal(0);
        return new Decimal(String(v).replace(/,/g, ""));
    }

    private parseParams(s?: string) {
        const r: Record<string, string> = {};
        if (!s) return r;
        for (const p of s.split("&")) {
            const [k, v] = p.split("=").map(decodeURIComponent);
            if (k) r[k] = v || "";
        }
        return r;
    }

    private bucket(mul: number) {
        if (mul <= 0) return "zero";
        if (mul <= 10) return "x1_10";
        if (mul <= 20) return "x11_20";
        if (mul <= 30) return "x21_30";
        return "over_30";
    }

    private getBucketTwoNumber(str: string) {
        let [part1, part2] = str.split('_');
        let min = Number(part1.slice(1));
        let max = Number(part2.slice(1));
        return [min, max]
    }

    private findDetailBucket(mul: number) {
        for (let key in GLOBAL_FREE_LIMIT) {
            if(key == "free_free"){
                return null
            }
            let bet_range = this.getBucketTwoNumber(key)
            if (mul >= bet_range[0] && mul <= bet_range[1]) {
                return key
            }
        }
        return null
    }
    private freeDetailBucket(mul: number) {
        let count = 0
        for (let key in GLOBAL_FREE_LIMIT) {
            count += GLOBAL_FREE_LIMIT[key]
        }
        return this.findDetailBucket(Math.floor(mul))
    }

    private printFreeDetailBucket() {
        let printStr = ""
        for (let key in GLOBAL_FREE_LIMIT) {
            printStr += key
            printStr += ":"
            printStr += GameCollector.detailFreePayoutObj[this.symbol][key]?GameCollector.detailFreePayoutObj[this.symbol][key].length.toString():0
            printStr += "/"
            printStr += GLOBAL_FREE_LIMIT[key].toString()
            printStr += " "
        }

        console.log(`免费分布:${printStr}`)
    }


    private async sendCreateGame() {
        let UserID = createUserID();
        let appid = "faketrans1_VND_1";
        let appsecret = "b16a2943-c9b0-4a9b-96c1-8fd25af57dae";
        let headers = {
            "Content-Type": "application/json",
            appid: appid,
            appsecret: appsecret
        }

        const resp1 = await fetch("https://game.slot365games.com/api/v1/player/createAuth", {
            method: "POST",
            headers: headers,
            body: JSON.stringify({
                UserID: UserID

            })
        });

        let text1 = await resp1.text()
        //console.log(text1)


        await this.delay(500);
        const resp2 = await fetch("https://game.slot365games.com/api/v1/game/launchAuth", {
            method: "POST",
            headers: headers,
            body: JSON.stringify({
                "UserID": UserID,
                "GameID": `pg_${this.gameDirId}`,
                "Platform": "desktop",
                "Language": "en"
            })
        });
        let text2 = await resp2.text()
        let gameUrl = JSON.parse(text2).data.url
        let token  = new URL(gameUrl).searchParams.get("ops") as string;
        this.token = token
        //console.log(text2)


        await this.delay(this.sleep);
        const resp3 = await fetch("https://game.slot365games.com/api/SetDemoPlayerRTP", {
            method: "POST",
            headers: headers,
            body: JSON.stringify({
                "DemoUserId": UserID,
                "GameID": `pg_${this.gameDirId}`,
                "ContrllRTP": 120
            })
        });
        let text3 = await resp3.text()
        //console.log(text3)
    }


    async initMeta(): Promise<{  meta: GameMeta }> {
        // 1. 优先仅基于 symbol 查已有 meta 与 payout 表，若已完成则跳过网络解析
        const cfg = await loadConfig();
        let meta = cfg.games.find(
            (g) => g.symbol === this.symbol || g.name_en === this.symbol,
        );
        if (meta) {
            this.gameId = meta.gameId;
            this.gameDir = path.resolve(
                process.cwd(),
                "assets",
                "pg",
                String(meta.symbol),
            );

            // 确保YAML文件只加载一次到共享统计对象
            await this.loadYamlOnce(this.symbol, this.gameDir);

            const doneEarly = meta.completed || Object.keys(GLOBAL_LIMIT).every((k) => {
                if (k == "freegame" && this.noFreeLimit) return true;
                const lim = GLOBAL_LIMIT[k];
                if (lim === undefined) return true;
                const arr = this.payoutObj[k];
                return Array.isArray(arr) && arr.length >= lim;
            });
            if (doneEarly) {
                this.earlyCompleted = true;
                // 更新采样完成状态到 YAML
                await updateSamplingStatus(this.symbol, true);

                const htmlPathSkip = path.join(this.gameDir, "index.demo.html");
                console.log(
                    `[${this.symbol}]`,
                    "启动检测: 采样已完成, 跳过 openGame",
                );
                return {   meta };
            }
        }

        
        // 2. 未完成则继续网络解析 openGame 获取真实 api/token
        try {
           await this.sendCreateGame()
        } catch (e) {
            logError({
                symbol: this.symbol,
                action: "sendCreateGame",
                phase: "fetch",
                err: e,
                extra: { url: open },
            });
            throw e;
        }
  
        // 从 pg.yml 中获取 meta
        const foundMeta = await getMeta(this.symbol);
        if (!foundMeta) {
            throw new Error(
                `游戏 ${this.symbol} 不存在于 pg.yml 中，请先在 pg.yml 中配置此游戏`,
            );
        }
        meta = foundMeta;
        this.gameId = meta.gameId;

        console.log(
            `[${this.symbol}]`,
            "解析到 token",
            this.token.slice(0, 18) + "...",
        );

        this.gameDir = path.resolve(
            process.cwd(),
            "assets",
            "pg",
            String(meta.symbol),
        );
        await fs.promises.mkdir(this.gameDir, { recursive: true });
        try {
            fs.unlinkSync(path.join(this.gameDir, "request.log"));
        } catch { }
  
        const tablePath = path.join(this.gameDir, "payout-table.yml");
        try {
            const loadedData = yaml.load(
                await fs.promises.readFile(tablePath, "utf-8"),
            );
            if (loadedData) {
                // 更新共享对象的内容，而不是重新赋值引用
                Object.keys(loadedData).forEach((key) => {
                    if (this.payoutObj[key]) {
                        this.payoutObj[key] = loadedData[key] || [];
                    }

                    if (!GameCollector.detailFreePayoutObj) {
                        GameCollector.detailFreePayoutObj = {}
                    }
                    GameCollector.detailFreePayoutObj[this.symbol] = {}
                    for (let item of this.payoutObj["freegame"]) {
                        let mul = Number(item.mul)
                        let bucket = this.findDetailBucket(mul)
                        if(item.freeInFree){
                            bucket = "free_free"
                        }
                        if (bucket) {
                            if (!GameCollector.detailFreePayoutObj[this.symbol][bucket]) {
                                GameCollector.detailFreePayoutObj[this.symbol][bucket] = []
                            }
                            GameCollector.detailFreePayoutObj[this.symbol][bucket].push(mul)
                        }
                    }
                    let a = 1
                });
            }
        } catch {
            let a = 1
            /* ignore */
        }
        return {  meta };
    }

    private async request(one = false): Promise<string> {

        let paramsObj:any = {
            id: this.id,
            cs: this.cs.toString(),
            ml: this.ml.toString(),
            wk: "0_C",
            btt: "2",
            atk: this.token,
            pf: "1",
       //     fb:one?"2":"1",
        }

        let raw_:any=""
        if (this.lastRaw) {
            raw_ = JSON.parse(this.lastRaw)
            if (raw_.dt.si.nst == 32) {
                paramsObj.fss = "0"
            }
        }

        const params = new URLSearchParams(paramsObj);
        for (let r = 0; r < 3; r++) {
            await this.delay(this.sleep);
            let raw = "";
            try {
                const resp = await fetch(this.baseUrl+ "?"+ createTraceId_28(), {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" 
                    },
                    body: params.toString(),
                   
                });
                raw = await resp.text();
                if (!resp.ok) {
                    logError({
                        symbol: this.symbol,
                        action:"spin",
                        phase: "http",
                        err: new Error("status " + resp.status),
                        extra: {
                            status: resp.status,
                            retry: r + 1,
                            snippet: raw.slice(0, 115),
                        },
                    }); 
                }
            } catch (e) {
                logError({
                    symbol: this.symbol,
                    phase: "network",
                    err: e,
                    extra: { retry: r + 1 },
                });
                // 网络错误也记录一次 (记录 action)
                this.appendSpinRaw("spin" + "\n\t" + "<NETWORK_ERROR>");
                //if (action === "doSpin" || action === "doCollect") process.exit(1);
                process.exit(1)
                continue;
            }
            if (raw.includes("unlogged")) {
                logError({
                    symbol: this.symbol,
                    phase: "auth",
                    err: "unlogged",
                    extra: { retry: r + 1 },
                });
                continue;
            }
            if (/Error|error/.test(raw))
                logError({
                    symbol: this.symbol,
                    phase: "body",
                    err: "contains Error",
                    extra: { snippet: raw.slice(0, 120) },
                });
            // 记录所有请求（doInit/doSpin/doCollect）使用 action
            this.appendSpinRaw("spin" + "\n\t" + raw);
            return raw;
        }
        const errMsg = this.symbol + " " + "spin" + " unlogged after retries";
        this.appendSpinRaw("spin" + "\n\t" + "<FAILED>");
        /*
        if (action === "doSpin" || action === "doCollect") {
            logError({ symbol: this.symbol, action, phase: "final", err: errMsg });
            process.exit(1);
        }
        */
        logError({ symbol: this.symbol, action :"spin", phase: "final", err: errMsg });
        process.exit(1);
        throw new Error(errMsg);
    }

    private appendSpinRaw(raw: string) {
        return
        try {
            if (!this.gameDir) return;
            fs.appendFileSync(
                path.join(this.gameDir, "request.log"),
                raw + "\n",
                "utf-8",
            );
        } catch { }
    }

    private isEnterFreeGame(obj: any) {
         let siFs = obj.dt.si.fs
        if(siFs&&siFs.ts == siFs.s){
            return true
        }
        /*if ((obj.dt.si.st & 1) && (obj.dt.si.nst & this.freeST)) {
            return true
        }*/

        return
    }
    // 与JavaScript游戏引擎保持一致的免费游戏识别逻辑
    private isFree(obj: any) {
        if (this.free) return true;
        if (!obj) return false;


        switch (this.gameDirId) {
            case "38":
            case "44":
            case "25":
                if (!obj.dt.si.bns) return false
                let bns = obj.dt.si.bns
                if (bns/*&&fs.ts > 0*/) {
                    return true
                }
                break
            default:
                if (!obj.dt.si.fs) return false
                let fs = obj.dt.si.fs
                if (fs/*&&fs.ts > 0*/) {
                    return true
                }
                break
        }

        return false
    }


   private isCollect(obj: any): boolean {
        let si = obj.dt.si
        /*免费中奖st变化
        [st1 nst21]  [st 21 nst 22]  [st22 nst22] [st22 nst22] [st22 nst22] [st22 nst22] [st22 nst21](结束)
        //普通中奖st变化
        [st1 nst4]   [st4 nst4]  [st4 nst4]  [st4  nst1]
        st1 nst1  普通无中奖
        st21 nst21  免费无中奖
        1 2 4 8 16 掩码
        21 ===  16 4 1
        22 ===  16 4 2
        猜测: 16-> 免费游戏状态 1无中奖 2免费游戏后续消除数据 4普通中奖后续的消除数据

        */
        if(si.nst != 1){
            return false
        }
        return true
    }

    async sendGameInfo() {
        const params = new URLSearchParams({
            btt: "1",
            atk: this.token,
            pf: "1"
        });

        let traceId = createTraceId_27()
        let url = `https://usapi.slot365games.com/game-api/${this.gameDirId}/v2/GameInfo/Get?traceId=${traceId}`
        const resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
             
            },
            body: params.toString()
        });
        let text = await resp.text()
        let gameInfoData = JSON.parse(text)
        this.cs = gameInfoData.dt.cs[0]
        this.ml = gameInfoData.dt.ml[0]
        this.maxLine = gameInfoData.dt.mxl
        
        return gameInfoData
    }

    async sendGameRule() {

        let initFile = "gameRule.json";
        if (this.gameDir) {
            initFile = path.join(this.gameDir, initFile);
            try {
                await fs.promises.access(initFile);
                return
            } catch {

            }
        }

        const params = new URLSearchParams({
            btt: "1",
            gid: this.gameDirId,
            atk:this.token,
            pf: "1"
        });

        let traceId = createTraceId("05")
        let url = `https://usapi.slot365games.com/web-api/game-proxy/v2/GameRule/Get?traceId=${traceId}`
        const resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"

            },
            body: params.toString()
        });

        let text = await resp.text()

        try {
            await fs.promises.writeFile(initFile, text, "utf-8");
        } catch {
            /* ignore */
        }
    }

    async getT45Info(si:any){
        if(GameCollector.first){
            return
        }
        GameCollector.first = true
        let gameInfoPath = this.gameDir + "/gameInfo.json"
        let verifySessionPath = this.gameDir + "/verifySession.json"

        if(Tool.existsFile(gameInfoPath)){
            return
        }

        
        let url = "https://t45vip.com/api/carbon-game/private/user/game/login"
        let resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "equipmentidentification":"3020346f0da506fc943b928c8be09c65",
                "equipmentname":"Windows",
                "loginusertype":"PC",
                "origin":"https://t45vip.com",
                "priority":"u=1, i",
                "referer":`https://t45vip.com/game?gameCode=PGS_${this.gameDirId}`,
                "cookie":"cf_clearance=QWg93wLx9FEl5voEhSfcmwrfHhqigTLmatgKammOfbg-1768990055-1.2.1.1-hBIVBsgcurwLrdeT4DAT_NpkYeQJGuBeF6a6SJhzWCq3dTR_2f.dZWcM0uy3qzLb.SQ3mAEXkV5iSqd0sheZ4XM4NM7lVvMF1eg5UzODF5moLDO.vJcXO.oGT6mOmj0YF0xHbWKynDRZFLG0SAjg8CvXR5z7qPfMoPZz6KL8ifyqmhCWXe8TngMscKYzxhG9H2SQT6xbQRDR25Fkaq0Iwf.oD2yQz_mw0sKdTvSsW3A; __cf_bm=2cGif64JDxViCCHqgTsBO9Zeul6jxehzDlHvoUC7gnQ-1768990708-1.0.1.1-G9IMDHhm3HomjJ0zEODXDO.yclISs26LqDEHRzkoZDsxu4kL9W7PUJMiFBhTF9ahSq9q4Tbs3W7FrxBZPNXaA5x7WGh0RVN.AzVM_0F3kUU; _cfuvid=j15GpP5xslfelgcqecM9e9FOhh1iseRhzbZSg2einqg-1768990708992-0.0.1.1-604800000",
                "authorization":"9339d23d-82f4-4e37-ad67-a267ad519dd6_1760173404759_967cd40bc74df8d0724f969138198021db607037"
            },
            body: JSON.stringify({
                "gameCode": `PGS_${this.gameDirId}`,
                "language": "pt",
                "device": "Mobile",
                "domain": "t45vip.com"
            })
        });
        
        let loginInfo_string = await resp.text()
        let loginInfo = JSON.parse(loginInfo_string)

        let os = new URL(loginInfo.data.url).pathname.split("/").pop()?.replace(/\.[^/.]+$/, "") as string;
        //https://pglauncher.site/gameurl/latam/pgs/fac0f9e7-6740-429d-9a97-32fe7e0a6a33.html






        let params = new URLSearchParams({
            btt: "1",
            vc: "2",
            pf: "1",
            l: "pt",
            gi: this.gameDirId,
            os: os,
            otk: "BEA6D1DA-7B73-7271-7F1F-58D0E0742EF4"
        });
        url = "https://api.6pvx87oz6.com/web-api/auth/session/v2/verifyOperatorPlayerSession?traceId="+createTraceId_27()
         
        resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: params.toString()
        });

        let verifyInfo_string = await resp.text()
        let verifyInfo = JSON.parse(verifyInfo_string)
        
        let a = 1


        params = new URLSearchParams({
          
            eatk:verifyInfo.dt.eatk,
            atk: verifyInfo.dt.tk,
              btt: "1",
            pf: "1"
        });

        let traceId = createTraceId_27()
        
        
        url = `https://api.6pvx87oz6.com/${verifyInfo.dt.geu}v2/GameInfo/Get?traceId=`+ createTraceId_27()
    

        resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
             
            },
            body: params.toString()
        });

        let gameInfo_string = await resp.text()
        let gameInfo = JSON.parse(gameInfo_string)
        gameInfo.dt.ls.si = si
        gameInfo_string = JSON.stringify(gameInfo)

        Tool.writeFile(gameInfoPath,gameInfo_string)
        Tool.writeFile(verifySessionPath,verifyInfo_string)

    }
    async initSession() {
       

        const params = new URLSearchParams({
            btt: "1",
            vc: "0",
            pf: "1",
            l: "en",
            gi: this.gameDirId,
            tk: this.token,
            otk: "abcd1234abcd123432531532111kkafa"
        });

       
        let traceId = createTraceId_27()
        let url = `https://usapi.slot365games.com/web-api/auth/session/v2/verifySession?traceId=${traceId}`
        const resp = await fetch(url, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded"
            },
            body: params.toString()
        });
        let text = await resp.text()
        let sessionData = JSON.parse(text)
        console.log("initSession:", this.symbol)
        this.baseUrl = "https://usapi.slot365games.com/" + sessionData.dt.geu + "v2/spin"

        sessionData.dt.uiogc.bb = 0
        sessionData.dt.uiogc.gec = 1
        sessionData.dt.uiogc.tsn = 0
        sessionData.dt.uiogc.gsc = 0

        sessionData.dt.uiogc.grtp = 0
        sessionData.dt.uiogc.sp = 0

        sessionData.dt.uiogc.hwl = 0
        sessionData.dt.uiogc.sbb = 0

        text = JSON.stringify(sessionData)


        if (this.gameDir) {

        }

        let data_gameinfo = await this.sendGameInfo()
        await this.sendGameRule()
        await this.getT45Info(data_gameinfo.dt.ls.si)
    }

    private async bonusOnce() {
        const data: any = {
            ind: 0,
            l: this.lLines,
        };
        const raw = await this.request();
        this.lastRaw = raw;
        const obj = this.parseParams(raw);
        return obj;
    }

    private async spinOnce(one = false) {
        // 如果需要调用bonus，则调用doBonus
        if (this.needBonus) {
            this.needBonus = false; // 重置标志
            return await this.bonusOnce();
        }

        const raw = await this.request(one);
        this.lastRaw = raw;
        const obj = JSON.parse(raw);
        this.id = obj.dt.si.sid
        return obj;
    }

    // 仅在当前局累计的 spin 数量 > 1 (有连续滚动) 或标记 mo_c==1 时收集
    private async collectIfNeeded(tables: any[], obj: any) {
        if (obj.na == "c" && tables.length > 0) {
            const res = await this.request();
            return res.includes("balance");
        } else if (obj.na == "cb" && tables.length > 0) {
            const res = await this.request();
            return res.includes("balance");
        }
        return true;
    }

    // 重置当前局累计状态（不重置 index/counter，保持连续递增）
    private resetRound(tables: any[]) {
        tables.length = 0;
        this.free = false;
        this.needBonus = false; // 重置bonus标志
    }

     private checkTest(fd:any){
             let isStart = false
        for (let j = 0; j < fd.length - 1; j++) {


            let ts = 0
            let nextTs = 0
            if (fd[j].dt.si.fs) {
                if (fd[j].dt.si.fs.ts) {
                    ts = fd[j].dt.si.fs.ts
                }
                else if (fd[j].dt.si.fs.fsts) {
                    ts = fd[j].dt.si.fs.fsts
                }
            }

            if (fd[j + 1].dt.si.fs) {
                if (fd[j + 1].dt.si.fs.ts) {
                    nextTs = fd[j + 1].dt.si.fs.ts
                }
                else if (fd[j + 1].dt.si.fs.fsts) {
                    nextTs = fd[j + 1].dt.si.fs.fsts
                }
            }

            if (fd[j].dt.si.fs && !isStart) {
                if(fd[j].dt.si.sc >=4){
                  //  return true
                }
                isStart = true
            }

            if (ts > 0 && nextTs > 0 && nextTs > ts) {
                // return true
                if(fd[j + 1].dt.si.sc==3){
                    return true
                }
                if(fd[j ].dt.si.sc >=4 || fd[j + 1].dt.si.sc >=4||fd[j + 2]&&fd[j + 2].dt.si.sc >=4 ){
                   
                }
                break
            }

            //  let newTs = si.fs.t

        }
        return false

    }

    async runLoop(maxSamples = 1000) {
        if (!this.token) await this.initMeta();
        await this.initSession();
        const tablePath = path.join(this.gameDir, "payout-table.yml");
        const tables: any[] = [];
        let spinCount = 0;
        let lastSampleAt = Date.now();
        while (true) {
            const obj = await this.spinOnce(tables.length == 0);
            if (obj.dt.si.tbb > 0) {
                obj.dt.si.tbb = this.cs * this.maxLine
            }
            if(obj.dt.si.tb>0){
                obj.dt.si.tb=this.cs*this.maxLine
            }

            if (!this.free) {
                this.free = this.isFree(obj);
            }

            //const collect = this.isCollect(this.free, obj, tables.length);
            tables.push(obj);
            spinCount++;

            if (obj.err && obj.err.cd == '3202') {
                this.resetRound(tables)
                await this.sendCreateGame();
                await this.initSession()
                continue
            }
                

            //todo:免费跳过
            const isCollect = this.isCollect(obj);

            
            if (isCollect) {
                // 记录本次结束的 free 状态与结束原因
                this.appendSpinRaw(
                    "collect" +
                    "\n\t" +
                    "free=" +
                    (this.free ? "1" : "0") +
                    " collect=" +
                    "",
                );
 

                const bet = this.cs * this.maxLine//this.toNum(tables[0].dt.si.tbb)
                const win = this.toNum(tables[tables.length - 1].dt.si.aw);//xx
                const mul = bet > 0 ? new Decimal(win).div(bet).toNumber() : 0;
                const bucket = this.free ? "freegame" : this.bucket(mul);


               
                
               
                
                // 仅对 zero / x1_10 执行数量限制；>10x 桶无限写入
                // 如果设置了 noFreeLimit 且是免费转，则跳过免费转的限制
                const limited =
                    (bucket === "freegame" && !this.noFreeLimit) ||
                    bucket === "zero" ||
                    bucket === "x1_10"||
                    bucket === "x11_20"||
                    bucket === "x21_30";
                    
                // 检查是否达到采集限制
                let  shouldSkipDueToLimit =
                    limited &&
                    GLOBAL_LIMIT[bucket] !== undefined &&
                    this.payoutObj[bucket] &&
                    this.payoutObj[bucket].length >= GLOBAL_LIMIT[bucket];
 
                    
                    
                 /*let lowBets =[{"0.85":4},{"0.65":9},{"0.7":5}]
                for(let items of lowBets){
                    const [key, value] = Object.entries(items)[0];
                    if(Math.abs(Number(key) - mul) < 0.0001){
                        shouldSkipDueToLimit = false
                        break
                    }
                   // shouldSkipDueToLimit =true
                }*/

          

                if (shouldSkipDueToLimit) {
                    this.resetRound(tables);

                    


                    

                    // 检查是否所有类别都完成
                    const allCompleted = Object.keys(GLOBAL_LIMIT).every((k) => {
                        // 如果是免费转且设置了 noFreeLimit，则不检查免费转的限制
                        if (k === "freegame" && this.noFreeLimit) return true;
                        return (
                            this.payoutObj[k] && this.payoutObj[k].length >= GLOBAL_LIMIT[k]
                        );
                    });

                    if (allCompleted) {
                        // 更新采样完成状态到 YAML
                        await updateSamplingStatus(this.symbol, true);
                        console.log(`[${this.symbol}] 采样收集完成，所有类别均已达标`);
                        break;
                    }
                    continue;
                }

                if (this.free) {
                    let detailBucket = this.freeDetailBucket(mul)
                    if (detailBucket) {
                        if (this.checkFreeInFree(tables)) {
                            detailBucket = "free_free"
                            //this.resetRound(tables)
                            //continue
                        }
                        else{
                           // this.resetRound(tables)
                          //  continue
                        }

                        if (!GameCollector.detailFreePayoutObj) {
                            GameCollector.detailFreePayoutObj = {}
                        }
                        if (!GameCollector.detailFreePayoutObj[this.symbol]) {
                            GameCollector.detailFreePayoutObj[this.symbol] = {}
                        }
                
                        if (!GameCollector.detailFreePayoutObj[this.symbol][detailBucket]) {
                            GameCollector.detailFreePayoutObj[this.symbol][detailBucket] = []
                        }

                  

                        if (!(GameCollector.detailFreePayoutObj[this.symbol][detailBucket].length < GLOBAL_FREE_LIMIT[detailBucket])) {
                            this.resetRound(tables)
                            continue
                        }

                        GameCollector.detailFreePayoutObj[this.symbol][detailBucket].push(mul)
                        this.printFreeDetailBucket()
                    }
                    else {
                       // this.resetRound(tables)
                       // continue
                    }
                }
                else{
                          //  this.resetRound(tables)
                          //  continue
                        }
                
                if (mul > 270) {
                    this.resetRound(tables)
                    continue
                }

                if ( mul > 270 ||(!this.free && mul >100)|| (bucket == "over_30")&&this.payoutObj[bucket].length >50)  {
                    this.resetRound(tables)
                    continue
                }

                 if (GameCollector.data_records.get(tables[tables.length - 1].dt.si.hashr)) {
                    console.log("检测到重复数据 跳过")
                    this.resetRound(tables)
                    continue
                }
                GameCollector.data_records.set(tables[tables.length - 1].dt.si.hashr, tables)


                
                const content = JSON.stringify(tables.map((o) => JSON.stringify(o)));
                const fileName = this.makeDeterministicName(content);
                const outDir = path.join(this.gameDir, bucket);
                await fs.promises.mkdir(outDir, { recursive: true });
                const fullPath = path.join(outDir, fileName);
                if (!fs.existsSync(fullPath)) {
                     //let text_str = JSON.stringify(content)
                    await fs.promises.writeFile(fullPath, content, "utf-8");
                }

                // 更新统计
                this.payoutObj[bucket] = this.payoutObj[bucket] || [];
                this.payoutObj[bucket].push({
                    file: fileName,
                    mul: mul.toFixed(2),
                    startSc:0,
                    freeInFree:this.checkFreeInFree(tables) ?1:0,
                    check: false,
                });

                // 只对文件写入加锁
                await writeYamlLocked(tablePath, this.payoutObj);

                // 打印采集成功信息
                console.log(
                    `[${this.symbol}]${this.processorId ? "-P" + this.processorId : ""}`,
                    "采集成功",
                    bucket,
                    "样本",
                    this.payoutObj[bucket].length,
                    "倍数",
                    mul.toFixed(2),
                );
                // 不再写 end 到日志（仅保留 doSpin 原始行）
                this.resetRound(tables);

                // 检查是否完成采集
                const isCompleted = Object.keys(GLOBAL_LIMIT).every((k) => {
                    if (k === "freegame" && this.noFreeLimit) return true;
                    return this.payoutObj[k] && this.payoutObj[k].length >= GLOBAL_LIMIT[k];
                });

                if (isCompleted) {
                    break;
                }
                if (--maxSamples <= 0) {
                    break;
                }
            }

           
            if (this.isEnterFreeGame(obj) && false) {
                let initFile = "gameInfo_free.json";
                if (!fs.existsSync(initFile)) {
                    console.log("进免费游戏了重新获取下gameinfo")
                    this.resetRound(tables);
                    await this.sendGameInfo();
                }
            }
            // Watchdog: 若长时间无样本产出, 打印进度
            if (Date.now() - lastSampleAt > 15000) {
                lastSampleAt = Date.now();

                // 读取统计数据
                const stat = Object.keys(this.payoutObj)
                    .map(
                        (k) =>
                            k +
                            ":" +
                            (this.payoutObj[k]?.length || 0) +
                            "/" +
                            (GLOBAL_LIMIT[k] ?? "-"),
                    )
                    .join(" ");

                console.log(
                    `[${this.symbol}]${this.processorId ? "-P" + this.processorId : ""}`,
                    "进度",
                    stat,
                    "spins",
                    spinCount,
                );
            }
        }
    }

    private makeDeterministicName(raw: string) {
        const h = crypto.createHash("sha1").update(raw).digest("hex").slice(0, 6);
        let crc = 0 ^ -1;
        const buf = Buffer.from(raw, "utf8");
        for (let i = 0; i < buf.length; i++) {
            let x = (crc ^ buf[i]) & 0xff;
            for (let k = 0; k < 8; k++) x = x & 1 ? 0xedb88320 ^ (x >>> 1) : x >>> 1;
            crc = (crc >>> 8) ^ x;
        }
        const c8 = ((crc ^ -1) >>> 0).toString(16).padStart(8, "0");
        return `${h}${c8}.json`;
    }

    checkFreeInFree(tables: any) {
        let firstTs = 0
        for (let table of tables) {
            let fs = table.dt.si.fs
            if(!fs){
                fs = table.dt.si.bns
            }
            if(!fs){
                continue
            }
            if (fs.ts <= 0) {
                continue
            }
            if (firstTs == 0) {
                firstTs = fs.ts
            }

            if (firstTs < fs.ts) {
                let num = fs.ts - firstTs
                console.log(`检测到免中免,增加${num}次免费`)
                if(num<=4){
                    return false
                }
                return true
            }
        }
        return false
    }
}

export async function runCollectors(
    symbols: string[],
    concurrency = 2,
    processorsPerGame = 1,
) {
    await runParallel(symbols, concurrency, async (sym) => {
        if (processorsPerGame > 1) {
            // 多处理器模式：为同一个游戏创建多个独立的处理器
            console.log(`[游戏: ${sym}] 启动 ${processorsPerGame} 个处理器`);

            const processors: Promise<void>[] = [];
            for (let i = 0; i < processorsPerGame; i++) {
                const processorPromise = (async () => {
                    const gc = new GameCollector(sym, 0, `P${i + 1}`);
                    await gc.initMeta();
                    if (gc.earlyCompleted) return;
                    console.log(
                        `[${gc.symbol}][${gc.processorId}] Initialized`,
                        sym,
                        "start loop",
                    );
                    await gc.runLoop();
                })();
                processors.push(processorPromise);
            }

            // 等待所有处理器完成
            await Promise.all(processors);
        } else {
            // 单处理器模式（原有逻辑）
            const gc = new GameCollector(sym);
            await gc.initMeta();
            if (gc.earlyCompleted) return;
            console.log(`[${gc.symbol ?? "-"}] Initialized`, sym, "start loop");
            await gc.runLoop();
        }
    });
}

if (require.main === module) {
    // 支持命令行选项：
    // --concurrency=N : 设置游戏级并发数
    // --processors=N : 设置每个游戏的处理器数量
    // 其他参数：直接作为symbol列表
    const args = process.argv.slice(2);
    const concArgIndex = args.findIndex((a) => a.startsWith("--concurrency="));
    const processorsArgIndex = args.findIndex((a) =>
        a.startsWith("--processors="),
    );
    const concurrency =
        concArgIndex >= 0
            ? parseInt(args[concArgIndex].split("=")[1] || "2", 10)
            : 5;
    const processorsPerGame =
        processorsArgIndex >= 0
            ? parseInt(args[processorsArgIndex].split("=")[1] || "1", 10)
            :10;
    const directSymbols = args.filter(
        (a) => !a.startsWith("--concurrency=") && !a.startsWith("--processors="),
    );

    // 从 pg.yml 读取游戏列表
    const parseFromPpYml = async (): Promise<
        {
            symbol: string;
            nameZh?: string;
            winMode?: boolean;
            respin?: boolean;
            noFreeLimit?: boolean;
            noCheckSum?: boolean;
        }[]
    > => {
        const cfg = await loadConfig();
        return cfg.games
            .map((game) => ({
                symbol: game.symbol,
                nameZh: game.name,
                winMode: game.winMode || false,
                respin: game.respin || false,
                noFreeLimit: game.noFreeLimit || false,
                noCheckSum: game.noCheckSum || false,
            }));
    };

    const run = async () => {
        if (directSymbols.length) {
            console.log(`正在处理指定的符号: ${directSymbols.join(", ")}`);
            console.log(
                `并发设置: ${concurrency} 个游戏，每个游戏 ${processorsPerGame} 个处理器`,
            );
            await runCollectors(directSymbols, concurrency, processorsPerGame);
            return;
        }

        // 使用 pg.yml 作为数据源
        console.log(
            `从配置文件处理任务，并发设置: ${concurrency} 个游戏，每个游戏 ${processorsPerGame} 个处理器`,
        );
        const ppTasks = await parseFromPpYml();
        console.log("从 pg.yml 解析任务总数", ppTasks.length);

        if (!ppTasks.length) {
            console.warn("pg.yml 中没有在线游戏，使用默认示例 vswayschilhtwo");
            await runCollectors(["vswayschilhtwo"], concurrency, processorsPerGame);
            return;
        }

        const parallelStat = { started: 0, earlySkipped: 0 };
        await runParallel(
            ppTasks,
            concurrency,
            async (t: {
                symbol: string;
                nameZh?: string;
                winMode?: boolean;
                respin?: boolean;
                noFreeLimit?: boolean;
                noCheckSum?: boolean;
            }) => {
                // 为每个游戏启动多个处理器
                const processorPromises: Promise<{
                    started?: boolean;
                    earlySkipped?: boolean;
                }>[] = [];
                for (let i = 0; i < processorsPerGame; i++) {
                    const processorPromise = (async () => {

                        const gc = new GameCollector(t.symbol, (i + 1));
                        if (t.winMode) gc.winMode = true;
                        if (t.respin) gc.respin = true;
                        if (t.noFreeLimit) gc.noFreeLimit = true;
                        if (t.noCheckSum) gc.noCheckSum = true;
                        await gc.initMeta();
                        if (gc.earlyCompleted) {
                            console.log(
                                `[${gc.symbol ?? "-"}]-P${i + 1}`,
                                t.symbol,
                                "已完成采样限制(启动跳过)",
                            );
                            return { earlySkipped: true };
                        }
                        console.log(
                            `[${gc.symbol ?? "-"}]-P${i + 1} Initialized (pg.yml)`,
                            t.symbol,
                            "start loop",
                        );
                        await gc.runLoop();
                        return { started: true };
                    })();
                    processorPromises.push(processorPromise);
                }

                const results = await Promise.all(processorPromises);
                const gameStarted = results.some((r) => r.started);
                const gameEarlySkipped = results.every((r) => r.earlySkipped);

                if (gameStarted) parallelStat.started++;
                if (gameEarlySkipped) parallelStat.earlySkipped++;
            },
        );
        console.log(
            "并行统计 => 设定并行",
            concurrency,
            "个游戏，每游戏",
            processorsPerGame,
            "个处理器",
            "实际进入采集",
            parallelStat.started,
            "个游戏",
            "启动即跳过",
            parallelStat.earlySkipped,
            "个游戏",
        );
    };

   

    run().catch((e) => {
        console.error(e);
        process.exit(1);
    });

   
}
