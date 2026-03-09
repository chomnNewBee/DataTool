import path from "path";
import Tool from "./Tool";
import { BikiniParadiseItem, BuffaloWinItem, IncanWondersItem, NormalSpinItem } from "./Type";
import { unlinkSync } from "fs";
import { count } from "console";

class CheckSourceFile {


    static checkGroupDataSt(gameName: string) {
        //                      hashr  filepath
        let stArr: Array<Array<number>> = []
        let entries = Tool.readAllFilesByPath("../data/" + gameName)

        for (let childEntrie of entries) {
            let dataFilePath = path.join(childEntrie.parentPath, childEntrie.name);
            let datas: NormalSpinItem[] = Tool.readJson(dataFilePath)

            let sts: number[] = []
            for (let data of datas) {
                if (sts[sts.length - 1] == data.dt.si.st) {
                   // continue
                }
                sts.push(data.dt.si.st)
            }
            sts.push(datas[datas.length - 1].dt.si.nst)

            let flag = true
            for (let item of stArr) {
                if (item.toString() == sts.toString()) {
                    flag = false
                    break
                }
            }
            if (flag) {
                stArr.push(sts)
            }

        }


        for (let sts of stArr) {
            console.log(JSON.stringify(sts))
        }

    }

    static checkGroupDataRcl(gameName: string) {
        //                      hashr  filepath
        let stArr: Array<Array<number>> = []
        let entries = Tool.readAllFilesByPath("../data/" + gameName)

        for (let childEntrie of entries) {
            let dataFilePath = path.join(childEntrie.parentPath, childEntrie.name);
            let datas: IncanWondersItem[] = Tool.readJson(dataFilePath)

            let rcls: number[] = []
            for (let data of datas) {
                if (rcls[rcls.length - 1] == data.dt.si.st) {
                    continue
                }
                rcls.push(data.dt.si.rcl)
            }

            let flag = true
            for (let item of stArr) {
                if (item.toString() == rcls.toString()) {
                    flag = false
                    break
                }
            }
            if (flag) {
                stArr.push(rcls)
            }

        }


        for (let sts of stArr) {
            console.log(JSON.stringify(sts))
        }

    }

    static checkGroupDataTest(gameName: string) {
        //                      hashr  filepath
        let stArr: Array<Array<number>> = []
        let entries = Tool.readAllFilesByPath("../data/" + gameName)

        let count = 0;
        for (let childEntrie of entries) {
            let dataFilePath = path.join(childEntrie.parentPath, childEntrie.name);
            let datas: any[] = Tool.readJson(dataFilePath)

            let sts: number[] = []
            for (let data of datas) {
                if (data.dt.si.st != 32) {
                    continue
                }
                if (data.dt.si.aw > 0) {
                    count++
                    break
                }
            }


        }

        console.log(count)


    }

    private static removeFile(filePath: string) {
        try {
            unlinkSync(filePath);
            console.log(`删除文件${filePath}`);
        } catch (err) {
            console.log(`删除文件失败${filePath} 错误输出:${err}`);
        }
    }


    private static removeRepeatFiles(filePaths: string[]) {
        for (let filePath of filePaths) {
            CheckSourceFile.removeFile(filePath)
        }
    }

    static check(gameName: string) {
        console.log("开始检查重复数据")
        //                      hashr  filepath
        let mapRecord = new Map<string, string>()
        let repeatFiles: string[] = []
        let highFiles: string[] = []
        let lowBetFileTable = new Map<string, string[]>()
        let lowBetFiles: string[] = []
        let entries = Tool.readAllFilesByPath("../data/" + gameName)
        let normalEntries = Tool.readNormalGroupFilesByPath("../data/" + gameName)



        for (let childEntrie of entries) {
            let dataFilePath = path.join(childEntrie.parentPath, childEntrie.name);
            let datas: NormalSpinItem[] = Tool.readJson(dataFilePath)
            let fileName = path.basename(dataFilePath);

            if (mapRecord.get(datas[0].dt.si.hashr)) {
                let filePath = mapRecord.get(datas[0].dt.si.hashr)
                if (filePath) {
                    repeatFiles.push(dataFilePath)
                }
                continue
            }
            mapRecord.set(datas[0].dt.si.hashr, dataFilePath)
        }

        for (let childEntrie of entries) {
            let dataFilePath = path.join(childEntrie.parentPath, childEntrie.name);
            let datas: NormalSpinItem[] = Tool.readJson(dataFilePath)
            let winBet = Tool.getWinBet(datas)
            if (winBet > 300) {
                highFiles.push(dataFilePath)
            }
        }

        console.log(`一共有${repeatFiles.length}条重复数据\n`)
        CheckSourceFile.removeRepeatFiles(repeatFiles)

        console.log(`一共有${highFiles.length}条超出260倍的数据\n`)
        CheckSourceFile.removeRepeatFiles(highFiles)



        normalEntries = Tool.readNormalGroupFilesByPath("../data/" + gameName, true)
        for (let childEntrie of normalEntries) {
            let dataFilePath = path.join(childEntrie.parentPath, childEntrie.name);
            let datas: NormalSpinItem[] = Tool.readJson(dataFilePath)
            let winBet = Tool.getWinBet(datas)

            if (winBet != 0 && winBet > 1) {
                continue
            }

            let tables = lowBetFileTable.get(winBet.toString())
            if (tables) {
                tables.push(dataFilePath)
            }
            else {
                lowBetFileTable.set(winBet.toString(), [dataFilePath])
            }
        }

        for (let [key, files] of lowBetFileTable) {
            if (files.length < 10) {
                lowBetFiles.push(...files)
            }
        }




        console.log(`一共有${lowBetFiles.length}条低倍并个数少于10条 \n`)
        CheckSourceFile.removeRepeatFiles(lowBetFiles)

        CheckSourceFile.checkErrorData(gameName)
    }

