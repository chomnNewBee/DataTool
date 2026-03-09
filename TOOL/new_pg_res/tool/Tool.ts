import * as fs from 'fs';
import * as path from 'path';
import { rename, mkdir } from "fs/promises";
import { dirname } from "path";
import { execSync } from 'child_process';
import { json } from 'stream/consumers';
import { ServerGameSpinItem } from './Type';
import crypto from "crypto";

class Tool {
    static roundNumber(value: number) {
        let newValue = Math.round(value * 100) / 100
        return newValue
    }
    static getWinBet(data: any[]) {
        let item = data[data.length - 1]
        let si = item.dt.si
        let winBet = Tool.roundNumber((si.aw * 100) / (si.tbb * 100))
        return winBet
    }

    static arrayToBetTable(array: number[]) {
        let result: Record<string, number> = {}
        for (let num of array) {
            let key = String(num);
            result[key] = (result[key] || 0) + 1;
        }
        return result
    }

    static sortArrayDeduplicate(array: number[]) {
        let result1 = Array.from(new Set(array))
        let result2 = result1.sort((a, b) => a - b);
        return result2
    }

    static sortTableDeduplicate(table: Record<string, number>) {
        let result1 = Object.entries(table)
        let result2 = result1.sort(([k1], [k2]) => Number(k1) - Number(k2))
        let result3 = Object.fromEntries(result2);
        return result3
    }


    static getPrintTableString(table: Record<string, number>) {
        let content = ""
        let sortedKeys = Object.keys(table).map(Number).sort((a, b) => a - b);
        for (const key of sortedKeys) {
            if (content != "") {
                content += ","
            }
            content += `"${key}":${table[key]}`
        }

        return `{${content}}`
    }

    static getArrayString(array: number[]) {
        let content = ""
        for (let value of array) {
            if (content != "") {
                content += ","
            }
            content += `${value}`
        }

        return `[${content}]`
    }


    static printTable(array: number[], preStr: string = "") {
        let table = Tool.arrayToBetTable(array)
        let content = Tool.getPrintTableString(table)
        let printString = `${preStr}\n${content}`
        console.log(printString)
        return printString
    }

    static printArray(array: number[], preStr: string = "") {
        let array1 = Tool.sortArrayDeduplicate(array)
        let content = Tool.getArrayString(array1)
        let printString = `${preStr}\n${content}`
        console.log(printString)
        return printString
    }

    static printServerCfg(array: number[]) {
        let cfgString = Tool.getServerCfgStringByArray(array)
        console.log("权重配置:\n", cfgString)
    }

    static getServerCfgStringByArray(array: number[]) {
        let weights: number[] = []

        array = Tool.sortArrayDeduplicate(array)
        for (let value of array) {
            weights.push(10)
        }

        let arrayStr = Tool.getArrayString(array)
        let weightsStr = Tool.getArrayString(weights)

        let cfgString = `${arrayStr},\n${weightsStr}`
        return cfgString
    }

    static printDataNumber(normalData: any[], freeData: any[]) {
        let allNumber = normalData.length + freeData.length
        console.log(`普通数据:${normalData.length}条`)
        console.log(`免费数据:${freeData.length}条`)
        console.log(`一共:${allNumber}条`)

    }

    static saveServerCfgText(normalBets:number[],freeBets:number[],freeInFreeBets:number[]){
        let str1 = Tool.getServerCfgStringByArray(normalBets)
        let str2 = Tool.getServerCfgStringByArray(freeBets)
        let str3 = Tool.getServerCfgStringByArray(freeInFreeBets)
        let str4 = ""

        if (freeBets.length) {
            str4 = `"buyfreeProValues":[\n${str2}\n]\n`
        }

        str1 = `"ProValues":[\n${str1}\n],\n`
        str2 = `"freeProValues":[\n${str2}\n],\n`
        str3 = `"freeInfreeProValues":[\n${str3}\n],\n`

        let result = str1+= str2+= str3+ str4
        Tool.writeFile("./server_cfg.txt",result)

    }

 

    static checkFreeInFree(freeResult: any) {

        let tss = []
        for (let j = 0; j < freeResult.length; j++) {
            let itemValue = freeResult[j]
            if (itemValue.dt.si.fs && itemValue.dt.si.fs.ts && itemValue.dt.si.fs.ts > 0) {
                tss.push(itemValue.dt.si.fs.ts)
            }
            if (itemValue.dt.si.fs && itemValue.dt.si.fs.fsts && itemValue.dt.si.fs.fsts > 0) {
                tss.push(itemValue.dt.si.fs.fsts)
            }
        }

        if (Tool.checkTsArray(tss)) {
            return true
        }

        return false

    }

    static checkTsArray(tss: any) {
        let startTs = tss[0]
        for (let i = 1; i < tss.length; i++) {
            if (tss[i] != startTs) {
                return true
            }
        }
        return false
    }

    static readJson(path: string) {
        let content = fs.readFileSync(path, 'utf-8');
        let parsed: Array<string> = JSON.parse(content);
        let jsonObj = parsed.map(str => JSON.parse(str));
        return jsonObj
    }

    static readServerJson(path: string): ServerGameSpinItem[] {
        let content = fs.readFileSync(path, 'utf-8'); // 阻塞读取整个文件
        let lines = content.split(/\r?\n/); // 按行分割（兼容 Windows 和 Unix）
        let result = []
        for (let line of lines) {
            if (line.trim()) {
                let jsonLine = JSON.parse(line)
                for (let i = 0; i < jsonLine.spinList.length; i++) {
                    jsonLine.spinList[i] = JSON.parse(jsonLine.spinList[i])
                }
                result.push(jsonLine)
            }
        }
        return result
    }

 

