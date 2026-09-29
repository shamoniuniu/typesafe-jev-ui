# SystemOne 决策请求调试台

一个 TypeScript 全栈示例：React + Vite 构建中文响应式界面，Express 在服务端代理
`POST https://api.typesafe.ai/v1/systemone`，避免将 API Key 暴露给浏览器。

## 启动

需要 Node.js 20.19+ 或 22.12+。

```powershell
npm install
Copy-Item '.env.example' '.env'
```

编辑 `.env`，填入真实密钥：

```dotenv
TYPESAFE_API_KEY=your_real_key
PORT=3001
```

开发模式同时启动 Vite（5173）与 Express（3001）：

```powershell
npm run dev
```

打开 `http://localhost:5173`。Vite 会将 `/api` 请求转发至 Express。

## 请求结构

前端固定发送 `model: "jev-latest"`。`questions` 必须是
`Record<questionId, question>`；每个问题 ID 非空且唯一，并可在界面中编辑。三类问题的
`type` 均使用小写值：

- `choice`：`criteria` 为非空 `{ "选项键": "判断标准" }` 对象。
- `score`：`criteria` 为包含 2–10 个非空字符串的数组。
- `noul`：`criteria` 可省略；提供时必须为 `{ "true": "为真边界", "false": "为假边界" }`。

```json
{
  "state": { "user": { "tier": "pro" } },
  "model": "jev-latest",
  "questions": {
    "next_action": {
      "type": "choice",
      "instructions": "判断下一步动作",
      "criteria": {
        "purchase": "完成购买",
        "leave": "离开页面"
      }
    },
    "purchase_signals": {
      "type": "score",
      "instructions": "评估购买信号",
      "criteria": ["价格接受度", "产品匹配度"]
    },
    "ready_to_buy": {
      "type": "noul",
      "instructions": "判断是否准备好购买",
      "criteria": {
        "true": "意愿明确且信息充分",
        "false": "仍有疑虑或信息不足"
      }
    }
  }
}
```

浏览器只调用本地 `POST /api/systemone`。Express 校验请求后，从
`TYPESAFE_API_KEY` 读取密钥，以 `Authorization: Bearer ...` 请求上游。真实密钥不应提交到仓库，
`.gitignore` 已忽略 `.env`。

响应区从 `response.answers` 按问题 ID 渲染每题的 `choice`、`score`、`noul`、
`probabilities` 与 `confidence`，同时保留完整原始 JSON 便于调试。

## 批量模式

单条模式与批量模式共用界面中编辑的官方 `questions: Record<questionId, question>`，
每条任务仅替换 `state`，仍固定使用 `model: "jev-latest"`。

批量模式接受 100–1000 条输入：

- CSV / XLSX：读取第一个工作表，以首行为表头；上传后选择作为 `state` 的列。单元格内容若是合法
  JSON（例如 `{"user_id":42}`）会解析后发送，否则按单元格原值发送。
- JSONL：每个非空行必须是一个合法 JSON 值。
- 每行文本：每个非空行作为一个字符串 `state`。

浏览器端队列默认并发为 3，可在 1–5 之间调整。暂停只阻止新任务启动，不会取消正在执行的请求；
单项失败不会中断队列，全部结束后可仅重试失败项。

低置信阈值范围为 0.50–0.99，默认 0.70：

- `choice` / `score`：响应的 `confidence` 低于阈值时标记。
- `noul`：`noul` 概率位于 `[1 - 阈值, 阈值]` 中间区间时标记。例如阈值为 0.70，
  中间区间为 0.30–0.70。

任务结束后可导出 JSONL。每行包含序号、原始输入、最终状态、完整上游响应、低置信标记或错误信息。

## 验证与生产运行

```powershell
npm test
npm run typecheck
npm run build
npm start
```

`npm start` 会在 Express 中同时提供构建后的 `dist` 静态页面与 API 代理。
测试使用 Mock Fetch 验证请求校验、缺少密钥错误、Bearer 认证及响应透传，不会调用真实 API；
另覆盖 JSONL/文本/工作簿解析、100–1000 条限制、并发上限、暂停/继续、失败隔离与重试。
