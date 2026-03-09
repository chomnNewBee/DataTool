@echo off 
chcp 65001 
rem set /p project_path=输入项目根目录(例:D:\work\KingBoxPGSEx0):
set project_path=D:\work\KingBoxPGSEx0\
set /p res_link=输入竞品资源链接前缀(例:https://static.whwz8187o.com/):
python get_404_res.py %project_path% %res_link%
pause