    static readFilesByPath(path: string) {
        let entries = fs.readdirSync(path, { withFileTypes: true });
        return entries
    }

    static readAllFilesByPath(dirPath: string) {
        let entries = fs.readdirSync(dirPath, { withFileTypes: true });
        entries = entries.filter(item => item.isDirectory());
        let resultEntries = []


        for (let entrie of entries) {

            let c_filePath = path.join(entrie.parentPath, entrie.name);
            let c_entrie = fs.readdirSync(c_filePath, { withFileTypes: true });
            resultEntries.push(...c_entrie)
        }
        return resultEntries
    }

    static readNormalGroupFilesByPath(dirPath: string,isFilterSpecial:boolean = false) {
        let entries = fs.readdirSync(dirPath, { withFileTypes: true });
        entries = entries.filter(item => item.isDirectory());
        if(isFilterSpecial){
            entries = entries.filter(item => !item.name.startsWith("special_"));
        }
        // entries = entries.filter(item => !item.name.startsWith("zero"));
        entries = entries.filter(item => !item.name.startsWith("freegame"));
        let resultEntries = []


        for (let entrie of entries) {

            let c_filePath = path.join(entrie.parentPath, entrie.name);
            let c_entrie = fs.readdirSync(c_filePath, { withFileTypes: true });
            resultEntries.push(...c_entrie)
        }
        return resultEntries
    }

 

    static getNormalDirByPath(dirPath: string) {
        let entries = fs.readdirSync(dirPath, { withFileTypes: true });
        entries = entries.filter(item => item.isDirectory());
        entries = entries.filter(item => !item.name.startsWith("freegame"));
        let resultEntries = []

        for (let entrie of entries) {
            let c_filePath = path.join(entrie.parentPath, entrie.name);
            resultEntries.push(c_filePath)
        }
        return resultEntries
    }

    static getFreeGameDirByPath(dirPath: string) {
        let entries = fs.readdirSync(dirPath, { withFileTypes: true });
        entries = entries.filter(item => item.isDirectory());
        entries = entries.filter(item => item.name.startsWith("freegame"));
        let resultEntries = []

        for (let entrie of entries) {
            let c_filePath = path.join(entrie.parentPath, entrie.name);
            resultEntries.push(c_filePath)
        }
        if (resultEntries.length == 0) {
            return ""
        }
        return resultEntries
    }

    static removeFile(filePath: string) {
        if (fs.existsSync(filePath)) {
            try {
                fs.unlinkSync(filePath);
            }
            catch (err) {
                console.error('删除文件时出错：', err);
            }
        }
    }

    static writeFile(filePath: string, content: string) {
        try {

            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(filePath, content);
        }
        catch (err) {
            console.error('写入文件时出错：', err);
        }
    }

    static writeFile_Data(filePath: string, datas: any[]) {
        let content = JSON.stringify(datas.map((o) => JSON.stringify(o)));
        Tool.writeFile(filePath, content)
    }


    static moveFile(filePath: string, newFilePath: string) {
        try {
            // 1. 创建目标目录（如果不存在） 
            let newDirName = dirname(newFilePath)
            fs.mkdirSync(newDirName, { recursive: true });
            fs.renameSync(filePath, newFilePath);

            console.log(`移动文件->file:${filePath}  new file:${newFilePath}`);
        } catch (err) {
            console.error("移动失败：", err);
        }
    }

    static removeEmptyDir(dir: string) {
        const files = fs.readdirSync(dir);
        if (files.length === 0) {
            fs.rmdirSync(dir);
            return true;
        }
        return false;
    }

    

    static runCommand(cmd: string, args: string = "", extra: { input: any } = { input: null }) {
        try {
            let cmdCode = `${cmd} ${args}`
            console.log(cmdCode)
            const output = execSync(cmdCode, {
                input: extra.input,
                encoding: 'utf-8'
            });
            return true
        } catch (err) {
            console.log('执行失败:', err);
            return false
        }
    }

    static makeDir(dirPath: string) {
        // 检查文件夹是否已存在
        if (!fs.existsSync(dirPath)) {
            fs.mkdirSync(dirPath, { recursive: true });
        }
    }

    static copyFile(s: string, t: string) {
        try {
            fs.copyFileSync(s, t);
        } catch (err) {
            console.error('复制文件失败:', err);
        }
    }

    static cleanDir(dirPath: string) {
        let entriess = fs.readdirSync(dirPath, { withFileTypes: true });
        for (let entries of entriess) {
            let filePath = path.join(entries.parentPath, entries.name);
            if (entries.isFile()) {
                Tool.removeFile(filePath)
            }
            if (entries.isDirectory()) {
                fs.rmSync(filePath, { recursive: true, force: true });
            }
        }
    }

    static makeDeterministicName(raw: string) {
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

    static randomInt(min:number,max:number){
        let scale = Math.random()
        let rndNum  = min + Math.floor((max - min-1) * scale)
        return rndNum

    }

    static deepClone<T>(obj:T):T{
        return JSON.parse(JSON.stringify(obj))
    }

    static getClassFunction<T>(classIns:T,funcString:string) {
        let callback = (classIns as any)[funcString];
        return callback
    }
}

export default Tool
