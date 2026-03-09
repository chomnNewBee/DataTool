from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlparse, parse_qs
import os
import mimetypes
import requests
from pathlib import Path
import sys
PROJECT_PATH = "D:/my_project/project_python"
RES_LINK = "https://static.whwz8187o.com/"
def download404Res(url,save_path):
    try:
        headers = {
            "User-Agent": "Mozilla/5.0"
        }
        response = requests.get(url, headers=headers)

        response.raise_for_status()  # 如果状态码不是 200，会抛出异常

        save_dir = os.path.dirname(save_path)
        if not os.path.exists(save_dir):
            print("保存目录不存在,创建目录:",save_dir)
            os.makedirs(save_dir)

        with open(save_path, "wb") as f:
            f.write(response.content)

        print(f"图片已保存到: {save_path}")
    except requests.exceptions.HTTPError as e:
        print(f"HTTP 错误: {e}")
    except requests.exceptions.RequestException as e:
        print(f"请求失败: {e}")

class SmartHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        # 解析 URL
        parsed_url = urlparse(self.path)
        path = parsed_url.path.lstrip("/")
        query_params = parse_qs(parsed_url.query)

        # 构造文件路径
        file_path = os.path.join(PROJECT_PATH, path)

        if os.path.isfile(file_path):
            mime_type, _ = mimetypes.guess_type(file_path)
            mime_type = mime_type or "application/octet-stream"

            with open(file_path, "rb") as f:
                content = f.read()

            self.send_response(200)
            self.send_header("Content-type", mime_type)
            self.send_header("Content-Length", str(len(content)))
            self.end_headers()
            self.wfile.write(content)
 
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"404 Not Found")
            print(f"[404] 文件未找到: {path}")

            p = Path(path)
            parts = p.parts[1:]  # 去掉第一个部分
            new_path = str(Path(*parts).as_posix())
            download404Res(RES_LINK + path,file_path)

    def log_message(self, format, *args):
        return

if __name__ == "__main__":
    #if len(sys.argv) < 3:
    #    print("参数有误,程序退出")
    #PROJECT_PATH = sys.argv[1]
    #RES_LINK = sys.argv[2]

    PROJECT_PATH = "D:/work/KingBoxPGSS2026NoCode"
    #RES_LINK = "https://static7.hgapi365.com/"
    RES_LINK = "https://static.j67z85nx4.com/"
    print(PROJECT_PATH)
    print(RES_LINK)

    server = HTTPServer(('0.0.0.0', 8000), SmartHandler)
    print("🚀 服务已启动，监听 http://0.0.0.0:8000")
    server.serve_forever()
