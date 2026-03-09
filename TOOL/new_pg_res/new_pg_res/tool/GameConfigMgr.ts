import { GameConfig } from "./Type"

class GameConfigMgr {
    private static cfg: GameConfig = []

    private static addConfig(game_name: string, game_id: number, game_game_zh = "", group_freeInfree: boolean = true) {
        this.cfg.push({
            game_name: game_name,
            game_id: game_id,
            game_game_zh: game_game_zh,
            group_freeInfree: group_freeInfree
        })
    }

    private static initCfg() {
        this.cfg = []
        //GameConfigMgr.addConfig("FutebolFever", 1111111, "热血足球") 
        //GameConfigMgr.addConfig("HoneyTrapofDiaoChan", 1111111, "夜袭貂蝉") 
        GameConfigMgr.addConfig("TotemWonders", 8865910, "三星堆")
        GameConfigMgr.addConfig("ButterflyBlossom", 8865220, "蝶恋花")
        GameConfigMgr.addConfig("CircusDelight", 8865125, "欢乐嘉年华")
        GameConfigMgr.addConfig("MuayThaiChampion", 8865600, "拳霸")
        GameConfigMgr.addConfig("NinjaVsSamurai", 8864920, "忍者VS武侍")
        GameConfigMgr.addConfig("SharkBounty", 8865420, "鲨鱼赏金",false)
        GameConfigMgr.addConfig("BuffaloWin", 8865300, "美洲野牛")
        GameConfigMgr.addConfig("WerewolfsHunt", 8865500, "狼人传说")
        GameConfigMgr.addConfig("MafiaMayhem", 8864500, "黑帮风云")
        GameConfigMgr.addConfig("LegendaryMonkeyKing", 8864600, "美猴王传奇")
        GameConfigMgr.addConfig("RiseOfApollo", 8864700, "太阳神传说")
        GameConfigMgr.addConfig("GraffitiRush", 8864810, "街头涂鸦")
        GameConfigMgr.addConfig("DoomsdayRampage", 8865700, "狂暴少女")
        GameConfigMgr.addConfig("AsgardianRising", 8863900, "维京纪元")
        GameConfigMgr.addConfig("JurassicKingdom", 8863200, "恐龙帝国", false)
        GameConfigMgr.addConfig("ProsperityFortuneTree", 8863400, "黄金摇钱树")
        GameConfigMgr.addConfig("OishiDelights", 8866320, "美食夏日祭")
        GameConfigMgr.addConfig("FortuneTiger", 8860606, "虎虎生财")
        GameConfigMgr.addConfig("IncanWonders", 8866010, "印加传奇")
        GameConfigMgr.addConfig("BikiniParadise", 8866110, "比基尼天堂") 

        GameConfigMgr.addConfig("TheGreatIcescape", 8864000, "冰雪大冲关") 
        GameConfigMgr.addConfig("ChocolateDeluxe", 8866210, "真爱巧克力") 
        GameConfigMgr.addConfig("EgyptBookOfMystery", 8865000, "埃及探秘宝典",false) 
        GameConfigMgr.addConfig("OrientalProsperity", 8866420, "江山美景图",false) 

        
        GameConfigMgr.addConfig("SuperGolfDrive", 8866620, "超级高尔夫") 
        GameConfigMgr.addConfig("GuardiansofIceFire", 8866720, "冰火双娇",false) 

        GameConfigMgr.addConfig("SafariWilds", 8866820, "非洲大冒险") 
        GameConfigMgr.addConfig("WildCoaster", 8866920, "疯赚过山车") 
        GameConfigMgr.addConfig("DestinyofSunMoon", 8867020, "日月星辰") 
        GameConfigMgr.addConfig("SongkranSplash", 11111, "泰嗨泼水节") 
        GameConfigMgr.addConfig("JackTheGiantHunter", 11111, "魔豆传奇") 
        GameConfigMgr.addConfig("CruiseRoyale", 11111, "皇家邮轮",false) 
        GameConfigMgr.addConfig("CandyBonanza", 11111, "糖心风暴") 
        GameConfigMgr.addConfig("MysticPotion", 11111, "魔法药水") 
        GameConfigMgr.addConfig("UltimateStriker", 11111, "魔法药水") 
        GameConfigMgr.addConfig("SpiritedWonders", 8872400, "百鬼夜行") 
        GameConfigMgr.addConfig("AlchemyGold", 8869400, "炼金工房")
        GameConfigMgr.addConfig("MajesticTreasures", 8869500, "宝石传奇")

    }

    static getConfigByName(name: string) {
        if(GameConfigMgr.cfg.length == 0){
            GameConfigMgr.initCfg()
        }

        for (let item of GameConfigMgr.cfg) {
            if (item.game_name == name) {
                return item
            }
        }
        return null
    }

}

export default GameConfigMgr