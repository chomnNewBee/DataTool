
export type GameConfigItem = {
    game_id: number,
    game_name: string,
    game_game_zh:string
    group_freeInfree: boolean,
}

export type GameConfig = Array<GameConfigItem>

export type NormalSpinItem = {
    dt: {
        si: {
            hashr: string,
            sid: string,
            psid: string,
            sc: number,
            st: number,
            nst: number,
            gm: number,
            rl:number[],
            orl:number[],
            ctw:number,
            lwa:number,
            lw:Record<number,number>,
            tw:number,
            fs:any
        }
    }
};

export type ServerGameSpinItem = {

    mul: number,
    bBuyFree: boolean,
    bFree: boolean,
    bFreeInFree: boolean,
    IsFirstUse: boolean,
    spinList: Array<NormalSpinItem>,

}

export type WerewolfsHuntItem = NormalSpinItem & {
    dt: {
        si: NormalSpinItem["dt"]["si"] & {
            fs: {
                ams: Record<number, number[]>

            }
        }
    }
};

export type NinjaVsSamuraiItem = NormalSpinItem & {
    dt: {
        si: NormalSpinItem["dt"]["si"] & {
            fs: any,
            evt: number
        }
    }
};

export type DoomsdayRampageItem = NormalSpinItem & {
    dt: {
        si: NormalSpinItem["dt"]["si"] & {
            grs: number[],
            gm: number
        }
    }
};

export type GraffitiRushItem = NormalSpinItem & {
    dt: {
        si: NormalSpinItem["dt"]["si"] & {
            fs: any,
            iesf: number[],
            gm: number,
            sp: number[]
        },
       
    }
};

export type IncanWondersItem = NormalSpinItem & {
    dt: {
        si: NormalSpinItem["dt"]["si"] & {
            rcl: number
            bns:{
                ltw:number,
                mrl:number[]
            }
        };
    }
};

export type BuffaloWinItem = NormalSpinItem & {
    dt: {
        si: NormalSpinItem["dt"]["si"] & {
            scs: Record<number, number>,
            fs: {
                s: number,
                ts: number,
                rc: number,
                as: number,
                aw: number,
            }
        };
    }
};

export type BikiniParadiseItem = NormalSpinItem & {
    dt: {
        si: NormalSpinItem["dt"]["si"] & {
            wabm: number,
            wm: number,
            fs: {
                aw: number,
                nosa: number,
                s: number,
                ts: number,
                wpbn: number,
            }
        }
    }
}

export type EgyptBookOfMysteryItem = NormalSpinItem & {
    dt: {
        si: NormalSpinItem["dt"]["si"] & {
           
            fs: {
                fsm: number,
                ts:number,
                fss:number,
            }
        }
    }
}




export type MoveData = MoveDataItem[]

export type MoveDataItem = {
    filePath: string,
    newFilePath: string
}