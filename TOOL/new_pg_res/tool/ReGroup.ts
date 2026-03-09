import * as fs from 'fs';
import * as path from 'path';
import Tool from './Tool';
import { NinjaVsSamuraiEnumType, WerewolfsHuntEnumType } from './EnumType';
import { DoomsdayRampageItem, EgyptBookOfMysteryItem, GraffitiRushItem, IncanWondersItem, MoveData, NinjaVsSamuraiItem, NormalSpinItem, WerewolfsHuntItem } from './Type';
import Register from './Register';

class ReGroup {
    static register = new Register()
    static FreeGameDir = "freegame"

    static CreateMoveDataItem(filePath: string, gameName: string, specialName: string, fileName: string) {
        let item = {
            filePath: filePath,
            newFilePath: "../data/" + gameName + `/${specialName}/` + fileName
        }

        return item
    }

    static MoveFiles(moveDatas: MoveData) {
        for (let moveData of moveDatas) {
            let f1 = moveData.filePath
            let f2 = moveData.newFilePath
            Tool.moveFile(f1, f2)
        }

        if (moveDatas.length == 0) {
            console.log("没有可分组的数据")
            return
        }

        console.log(`有${moveDatas.length}条数据添加进特殊分组\n`)
    }

    static ReGroup_WerewolfsHunt(datas: WerewolfsHuntItem[]) {
        for (let data of datas) {
            let fs = data.dt.si.fs
            if (!fs) {
                continue
            }
            let ams = fs.ams

            for (let [pos, values] of Object.entries(ams)) {
                // if (values[0] == WerewolfsHuntEnumType.YellowMoon || values[0] == WerewolfsHuntEnumType.RedMoon || values[0] == WerewolfsHuntEnumType.BuleMoon) {
                //   return "special_moon_1"
                //}
            }
        }

        return ""
    }

    static ReGroup_NinjaVsSamurai(datas: NinjaVsSamuraiItem[]) {
        for (let data of datas) {
            let fs = data.dt.si.fs
            if (fs) {
                continue
            }
            let evt = data.dt.si.evt
            if (evt == NinjaVsSamuraiEnumType.Ninja) {
                return "special_ninja_1"
            }

            if (evt == NinjaVsSamuraiEnumType.Samurai) {
                return "special_samurai_2"
            }
        }

        return ""
    }

    static ReGroup_GraffitiRush(datas: GraffitiRushItem[]) {
        for (let data of datas) {
            let fs = data.dt.si.fs
            if (fs) {
                continue
            }

            let gm = data.dt.si.gm
            let iesf = data.dt.si.iesf

            if (gm > 1) {
                return "special_multiplier_1"
            }

            if (iesf) {
                return "special_transformation_2"
            }
        }

        return ""
    }

    static ReGroup_DoomsdayRampage(datas: DoomsdayRampageItem[]) {
        for (let data of datas) {
            if (data.dt.si.gm > 1) {
                return ReGroup.FreeGameDir
            }
        }

        return ""
    }

    static ReGroup_IncanWonders(datas: IncanWondersItem[]) {

        for (let data of datas) {
            //全屏大满贯
            if (data.dt.si.gm > 1) {
                return "special_screen_1"
            }
        }

        for (let data of datas) {
            //重转至赢
            if (data.dt.si.rcl == 1 || data.dt.si.rcl == 2) {
                return "special_rewin_2"
            }
        }

        for (let data of datas) {
            //双轴模式
            if (data.dt.si.rcl == 0) {
                return "special_double_3"
            }
        }

        return ""
    }

    static ReGroup_EgyptBookOfMystery(datas: EgyptBookOfMysteryItem[]) {

        for (let data of datas) {
            if (data.dt.si.st != 32) {
                continue
            }

            let sc = data.dt.si.sc
            let fss = data.dt.si.fs.fss
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
                return "freegame"
            }
            if (bool_free_mode_1_sc5) {
                return "freegame_mode1sc5_1"
            }
            if (bool_free_mode_1_sc6) {
                return "freegame_mode1sc6_2"
            }

            if (bool_free_mode_2_sc4) {
                return "freegame_mode2sc4_3"
            }
            if (bool_free_mode_2_sc5) {
                return "freegame_mode2sc5_4"
            }
            if (bool_free_mode_2_sc6) {
                return "freegame_mode2sc6_5"
            }

            if (bool_free_mode_3_sc4) {
                return "freegame_mode3sc4_6"
            }
            if (bool_free_mode_3_sc5) {
                return "freegame_mode3sc5_7"
            }
            if (bool_free_mode_3_sc6) {
                return "freegame_mode3sc6_8"
            }

            if (bool_free_mode_4_sc4) {
                return "freegame_mode4sc4_9"
            }
            if (bool_free_mode_4_sc5) {
                return "freegame_mode4sc5_10"
            }
            if (bool_free_mode_4_sc6) {
                return "freegame_mode4sc6_11"
            }
            if (data.dt.si.sc == 6) {
                console.log(`ts:${data.dt.si.fs.ts}  s:${data.dt.si.fs.fsm}`,)
            }

            return ""
        }


        return ""
    }

    static ReGroup_Genies3Wishes(datas: EgyptBookOfMysteryItem[]) {

        for (let data of datas) {
            

            return ""
        }


        return ""
    }

    static ReGroup(gameName: string, isAllGroup: boolean = false) {
        console.log("开始检查分组")
        if (!ReGroup.register.get(gameName)) {
            console.log("无需额外分组")
            return
        }

        let entries = Tool.readNormalGroupFilesByPath("../data/" + gameName)
        if (isAllGroup) {
            entries = Tool.readAllFilesByPath("../data/" + gameName)
        }


        let moveDatas: MoveData = []

        for (let childEntrie of entries) {
            let dataFilePath = path.join(childEntrie.parentPath, childEntrie.name);
            let datas: NormalSpinItem[] = Tool.readJson(dataFilePath)
            let fileName = path.basename(dataFilePath);

            let reGroupFunc = ReGroup.register.get(gameName)
            let result = reGroupFunc(datas)
            if (result == "" || !result) {
                continue
            }
            if (path.basename(path.dirname(dataFilePath)) == result) {
                continue
            }

            moveDatas.push(ReGroup.CreateMoveDataItem(dataFilePath, gameName, result, fileName))
        }

        ReGroup.MoveFiles(moveDatas)

        entries = fs.readdirSync("../data/" + gameName, { withFileTypes: true });
        for (let childEntrie of entries) {
            let dirPath = path.join(childEntrie.parentPath, childEntrie.name);
            if (!childEntrie.isDirectory()) {
                continue
            }
            Tool.removeEmptyDir(dirPath);
        }
    }

}


//ReGroup.register.register("WerewolfsHunt", ReGroup.ReGroup_WerewolfsHunt)
ReGroup.register.register("NinjaVsSamurai", ReGroup.ReGroup_NinjaVsSamurai)
ReGroup.register.register("GraffitiRush", ReGroup.ReGroup_GraffitiRush)
ReGroup.register.register("DoomsdayRampage", ReGroup.ReGroup_DoomsdayRampage)
ReGroup.register.register("IncanWonders", ReGroup.ReGroup_IncanWonders)
ReGroup.register.register("EgyptBookOfMystery", ReGroup.ReGroup_EgyptBookOfMystery)
ReGroup.register.register("Genies3Wishes", ReGroup.ReGroup_Genies3Wishes)

if (require.main === module) {
    ReGroup.ReGroup("Genies3Wishes", true)
}

export default ReGroup