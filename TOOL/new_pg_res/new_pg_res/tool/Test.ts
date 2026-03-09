import Tool from "./Tool";
const GLOBAL_FREE_LIMIT: { [k: string]: number } = {
    x31_x35: 2,
    x36_x40: 2,
    x41_x45: 2,
    x46_x50: 2,
    x51_x55: 2,
    x56_x60: 2,
    x61_x70: 2,
    x71_x80: 2,
    x81_x90: 2,
    x91_x100: 2,

    x101_x120: 3,
    x121_x135: 3,
    x136_x150: 3,
    x151_x170: 5,
    x171_x190: 5,
    x191_x210: 5,
    x211_x230: 5,

};

function getBucketTwoNumber(str: string) {
    let [part1, part2] = str.split('_');
    let min = Number(part1.slice(1));
    let max = Number(part2.slice(1));
    return [min, max]
}

function findDetailBucket(mul:number){
    for(let key in GLOBAL_FREE_LIMIT){
        let bet_range = getBucketTwoNumber(key)
        if(mul >= bet_range[0] && mul <= bet_range[1]){
            return key
        }
    }
}
function freeDetailBucket(mul: number) {
    return findDetailBucket(mul)
}

let a  = freeDetailBucket(50)
let c = 1