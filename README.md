# Saving

Saving 是面向本地 Agent 和未来 AE 面板的独立素材/模板管理项目。当前提供 Windows 上的只读 CLI，可读取 After Effects 版本、当前工程及活动合成信息；尚未实现素材库或面板。

## 安装

需要 Windows、Node.js 22+、Windows PowerShell 5.1，以及已经运行的单个 After Effects。在 AE 的 Preferences → Scripting & Expressions 中开启 **Allow Scripts to Write Files and Access Network**。

~~~powershell
npm ci
npm run build
~~~

## 使用

~~~powershell
node dist/cli.js host-info
node dist/cli.js project-info
node dist/cli.js project-info --timeout-ms 10000 --ipc-dir 'D:/SavingIPC'
node dist/cli.js --help
~~~

- host-info：读取 AE 版本、构建和语言。
- project-info：读取工程路径、项目数、dirty 状态和活动合成信息；未保存路径或无活动合成返回 null。
- 正常调用在 stdout 输出一行 JSON，包含 requestId、ok 和 data/error；成功退出码为 0，失败为 1。Agent 请直接调用 Node，避免 npm 的额外输出。
- --timeout-ms 默认 10000，范围 1–300000，控制投递后的回执等待时间。超时不代表 AE 已取消执行；检查 AE 对话框和脚本文件权限后可重新进行只读查询。
- --ipc-dir 可指定诊断文件目录。若返回 AE_SCRIPT_PATH_UNSUPPORTED，请使用完整路径不含空格的目录。请求文件默认保留，可能包含工程路径和名称，确认 AE 已完成后自行清理。

无需打开 Saving 面板或安装第三方 AE MCP。JSX 由构建过程一并打包，不需要手动安装通信脚本。

开发检查：npm test。阶段要求和实测报告见 [Issue #1](https://github.com/Wutpeach/Saving/issues/1)。
