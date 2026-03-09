import CheckSourceFile from "./CheckSourceFile"
import Constant from "./Constant"
import GameConfigMgr from "./GameConfigMgr"
import ReGroup from "./ReGroup"
import Tool from "./Tool"
import { ServerGameSpinItem } from "./Type"

class GenServerConfig {


    build(gameDirName: string) {
        let cfg = GameConfigMgr.getConfigByName(gameDirName)
        if(!cfg){
            return
        }
        console.log(`build->${gameDirName}`)

        CheckSourceFile.check(gameDirName)

        let target = Constant.ROOT_DATA + gameDirName +"/"+ (cfg.group_freeInfree?",false":",true")
        let success = Tool.runCommand(Constant.SERVER_TOOL, "", { input: target })
        if (!success) {
            console.log("生成game_spin.json失败")
            return
        }
        console.log("生成game_spin.json成功")

        let game_spin_json_file = Constant.ROOT_DATA + gameDirName + "/" + "game_spin.json"
        this.checkSouceWinMulByGameSpinFile(game_spin_json_file)
        ReGroup.ReGroup(gameDirName)

        this.zipGameDataFile(gameDirName)

        console.log("已完成")
    }


    checkSouceWinMulByGameSpinFile(game_spin_json_file: string) {
        let game_spin_json = Tool.readServerJson(game_spin_json_file)
        this.checkSouceWinMul(game_spin_json)
    }

    checkSouceWinMul(game_spin_json: ServerGameSpinItem[]) {
        console.log(`开始检查数据,一共有${game_spin_json.length}条数据`)
        let errorCount = 0
        for (let game_spine_line_json of game_spin_json) {
            let spinList = game_spine_line_json.spinList
            let winBet = Tool.getWinBet(spinList)
            if (this.checkMul(game_spine_line_json.mul, winBet)) {
                errorCount++
            }
        }

        console.log(`有${errorCount}条数据倍数对不上\n`)
    }


    checkMul(mul1: number, mul2: number) {
        let m1 = Math.round(mul1 * 100)
        let m2 = Math.round(mul2 * 100)
        if (m1 == m2) {
            return false
        }
        return true
    }

    zipGameDataFile(gameDirName: string) {
        let cfg = GameConfigMgr.getConfigByName(gameDirName)
        if(!cfg){
            console.log("zipGameDataFile:->找不到游戏配置")
            return
        }

        let zip_temp_data = Constant.ZIP_TEMP_DATA
        let dir_gameid = `${zip_temp_data}/${cfg.game_id}`
        let dir_gameid_res_zip = `${zip_temp_data}/${cfg.game_id}/${gameDirName}.zip`
        let dir_source_game = Constant.ROOT_DATA + gameDirName

        let file_game_info_json = Constant.ROOT_DATA + gameDirName + "/game_info.json"
        let file_game_spin_json = Constant.ROOT_DATA + gameDirName + "/game_spin.json"
        
        let file_game_info_json_to_path = `${dir_gameid}/game_info.json`
        let file_game_spin_json_to_path = `${dir_gameid}/game_spin.json`

        Tool.makeDir(zip_temp_data)
        Tool.makeDir(dir_gameid)
        Tool.runCommand("7z", `a -tzip ${dir_gameid_res_zip} ${dir_source_game}`)
        Tool.copyFile(file_game_info_json,file_game_info_json_to_path)
        Tool.copyFile(file_game_spin_json,file_game_spin_json_to_path)

        let dir = `${dir_gameid}/`
        let todir = `${dir_gameid}.zip`
        Tool.runCommand("7z", `a -tzip ${todir} ${dir}`)
        return
    }

}

Tool.cleanDir(Constant.ZIP_TEMP_DATA)
let buildServerConfig = new GenServerConfig()
buildServerConfig.build("AlchemyGold")
buildServerConfig.build("MajesticTreasures")
// buildServerConfig.build("BattlegroundRoyale")