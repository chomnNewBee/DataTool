import * as fs from 'fs';
import * as path from 'path';
import { rename, mkdir } from "fs/promises";
import { dirname } from "path";

class Tool {
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

    static existsFile(path: string) {
        if (fs.existsSync(path)) {
            return true
        }

        return false
    }
}


export default Tool