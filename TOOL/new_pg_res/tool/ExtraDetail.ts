import { NinjaVsSamuraiEnumType } from "./EnumType"
import GameConfigMgr from "./GameConfigMgr"
import Tool from "./Tool"
import { NinjaVsSamuraiItem, DoomsdayRampageItem, GraffitiRushItem, NormalSpinItem, IncanWondersItem, BuffaloWinItem, EgyptBookOfMysteryItem } from "./Type"

//额外筛选倍率
class ExtraDetail {

    static getDefaultDetail(normalData: NormalSpinItem[][], freeData: any[], groupFreeInFree: boolean = true) {

        let normalBets: number[] = []
        let freeBets: number[] = []
        let freeInFreeBets: number[] = []

        for (let i = 0; i < normalData.length; i++) {
            let winBet = Tool.getWinBet(normalData[i])
            normalBets.push(winBet)
        }


        for (let i = 0; i < freeData.length; i++) {
            let freeResult = freeData[i]
            let winBet = Tool.getWinBet(freeResult)
            if (Tool.checkFreeInFree(freeResult) && groupFreeInFree) {
                freeInFreeBets.push(winBet)
                continue
            }

            freeBets.push(winBet)
        }

        ExtraDetail.checkLowWinBetNumber(normalData)

        Tool.printArray(normalBets, "普通倍率集合:")
        Tool.printTable(normalBets, "普通倍率数量表:")

        Tool.printArray(freeBets, "免费倍率集合:")
        Tool.printTable(freeBets, "免费倍率数量表:")



        Tool.printArray(freeInFreeBets, "免中免倍率集合:")
        Tool.printTable(freeInFreeBets, "免中免倍率数量表:")
        // Tool.printServerCfg(freeBets)


        // Tool.saveServerCfgText(normalBets, freeBets, freeInFreeBets)

        return groupFreeInFree
    }

    static checkLowWinBetNumber(normalData: any[]) {
        let normalBets = []
        for (let i = 0; i < normalData.length; i++) {
            let winBet = Tool.getWinBet(normalData[i])
            if (winBet > 1) {
                continue
            }
            normalBets.push(winBet)
        }

        let table = Tool.arrayToBetTable(normalBets)
        let lowArray = []
        for (let key in table) {
            if (table[key] >= 10) {
                continue
            }
            lowArray.push({ [key]: table[key] })
        }

        if (lowArray.length == 0) {
            return
        }

        console.log("警告低倍数不足!!!")
        console.log(JSON.stringify(lowArray))

    }

    static getDetail_CircusDelight(normalData: any[], freeData: NormalSpinItem[][]) {
        let start3ScBets = []
        let start4ScBets = []
        let start5ScBets = []

        let inFreeScatter3Bets = []
        let inFreeScatter4Bets = []
        let inFreeScatter5Bets = []

        for (let i = freeData.length - 1; i >= 0; i--) {
            let items = freeData[i]
            for (let item of items) {
                if (item.dt.si.st == 2 && item.dt.si.sc > 0) {
                    if (item.dt.si.sc == 3) {
                        inFreeScatter3Bets.push(Tool.getWinBet(items))
                        break
                    }

                    if (item.dt.si.sc == 4) {
                        inFreeScatter4Bets.push(Tool.getWinBet(items))
                        break
                    }

                    if (item.dt.si.sc == 5) {
                        inFreeScatter5Bets.push(Tool.getWinBet(items))
                        break
                    }
                }
            }
        }

        for (let i = freeData.length - 1; i >= 0; i--) {
            let items = freeData[i]
            let item = items[0]

            if (item.dt.si.sc == 3) {
                start3ScBets.push(Tool.getWinBet(items))
                //  freeData.splice(i, 1)
                continue
            }

            if (item.dt.si.sc == 4) {
                start4ScBets.push(Tool.getWinBet(items))
                //  freeData.splice(i, 1)
                continue
            }

            if (item.dt.si.sc == 5) {
                start5ScBets.push(Tool.getWinBet(items))
                // freeData.splice(i, 1)
                continue
            }

            console.log("不可能 绝对不可能")

        }
        ExtraDetail.getDefaultDetail(normalData, freeData)

        Tool.printArray(start3ScBets, "开始出现3个scatter数量:")
        Tool.printArray(start4ScBets, "开始出现4个scatter数量:")
        Tool.printArray(start5ScBets, "开始出现5个scatter数量:")

        Tool.printArray(inFreeScatter3Bets, "免费中出现3个scatter数量:")
        Tool.printArray(inFreeScatter4Bets, "免费中出现4个scatter数量:")
        Tool.printArray(inFreeScatter5Bets, "免费中出现5个scatter数量:")
        //Tool.printTable(betModeBets, "倍数模式出现的倍率(个数统计):")
    }
    //赏金鲨鱼
    static getSharkBountyExtraDetail(normalData: any[], freeData: any) {


        let results = []
        for (let i = 0; i < freeData.length; i++) {
            let fd = freeData[i]


            let result: any = []
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

                if (ts > 0 && !result.includes(ts)) {
                    result.push(ts)
                }

                //  let newTs = si.fs.ts


            }

            results.push(result.length)
            let a = 1
        }

