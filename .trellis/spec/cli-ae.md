# CLI 与 AE 宿主边界

来源：[Issue #1](https://github.com/Wutpeach/Saving/issues/1)。本阶段接口以现有源码为准，实测范围见 [AE 外部调用研究](../research/ae-cli.md)。

- 当前范围仅为 Windows TypeScript CLI 和 ExtendScript/JSX 的只读通信验证。只提供 host-info、project-info，不创建、保存、替换或关闭用户工程；不包含完整素材库、正式面板、MCP Server 或迁移兼容。
- Saving 独立运行，不依赖或修改 Save Objects 2、第三方 AE MCP；CLI 无须 Saving 面板常驻。
- 宿主操作集中在 SavingHost.execute(request)，返回 JSON 字符串；run(request,responsePath) 仅适配文件回执。未来面板应复用相同操作层，JSX 必须随发行包交付，不要求用户另装通信脚本。CEP 通道尚未验证。
- protocol:1；每次 CLI 调用生成独立 UUID 和请求目录。正常调用 stdout 为一行 JSON，包含 requestId、ok、data 或 error:{code,message}，退出码为 0/1；--help 输出人工帮助。
- 必须等待完整、协议与请求 ID 匹配且形状有效的回执。宿主先写 UTF-8 临时文件、关闭后 rename 发布；投递进程退出不能作为 AE 完成依据。request.json 为审计副本，执行请求由受转义的 JSX 字面量传入，不 eval 外部 JSON。
- --timeout-ms 限制投递后的等待，不包括进程发现和路径准备；辅助 PowerShell 调用各有 15 秒上限。超时只表示执行未确认，不保证取消。宿主开始操作前检查 deadline；不可将当前只读查询的重试语义直接用于未来写操作。
- 无活动合成时成功返回 activeComposition:null。AE 未运行时拒绝且不自动启动；多个 AE 进程时保守拒绝，不承诺 PID 寻址或消除实例竞态。独立请求目录不代表任意并发负载都已验证。
- 诊断文件可能包含用户工程信息，默认在临时目录保留；不得提交运行回执、个人路径、原始证据或本机配置。清理前确认没有在途请求。