    static checkErrorData(gameName: string) {
        let callbackName: string = "checkErrorData_" + gameName
        let callback = (CheckSourceFile as any)[callbackName];
        callback && callback(gameName)
    }


    static checkErrorData_IncanWonders(gameName: string) {
        let entries = Tool.readAllFilesByPath("../data/" + gameName)
        let errorFiles = new Map<string, IncanWondersItem[]>()
        for (let childEntrie of entries) {
            let dataFilePath = path.join(childEntrie.parentPath, childEntrie.name);
            let datas: IncanWondersItem[] = Tool.readJson(dataFilePath)
            let old_ctw = 0
            let flag = false
            for (let data of datas) {
                if (!data.dt.si.bns) {
                    old_ctw = data.dt.si.ctw
                    continue
                }
                if (Math.abs(data.dt.si.bns.ltw - old_ctw) < 0.01) {
                    continue
                }

                flag = true
                data.dt.si.bns.ltw = old_ctw
            }
            if (flag) {
                errorFiles.set(dataFilePath, datas)
            }
        }

        console.log(`有${errorFiles.size}条数据错误`)
        for (let [filePath, datas] of errorFiles) {
            let content = JSON.stringify(datas.map((o) => JSON.stringify(o)));
            Tool.writeFile(filePath, content)
        }

    }

    /**
 * 删除棋盘数据中包含无效值 -1 的文件
 * @param gameName 游戏名称，用于定位数据目录
 */
    static checkErrorData_LeprechaunRiches(gameName: string): void {
        let entries = Tool.readAllFilesByPath("../data/" + gameName)
        let errorFiles = new Map<string, NormalSpinItem[]>()
        for (let childEntrie of entries) {
            let dataFilePath = path.join(childEntrie.parentPath, childEntrie.name);
            let datas: NormalSpinItem[] = Tool.readJson(dataFilePath)

            // 检查数据中是否包含 -1
            const hasInvalidData = datas.some(data => {
                // 防御性编程：确保路径存在
                const rl = data.dt.si.rl;
                return Array.isArray(rl) && rl.includes(-1);
            });

            if (hasInvalidData) {
                errorFiles.set(dataFilePath, datas)
            }


        }

        console.log(`有${errorFiles.size}条数据错误`)
        for (let [filePath, datas] of errorFiles) {
            let content = JSON.stringify(datas.map((o) => JSON.stringify(o)));
            Tool.removeFile(filePath)
        }
    }

    static checkErrorData_BuffaloWin(gameName: string) {
        let entries = Tool.readAllFilesByPath("../data/" + gameName)
        let errorFiles = new Map<string, BuffaloWinItem[]>()
        for (let childEntrie of entries) {
            let dataFilePath = path.join(childEntrie.parentPath, childEntrie.name);
            let datas: BuffaloWinItem[] = Tool.readJson(dataFilePath)
            for (let data of datas) {
                if (!data.dt.si.fs) {
                    continue
                }
                let keys = Object.keys(data.dt.si.fs)
                if (keys[0] != "s" || keys[1] != "ts" || keys[2] != "as" || keys[3] != "aw" || keys[4] != "rc") {
                    errorFiles.set(dataFilePath, datas)
                    break
                }
            }
        }

        for (let [filePath, datas] of errorFiles) {
            for (let item of datas) {
                let fs = item.dt.si.fs
                if (!fs) {
                    continue
                }
                let s = fs.s
                let ts = fs.ts
                let as = fs.as
                let aw = fs.aw
                let rc = fs.rc

                item.dt.si.fs = {
                    s: s,
                    ts: ts,
                    as: as,
                    aw: aw,
                    rc: rc,
                }

                let content = JSON.stringify(datas.map((o) => JSON.stringify(o)));
                Tool.writeFile(filePath, content)
            }
        }
        console.log(`有${errorFiles.size}条数据错误`)
    }

