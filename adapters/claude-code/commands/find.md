---
description: 跨源检索本地 Markdown、MCP 与数据库
argument-hint: <问题>
allowed-tools: [WebFetch, Read, Grep, Glob]
---

# /find

将 `$ARGUMENTS` 作为 query，请求 `POST http://127.0.0.1:8787/find/search`。

请求示例：
```json
{"query":"$ARGUMENTS","top_k":5,"sources":["local","mcp","db"],"user_context":{"platform":"claude-code"}}
```

返回后直接用纯文本回答用户问题，不使用固定分节模板，不使用 Markdown 格式。
