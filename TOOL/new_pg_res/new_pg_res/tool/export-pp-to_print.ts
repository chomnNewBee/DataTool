import * as fs from 'fs';
import * as path from 'path';
import * as XLSX from 'xlsx';
import * as yaml from 'js-yaml';
import Decimal from 'decimal.js';
import { json } from 'stream/consumers';
import { readFileSync, writeFileSync } from 'fs';
import Tool from "./Tool"
import ExtraDetail from "./ExtraDetail"
import Register from './Register';
import GameConfigMgr from './GameConfigMgr';

function isDirectory(path: string): boolean {
    try {
        return fs.statSync(path).isDirectory();
    } catch (err) {
        return false; // 不存在或不是目录
    }
}


function getGameDetailData(gameName: string, normalData: any, freeData: any) {
    let cfg = GameConfigMgr.getConfigByName(gameName)
    if (!cfg) {
        console.log("没有游戏配置")
        return
    }
    Tool.printDataNumber(normalData, freeData)

    let detailCallback = Tool.getClassFunction<ExtraDetail>(ExtraDetail, "getDetail_" + gameName)
    let defaultDetailCallback = Tool.getClassFunction<ExtraDetail>(ExtraDetail, "getDefaultDetail")
    if (detailCallback) {
        detailCallback(normalData, freeData)
        return
    }
    defaultDetailCallback(normalData, freeData, cfg.group_freeInfree)

}

function readLastGameDetailJson(path: string) {
    try {
        let filePath = path + '/lastDetail.json'
        const raw = readFileSync(filePath, 'utf-8');
        const lastData = JSON.parse(raw);
        return lastData
    }
    catch (e) {
        return null
    }

    return null
}

function readJsonFilesFromDir(dirPath: string, gameName = "") {

    console.log(`${gameName}:`)
    let entries = fs.readdirSync(dirPath, { withFileTypes: true });
    entries = entries.filter(item => item.name !== ".git" && (gameName != "" && item.name == gameName));

    let detailDatas = []

    for (let entry of entries) {
        let fullPath = path.join(dirPath, entry.name);
        let readDetail = readLastGameDetailJson(fullPath)
        if (readDetail && gameName == "") {
            detailDatas.push(readDetail)
            continue
        }



        let path_freegame = Tool.getFreeGameDirByPath(fullPath)
        let chillPaths = Tool.getNormalDirByPath(fullPath)
        let normalResults = [];
        let freeResults = [];


        for (let chillPath of chillPaths) {
            if (!isDirectory(chillPath)) {
                continue
            }

            let childEntries = fs.readdirSync(chillPath, { withFileTypes: true });
            for (let childEntry of childEntries) {
                let filePath = path.join(chillPath, childEntry.name);
                try {
                    const content = fs.readFileSync(filePath, 'utf-8');
                    const parsed: Array<string> = JSON.parse(content);
                    const parsed_changed = parsed.map(str => JSON.parse(str));
                    normalResults.push(parsed_changed);
                } catch (err) {
                    console.warn(`无法解析文件 ${fullPath}:`, err);
                }
            }
        }

        do {
            if (path_freegame.length == 0) {
                break
            }

            for (let path_child_freegame of path_freegame) {
                let childEntries = fs.readdirSync(path_child_freegame, { withFileTypes: true });
                for (let childEntry of childEntries) {
                    let filePath = path.join(path_child_freegame, childEntry.name);
                    try {
                        const content = fs.readFileSync(filePath, 'utf-8');
                        const parsed: Array<string> = JSON.parse(content);
                        const parsed_changed = parsed.map(str => JSON.parse(str));
                        freeResults.push(parsed_changed);
                    } catch (err) {
                        console.warn(`无法解析文件 ${fullPath}:`, err);
                    }
                }

            }
        } while (0)


        getGameDetailData(entry.name, normalResults, freeResults)


    }

}


readJsonFilesFromDir("../data/", "MajesticTreasures")//args[0]?args[0]:"")//args[1])

