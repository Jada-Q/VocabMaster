# VocabMaster

Chrome extension (MV3)：在任意网页选词 → 存 `chrome.storage` → popup 浏览/搜索/导出 CSV。词义查询走 dictionaryapi.dev，无后端。

## Architecture invariants

- **Manifest V3，不是 V2**：background 是 `service_worker`（`background/background.js`），不是常驻 background page。SW 会被 Chrome 终止后按需重启，**任何状态都必须落 `chrome.storage`，不要用模块级变量**
- **No build step**：纯 vanilla JS，没有 bundler / 框架。要加 TypeScript 或 React 必须先引入构建链路
- **No backend**：词典查询在客户端直接 fetch `api.dictionaryapi.dev`（已声明在 `manifest.json` 的 `host_permissions`）。**不要加自家服务器中转** —— 当前隐私模型是"本地存储+公开词典 API"，加 server 改变信任边界
- **三组件消息模式**：`content/content.js`（注入页面，捕获选词）↔ `background/background.js`（service worker，消息路由 + 词典 API 调用）↔ `popup/popup.js`（扩展 UI，渲染词表）。组件间一律 `chrome.runtime.sendMessage`，不要直接共享变量
- **权限最小**：`storage` + `activeTab`。新增 API 域名要更新 `host_permissions`，会触发 Chrome Web Store 重审

## Status

Initial commit (2026-03-19)，无后续。如果继续做，业务功能落 `content.js`（选词捕获）或 `popup.js`（浏览 UI）。Background SW 保持 thin router 角色。

## 不要做

- 不要在 service worker 里存"会话内状态" —— SW 重启即丢，全走 `chrome.storage`
- 不要把数据上传到服务器 —— 见 invariants 第 3 条
- 不要在 popup 里直接 fetch 词典 API —— 走 background 路由，方便统一缓存/限流（即便目前没做）
