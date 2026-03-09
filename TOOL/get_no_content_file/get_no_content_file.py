import os
import requests

import json
from typing import Any, Dict

def read_json_file():
    with open("./cfg.json", 'r', encoding='utf-8') as file:
        data = json.load(file)
    return data

def save_json_file(data):
   with open('./cfg.json', 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=4)

 


def read_files_recursively(folder_path):
    for item in os.listdir(folder_path):
        full_path = os.path.join(folder_path, item)
        if os.path.isdir(full_path):
            # 如果是文件夹，递归调用
            read_files_recursively(full_path)
        elif os.path.isfile(full_path):
            try:
                text = None
                with open(full_path, 'r', encoding='utf-8') as f:
                    content = f.read()
                    if(content.startswith("No Content: https:")):
                        print(content)
                        text = content
                if text:
                    download_pic(content,full_path)
            except Exception as e:
                pass
                #print(f"无法读取文件 {full_path}：{e}")

#No Content: https://static.whwz8187o.com/shared/c5869829a5/0c21d96060.3d5d6.webp
def download_pic(url:str,save_path:str):
    prefix = "No Content: "
    if url.startswith(prefix):
        url = url[len(prefix):]


    # 图片的 URL
    image_url = url

    # 发起 GET 请求
    response = requests.get(image_url)

    # 检查请求是否成功
    if response.status_code == 200:
        # 保存图片到本地
        with open(save_path, "wb") as f:
            f.write(response.content)
        print("图片下载成功！")
    else:
        print("图片下载失败，状态码：", response.status_code)

# 示例调用
#read_files_recursively("/你的文件夹路径")
readData = read_json_file()
dirs = os.listdir("D:/work/KingBoxPGSS2026NoCode/")
result = [item for item in dirs if item not in readData["record"]]

for name in result:
    read_files_recursively("D:/work/KingBoxPGSS2026NoCode/"+ name)
    readData["record"].append(name)

save_json_file(readData)