        const uniqueArr = [...new Set(results)];
        let c = 0
    }

    //狼人传奇
    static getWerewolfsHuntDetail(normalData: any[], freeSData: any[]) {

        let moonBets: any[] = []

        function findMoon(arrData: any[]) {
            for (let i = arrData.length - 1; i >= 0; i--) {
                let fd = arrData[i]
                gotoLabel: for (let freeItem of fd) {
                    if (!freeItem.dt.si.fs) {
                        continue
                    }
                    if (!freeItem.dt.si.fs.ams) {
                        continue
                    }

                    for (const [value, item] of Object.entries(freeItem.dt.si.fs.ams)) {
                        let item_a = item as Number[]
                        if (item_a[0] == 22) {
                            moonBets.push(Tool.getWinBet(fd))
                            arrData.splice(i, 1)
                            break gotoLabel
                            if (item_a[1] == 0) {
                                console.log("黄月亮有了")
                            }
                        }
                        if (item_a[0] == 23) {
                            moonBets.push(Tool.getWinBet(fd))
                            arrData.splice(i, 1)
                            break gotoLabel
                            if (item_a[1] == 0) {
                                console.log("红月亮有了")
                            }
                        }
                        if (item_a[0] == 24) {
                            moonBets.push(Tool.getWinBet(fd))
                            arrData.splice(i, 1)
                            break gotoLabel
                            if (item_a[1] == 0) {
                                console.log("蓝月亮有了")
                            }
                        }
                    }
                }

            }
        }

        findMoon(normalData)
        findMoon(freeSData)

        Tool.printArray(moonBets, "月亮出现的倍率:")
        Tool.printTable(moonBets, "月亮出现的倍率(个数统计):")

        //todo:
        // Tool.getDefaultDetail()
        ExtraDetail.getDefaultDetail(normalData, freeSData)
        let c = 1
    }






    //美洲野牛
    static getDetail_BuffaloWin_(normalData: BuffaloWinItem[][], freeData: BuffaloWinItem[][]) {
        let normalMaxGm = 0
        let freeMaxGm = 0
        let normalLenght = 0
        let freeLenght = 0
        let normalItemNum = 0
        let freeItemNum = 0
        for (let items of normalData) {
            let gm = items[items.length - 1].dt.si.gm
            if (normalMaxGm < gm) {
                normalMaxGm = gm
            }

            let len = items[items.length - 1].dt.si.rl.length / 4
            if (normalLenght < len) {
                normalLenght = len
            }
        }

        for (let items of freeData) {
            for (let item of items) {
                let gm = item.dt.si.gm
                if (freeMaxGm < gm) {
                    freeMaxGm = gm
                }

                let len = item.dt.si.rl.length / 4
                if (freeLenght < len) {
                    freeLenght = len
                }
            }
        }


        for (let items of normalData) {
            let item = items[items.length - 1]
            for (let key in item.dt.si.scs) {
                let itemNum = item.dt.si.scs[key]
                if (normalItemNum < itemNum) {
                    normalItemNum = itemNum
                }
            }
        }


        for (let items of freeData) {
            let item = items[items.length - 1]
            for (let key in item.dt.si.scs) {
                let itemNum = item.dt.si.scs[key]
                if (freeItemNum < itemNum) {
                    freeItemNum = itemNum
                }
            }
        }

        console.log("普通游戏最大乘倍数:", normalMaxGm)
        console.log("免费游戏最大乘倍数:", freeMaxGm)

        console.log("普通游戏横向最大长度:", normalLenght)
        console.log("免费游戏横向最大长度:", freeLenght)

        console.log("普通游戏中奖图标最大个数:", normalItemNum)
        console.log("免费游戏中奖图标最大个数:", freeItemNum)

        let a = 1
    }

    //虎虎生财
    static getDetail_FortuneTiger(normalData: any, freeData: any) {
        let normalBetsByNum: any = {}
        let normalBets: any[] = []
        let freeBetsByNum: any = {}
        let freeBets: any[] = []

        for (let items of normalData) {
            let normalResult = items
            if (normalResult.length > 1) continue

            let itemValue = normalResult[normalResult.length - 1]
            let si = itemValue.dt.si
            let winBet = Math.ceil(((si.aw * 100) / (si.tbb * 100)) * 100) / 100

            normalBets.push(winBet)
            if (!normalBetsByNum[winBet]) {
                normalBetsByNum[winBet] = 1
            }
            else {
                normalBetsByNum[winBet]++
            }
        }

        for (let items of normalData) {
            let normalResult = items
            if (normalResult.length <= 1) continue

            let itemValue = normalResult[normalResult.length - 1]
            let si = itemValue.dt.si
            let winBet = Math.ceil(((si.aw * 100) / (si.tbb * 100)) * 100) / 100

            freeBets.push(winBet)
            if (!freeBetsByNum[winBet]) {
                freeBetsByNum[winBet] = 1
            }
            else {
                freeBetsByNum[winBet]++
            }
        }

        freeBets = Array.from(new Set(freeBets)).sort((a, b) => a - b);
        normalBets = Array.from(new Set(normalBets)).sort((a, b) => a - b);
        normalBetsByNum = Object.fromEntries(
            Object.entries(normalBetsByNum).sort(([k1], [k2]) => Number(k1) - Number(k2))
        );

        freeBetsByNum = Object.fromEntries(
            Object.entries(freeBetsByNum).sort(([k1], [k2]) => Number(k1) - Number(k2))
        );

        console.log("normalBets:", JSON.stringify(normalBets))
        console.log("normalBetsByNum:", JSON.stringify(normalBetsByNum))
        console.log("freeBets:", JSON.stringify(freeBets))
        console.log("freeBetsByNum:", JSON.stringify(freeBetsByNum))
        let aa = 1
    }

    //忍者刺客
    static getDetail_NinjaVsSamurai(normalData: NinjaVsSamuraiItem[][], freeData: any) {
        let renZheBets = []
        let wuShiBets = []
        for (let i = normalData.length - 1; i >= 0; i--) {
            let items = normalData[i]
            let item = items[items.length - 1]
            if (item.dt.si.evt == NinjaVsSamuraiEnumType.Samurai) {
                wuShiBets.push(Tool.getWinBet(items))
                normalData.splice(i, 1)
            }

            if (item.dt.si.evt == NinjaVsSamuraiEnumType.Ninja) {
                renZheBets.push(Tool.getWinBet(items))
                normalData.splice(i, 1)
            }
        }

        ExtraDetail.getDefaultDetail(normalData, freeData)

        Tool.printArray(renZheBets, "忍者模式出现的倍率:")
        Tool.printTable(renZheBets, "忍者模式出现的倍率(个数统计):")

        Tool.printArray(wuShiBets, "武士模式出现的倍率:")
        Tool.printTable(wuShiBets, "武士模式出现的倍率(个数统计):")
    }

    //狂暴少女
    static getDetail_DoomsdayRampage(normalData: DoomsdayRampageItem[][], freeData: any) {
        let turntableData = []
        for (let i = normalData.length - 1; i >= 0; i--) {
            let items = normalData[i]
            let item = items[items.length - 1]

            //大于1是转盘模式
            if (item.dt.si.gm > 1) {
                turntableData.push(items)
                normalData.splice(i, 1)
            }
        }

        ExtraDetail.getDefaultDetail(normalData, turntableData)

    }

    //接口涂鸦
    static getDetail_GraffitiRush(normalData: GraffitiRushItem[][], freeData: any) {
        //倍数模式
        let betModeBets = []
        //翻转模式
        let reModeBets = []

        let maxGm = 0
        let maxGmBet = 0

        for (let i = normalData.length - 1; i >= 0; i--) {
            let items = normalData[i]
            let item = items[items.length - 1]

            if (item.dt.si.gm > maxGm) {
                maxGm = item.dt.si.gm
                maxGmBet = Tool.getWinBet(items)
            }


            //大于1是倍数模式
            if (item.dt.si.gm > 1) {
                betModeBets.push(Tool.getWinBet(items))
                normalData.splice(i, 1)
                continue
            }

            //大于1是倍数模式
            if (item.dt.si.iesf) {
                reModeBets.push(Tool.getWinBet(items))
                normalData.splice(i, 1)
                continue
            }

        }

        ExtraDetail.getDefaultDetail(normalData, freeData)

        Tool.printArray(betModeBets, "倍数模式出现的倍率:")
        Tool.printTable(betModeBets, "倍数模式出现的倍率(个数统计):")

        Tool.printArray(reModeBets, "翻转模式出现的倍率:")
        Tool.printTable(reModeBets, "翻转模式出现的倍率(个数统计):")

        console.log("---------------------其他---------------------")
        console.log(`普通最大乘倍数:${maxGmBet}  对应赢分倍率${maxGmBet}`)


        /*
        Tool.printArray(betModeBets, "倍数模式集合:")
        Tool.printServerCfg(betModeBets)
        Tool.printArray(reModeBets, "翻转模式集合:")
        Tool.printServerCfg(reModeBets)
        */

    }

    //印加传奇
    static getDetail_IncanWonders(normalData: IncanWondersItem[][], freeData: any) {
        //重转至赢模式
        let respinBets: number[] = []
        //双轴模式
        let doubleBets: number[] = []
        //全屏模式
        let fullBets: number[] = []


        for (let i = normalData.length - 1; i >= 0; i--) {
            let items = normalData[i]

            for (let item of items) {
                //全屏大满贯
                if (item.dt.si.gm > 1) {
                    fullBets.push(Tool.getWinBet(items))
                    normalData.splice(i, 1)
                    break
                }
            }
        }

        for (let i = normalData.length - 1; i >= 0; i--) {
            let items = normalData[i]

            //重转至赢
            for (let item of items) {
                if (item.dt.si.rcl == 1 || item.dt.si.rcl == 2) {
                    respinBets.push(Tool.getWinBet(items))
                    normalData.splice(i, 1)
                    break
                }
            }
        }

        for (let i = normalData.length - 1; i >= 0; i--) {
            let items = normalData[i]

            //双轴模式
            for (let item of items) {
                if (item.dt.si.rcl == 0) {
                    doubleBets.push(Tool.getWinBet(items))
                    normalData.splice(i, 1)
                    break
                }
            }
        }



        ExtraDetail.getDefaultDetail(normalData, freeData)



        Tool.printArray(fullBets, "全屏模式出现的倍率:")
        Tool.printTable(fullBets, "全屏模式出现的倍率(个数统计):")

        Tool.printArray(respinBets, "重转至赢模式出现的倍率:")
        Tool.printTable(respinBets, "重转至赢模式出现的倍率(个数统计):")

        Tool.printArray(doubleBets, "双轴模式出现的倍率:")
        Tool.printTable(doubleBets, "双轴模式出现的倍率(个数统计):")
    }


    //埃及探秘宝典
    static getDetail_EgyptBookOfMystery(normalData: EgyptBookOfMysteryItem[][], freeData: EgyptBookOfMysteryItem[][]) {
        let mode_1_sc4_bets: number[] = []
        let mode_1_sc5_bets: number[] = []
        let mode_1_sc6_bets: number[] = []

        let mode_2_sc4_bets: number[] = []
        let mode_2_sc5_bets: number[] = []
        let mode_2_sc6_bets: number[] = []

        let mode_3_sc4_bets: number[] = []
        let mode_3_sc5_bets: number[] = []
        let mode_3_sc6_bets: number[] = []

        let mode_4_sc4_bets: number[] = []
        let mode_4_sc5_bets: number[] = []
        let mode_4_sc6_bets: number[] = []

        let arr = [
            [mode_1_sc4_bets, mode_1_sc5_bets, mode_1_sc6_bets],
            [mode_2_sc4_bets, mode_2_sc5_bets, mode_2_sc6_bets],
            [mode_3_sc4_bets, mode_3_sc5_bets, mode_3_sc6_bets],
            [mode_4_sc4_bets, mode_4_sc5_bets, mode_4_sc6_bets],
        ]



        for (let i = freeData.length - 1; i >= 0; i--) {
            let items = freeData[i]
            for (let item of items) {
                if (item.dt.si.st != 32) {
                    continue
                }

                let sc = item.dt.si.sc
                let fss = item.dt.si.fs.fss
                let bool_free_mode_1_sc4 = fss == 0 && sc == 4
                let bool_free_mode_1_sc5 = fss == 0 && sc == 5
                let bool_free_mode_1_sc6 = fss == 0 && sc == 6

                let bool_free_mode_2_sc4 = fss == 1 && sc == 4
                let bool_free_mode_2_sc5 = fss == 1 && sc == 5
                let bool_free_mode_2_sc6 = fss == 1 && sc == 6

                let bool_free_mode_3_sc4 = fss == 2 && sc == 4
                let bool_free_mode_3_sc5 = fss == 2 && sc == 5
                let bool_free_mode_3_sc6 = fss == 2 && sc == 6

                let bool_free_mode_4_sc4 = fss == 3 && sc == 4
                let bool_free_mode_4_sc5 = fss == 3 && sc == 5
                let bool_free_mode_4_sc6 = fss == 3 && sc == 6
                if (bool_free_mode_1_sc4) {
                    mode_1_sc4_bets.push(Tool.getWinBet(items))
                    freeData.splice(i, 1)
                    break
                }

                if (bool_free_mode_1_sc5) {
                    mode_1_sc5_bets.push(Tool.getWinBet(items))
                    freeData.splice(i, 1)
                    break
                }

                if (bool_free_mode_1_sc6) {
                    mode_1_sc6_bets.push(Tool.getWinBet(items))
                    freeData.splice(i, 1)
                    break
                }

                if (bool_free_mode_2_sc4) {
                    mode_2_sc4_bets.push(Tool.getWinBet(items))
                    freeData.splice(i, 1)
                    break
                }

                if (bool_free_mode_2_sc5) {
                    mode_2_sc5_bets.push(Tool.getWinBet(items))
                    freeData.splice(i, 1)
                    break
                }

                if (bool_free_mode_2_sc6) {
                    mode_2_sc6_bets.push(Tool.getWinBet(items))
                    freeData.splice(i, 1)
                    break
                }

                if (bool_free_mode_3_sc4) {
                    mode_3_sc4_bets.push(Tool.getWinBet(items))
                    freeData.splice(i, 1)
                    break
                }

                if (bool_free_mode_3_sc5) {
                    mode_3_sc5_bets.push(Tool.getWinBet(items))
                    freeData.splice(i, 1)
                    break
                }

                if (bool_free_mode_3_sc6) {
                    mode_3_sc6_bets.push(Tool.getWinBet(items))
                    freeData.splice(i, 1)
                    break
                }

                if (bool_free_mode_4_sc4) {
                    mode_4_sc4_bets.push(Tool.getWinBet(items))
                    freeData.splice(i, 1)
                    break
                }

                if (bool_free_mode_4_sc5) {
                    mode_4_sc5_bets.push(Tool.getWinBet(items))
                    freeData.splice(i, 1)
                    break
                }

                if (bool_free_mode_4_sc6) {
                    mode_4_sc6_bets.push(Tool.getWinBet(items))
                    freeData.splice(i, 1)
                    break
                }

                console.log("未被分组免费警告!")
                break
            }
        }

        ExtraDetail.getDefaultDetail(normalData, freeData, false)
        let detail_string1 = "";
        let detail_string2 = "";
        let detail_string3 = "";
        for (let i = 0; i < arr.length; i++) {
            let ar = arr[i]
            for (let j = 0; j < ar.length; j++) {
                //  if(i == 0 &&j==0)continue
                let bets = ar[j]
                detail_string1 += Tool.printArray(bets, `免费模式 选项${i + 1} scatter:${j + 4} 出现的倍率:`).replace(/\n/g, "")

                detail_string2 += Tool.printTable(bets, `免费模式 选项${i + 1} scatter:${j + 4} 出现的倍率(个数统计):`).replace(/\n/g, "")

                detail_string3 += Tool.getServerCfgStringByArray(bets) + ",\n\n\n"

                detail_string1 += "  "
                detail_string2 += "  "

            }
        }



        Tool.writeFile("free_epypt.txt", detail_string1 + detail_string2)
        Tool.writeFile("free_server.txt", detail_string3)
    }

    //阿拉丁神灯
    static getDetail_Genies3Wishes(normalData: NormalSpinItem[][], freeData: NormalSpinItem[][]) {
        let mode1_count12__bets: number[] = []
        let mode2_count8__bets: number[] = []
        let mode3_count5__bets: number[] = []


        let arr = [mode1_count12__bets, mode2_count8__bets, mode3_count5__bets]



        for (let i = freeData.length - 1; i >= 0; i--) {
            let items = freeData[i]
            for (let item of items) {
                if (item.dt.si.st != 3) {
                    continue
                }

                let ts = item.dt.si.fs.ts

                if (ts == 12) {
                    mode1_count12__bets.push(Tool.getWinBet(items))
                    freeData.splice(i, 1)
                    break
                }

                if (ts == 8) {
                    mode2_count8__bets.push(Tool.getWinBet(items))
                    freeData.splice(i, 1)
                    break
                }

                if (ts == 5) {
                    mode3_count5__bets.push(Tool.getWinBet(items))
                    freeData.splice(i, 1)
                    break
                }

            
                console.log("未被分组免费警告!")
                break
            }
        }

        ExtraDetail.getDefaultDetail(normalData, freeData, false)
        let detail_string1 = "";
        let detail_string2 = "";
        let detail_string3 = "";
        for (let i = 0; i < arr.length; i++) {
            let bets = arr[i]

            //  if(i == 0 &&j==0)continue
 
            detail_string1 += Tool.printArray(bets, `免费模式 选项${i + 1}  出现的倍率:`).replace(/\n/g, "")

            detail_string2 += Tool.printTable(bets, `免费模式 选项${i + 1}  出现的倍率(个数统计):`).replace(/\n/g, "")

            detail_string3 += Tool.getServerCfgStringByArray(bets) + ",\n\n\n"

            detail_string1 += "  "
            detail_string2 += "  "


        }



        Tool.writeFile("free_epypt.txt", detail_string1 + detail_string2)
        Tool.writeFile("free_server.txt", detail_string3)
    }

}
export default ExtraDetail