    static checkErrorData_BikiniParadise(gameName: string) {
        let entries = Tool.readAllFilesByPath("../data/" + gameName)
        let errorFiles_1 = new Map<string, BikiniParadiseItem[]>()
        let errorFiles_2 = new Map<string, BikiniParadiseItem[]>()

        let test = []
        for (let childEntrie of entries) {
            let dataFilePath = path.join(childEntrie.parentPath, childEntrie.name);
            let datas: BikiniParadiseItem[] = Tool.readJson(dataFilePath)

            test.push(datas)
            for (let data of datas) {
                if (data.dt.si.wm > 1) {
                    let score = Tool.roundNumber(data.dt.si.tw / data.dt.si.wm)
                    if (Math.abs(score - data.dt.si.wabm) > 0.001) {
                        errorFiles_1.set(dataFilePath, datas)
                        break
                    }
                }
            }

            for (let data of datas) {
                if (!data.dt.si.fs) {
                    continue
                }
                let keys = Object.keys(data.dt.si.fs)
                if (keys[0] != "aw" || keys[1] != "s" || keys[2] != "ts" || keys[3] != "nosa" || keys[4] != "wpbn") {
                    errorFiles_2.set(dataFilePath, datas)
                    break
                }
            }
        }

        console.log(`一共有${errorFiles_1.size}条wabm值不对的数据`)
        console.log(`一共有${errorFiles_2.size}条fs顺序不对的数据`)
        for (let [filePath, datas] of errorFiles_1) {
            for (let data of datas) {
                if (data.dt.si.wm == 1 || data.dt.si.tw == 0) {
                    continue
                }

                data.dt.si.wabm = Tool.roundNumber(data.dt.si.tw / data.dt.si.wm)
            }
            Tool.writeFile_Data(filePath, datas)
        }

        for (let [filePath, datas] of errorFiles_2) {
            for (let data of datas) {
                if (!data.dt.si.fs) {
                    continue
                }
                let aw = data.dt.si.fs.aw
                let nosa = data.dt.si.fs.nosa
                let s = data.dt.si.fs.s
                let ts = data.dt.si.fs.ts
                let wpbn = data.dt.si.fs.wpbn
                data.dt.si.fs = {
                    aw: aw,
                    s: s,
                    ts: ts,
                    nosa: nosa,
                    wpbn: wpbn
                }
            }
            Tool.writeFile_Data(filePath, datas)
        }

    }



    static checkRemoveFreeNumber(gameName: string) {
        let entries = Tool.readAllFilesByPath("../data/" + gameName)
        let freeFiles = new Map<string, NormalSpinItem[]>()
        let removeFreeFiles = new Map<string, NormalSpinItem[]>()


        for (let childEntrie of entries) {
            let dataFilePath = path.join(childEntrie.parentPath, childEntrie.name);
            let datas: NormalSpinItem[] = Tool.readJson(dataFilePath)
            if (!datas[datas.length - 1].dt.si.fs) {
                continue;
            }
            if (Tool.checkFreeInFree(datas)) {
                continue
            }
            freeFiles.set(dataFilePath, datas)
        }


        let checkFree = function (freeFiles: Map<string, NormalSpinItem[]>, datas: NormalSpinItem[]) {
            let winBet = Tool.getWinBet(datas)
            if (winBet < 50) {
                return false
            }

            for (let [filePath, free_datas] of freeFiles) {
                if (datas[0].dt.si.hashr == free_datas[0].dt.si.hashr) {
                    continue
                }
                let wb = Tool.getWinBet(free_datas)
                if (Math.abs(wb - winBet) < 2) {
                    return true
                }
            }
            return false
        }
        for (let [filePath, datas] of freeFiles) {
            if (!checkFree(freeFiles, datas)) {
                continue;
            }
            freeFiles.delete(filePath)
            removeFreeFiles.set(filePath, datas)
        }

        console.log(`一共要删除${removeFreeFiles.size}多的数据`)
        for (let [filePath, datas] of removeFreeFiles) {
            Tool.removeFile(filePath)
        }
    }
}


if (require.main === module) {

    let names = ["AsgardianRising",
        "BikiniParadise",
        "BuffaloWin",
        "ButterflyBlossom",
        "CircusDelight",
        "DoomsdayRampage",
        "FortuneOx",
        "FortuneTiger",
        "GraffitiRush",
        "IncanWonders",
        "JewelsOfProsperity",
        "JurassicKingdom",
        "LegendaryMonkeyKing",
        "MafiaMayhem",
        "MuayThaiChampion",
        "NinjaVsSamurai",
        "OishiDelights",
        "ProsperityFortuneTree",
        "RiseOfApollo",
        "SharkBounty",
        "WerewolfsHunt"]
    CheckSourceFile.checkGroupDataSt("Genies3Wishes")

    // CheckSourceFile.checkGroupDataTest("ChocolateDeluxe")
    //CheckSourceFile.checkGroupDataRcl("IncanWonders")
    for (let name of names) {
        //console.log(`${name}:`)
        //CheckSourceFile.checkGroupDataSt(name)

    }
    //CheckSourceFile.checkGroupDataSt("HoneyTrapofDiaoChan")
    //CheckSourceFile.checkGroupDataTest("EgyptBookOfMystery")
    // CheckSourceFile.check("SharkBounty")

    //CheckSourceFile.checkRemoveFreeNumber("SafariWilds")
}

export default CheckSourceFile

//4重转至赢
