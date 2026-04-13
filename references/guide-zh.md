# 中文使用说明

这份说明面向会触发 `agent-browser-performance` 的后续 Codex 实例，也适合你自己快速了解这个 skill 的边界、用法和产物结构。

## 这个 skill 解决什么问题

这个 skill 的目标不是给网站做“完整性能评测平台”，而是把一套常用、可重复的浏览器性能采样流程固定下来，避免每次都临时手敲一长串 `agent-browser` 命令。

它重点解决三件事：

1. 用统一入口采集一次页面性能快照
2. 把产物落到固定目录，便于后续查找和归档
3. 把两次采样结果做结构化对比，快速看出回归或改善

适合的场景包括：

- “帮我分析这个页面为什么慢”
- “帮我采一份基线，后面我改完再对比”
- “帮我比较改动前后页面加载性能”
- “把这个页面的截图、profile、summary 都固定产出来”

不适合的场景包括：

- 需要 Lighthouse/PSI 那种完整评分体系
- 需要真实用户 RUM 数据
- 需要多机型、多网络条件、多地域压测

第一版更偏“工程化采样和比较”，不是“全栈性能平台”。

## 默认工作流

### 1. 采样一次

用 `capture-performance.sh` 采一个页面：

```bash
bash scripts/capture-performance.sh \
  "https://example.com" \
  baseline
```

参数说明：

- 第一个参数是目标 URL
- 第二个参数是本次采样的标签，比如 `baseline`、`after-fix`、`checkout`
- 第三个参数可选，是产物根目录；不传时默认写到当前项目下的 `.codex/artifacts/agent-browser-performance`

常用附加参数：

- `--profile <path>` 复用一个持久浏览器 profile，适合验证码、SSO、MFA 之后长期沿用
- `--state <path>` 载入已经导出的 storage state
- `--session-name <name>` 复用 `agent-browser` 自己保存的会话状态
- `--headed` 以有界面模式打开浏览器
- `--manual` 打开页面后暂停，让人手动完成登录或验证码，再回到终端按 Enter 继续
- `--ready-selector` / `--ready-text` / `--ready-url` 指定“页面真的准备好了”的判断条件
- `--load-state` 控制最后等待的加载状态，默认是 `networkidle`
- `--settle-ms` 在页面 ready 后额外再等一段时间，适合 SPA 最后一小段渲染

执行完成后，会生成一整套固定文件，包括：

- `full.png`
- `interactive-snapshot.txt`
- `profile.json`
- `page-metrics.json`
- `console.json`
- `errors.json`
- `summary.json`
- `summary.md`

### 遇到登录、MFA、验证码怎么办

这类页面不要指望脚本自动“破解”验证码。正确做法是把人工验证和后续复用状态拆开。

最推荐的首次采样命令：

```bash
bash scripts/capture-performance.sh \
  "https://example.com/dashboard" \
  baseline \
  --profile /tmp/example-profile \
  --manual \
  --ready-url "**/dashboard" \
  --load-state load \
  --settle-ms 2000
```

执行过程是：

1. 脚本用 headed 模式打开页面
2. 你在浏览器里手动完成登录、MFA、验证码
3. 回到终端按 Enter
4. 脚本等待页面进入你指定的 ready 状态
5. 再继续采截图、profile、summary

后续如果登录态还有效，直接复用同一个 profile 即可：

```bash
bash scripts/capture-performance.sh \
  "https://example.com/dashboard" \
  after-fix \
  --profile /tmp/example-profile \
  --ready-url "**/dashboard" \
  --load-state load \
  --settle-ms 2000
```

如果你已经提前拿到了 state 文件，也可以不用 profile，改成：

```bash
bash scripts/capture-performance.sh \
  "https://example.com/dashboard" \
  baseline \
  --state ./state.json \
  --ready-url "**/dashboard" \
  --load-state load
```

几个经验点：

- `--manual` 会自动启用 `--headed`
- `--manual` 需要交互式终端；它会等你按 Enter 才继续
- 如果目标页有轮询或长连接，`networkidle` 可能太严格，这时用 `--load-state load` 往往更稳
- 如果你知道页面最终会跳到哪个地址，优先用 `--ready-url`
- 如果你知道某个关键元素出现就代表页面可用了，优先用 `--ready-selector`

### 2. 看单次结果

优先看这两个文件：

- `summary.md`
  适合人直接快速浏览
- `summary.json`
  适合程序化读取、后续对比、进一步加工

如果需要深挖：

- 看 `profile.json`
  用 Chrome DevTools Performance、Perfetto、`chrome://tracing` 打开
- 看 `full.png`
  快速确认页面实际渲染状态
- 看 `interactive-snapshot.txt`
  理解交互元素结构和页面是否真的加载完成

### 3. 对比两次结果

如果是同一个页面的最近两次采样，直接用：

```bash
bash scripts/compare-latest.sh \
  "https://example.com"
```

如果你想精确指定两次 run，就用：

```bash
node scripts/compare-runs.js \
  <run-a> \
  <run-b>
```

对比结果会输出成：

- `comparison.json`
- `comparison.md`

其中 `comparison.md` 最适合快速看差异。

## 产物目录怎么组织

默认根目录：

```text
$PWD/.codex/artifacts/agent-browser-performance/
```

单次采样目录格式：

```text
<artifact-root>/<site-slug>/<timestamp>-<label>/
```

例如：

```text
.codex/artifacts/agent-browser-performance/example-com-root/20260311-143511-baseline/
```

其中：

- `site-slug` 由 URL 自动归一化生成
- `timestamp` 用采样开始时间生成
- `label` 由你提供，用来表达这次采样的意图

建议标签保持稳定，比如：

- `baseline`
- `after-fix`
- `after-build`
- `checkout`
- `mobile-nav`

这样后续比较目录会更容易读懂。

## 每个核心文件有什么用

### `request.json`

记录本次采样的输入参数、label、session、输出目录，以及 profile/state/manual-wait 之类的上下文。后面要追溯这次采样是谁、为什么、对哪个 URL 做的，先看这里。

### `profile.json`

这是 `agent-browser profiler` 产出的 Chrome Trace Event 格式文件。它不是人类直接阅读的文本，而是给 DevTools/Perfetto 用的。

适合场景：

- 看线程任务分布
- 看主线程任务是否过长
- 看改动前后 trace 是否明显变重

### `page-metrics.json`

这是从浏览器 Performance API 里提取出来的结构化指标，包含：

- navigation timing
- first paint
- first contentful paint
- 资源数量和分类
- DOM 节点数量
- JS heap 信息（如果浏览器暴露）

这是单次性能快照里最实用的结构化原始数据之一。

### `summary.json`

这是统一后的汇总结果，适合作为“标准输入”给后续脚本或自动化流程。

如果你以后要再接：

- 自动回归判断
- PR 性能比对
- 自定义告警

优先从 `summary.json` 往下做。

### `summary.md`

这是给人读的快速摘要。适合在任务对话里直接引用核心结果。

### `comparison.json` / `comparison.md`

这是两次 run 的对比结果。

重点看这些字段：

- `Response end`
- `DOMContentLoaded`
- `Load event`
- `First paint`
- `First contentful paint`
- `Total transfer`
- `Resource count`
- `Page errors`
- `Long tasks >=50ms`
- `Max RunTask`

## 建议怎么用这个 skill

### 场景一：先做基线，再改代码

推荐顺序：

1. 先用 `baseline` 采一次
2. 改代码
3. 再用 `after-fix` 采一次
4. 运行 `compare-latest.sh`
5. 再决定要不要打开 `profile.json` 深挖

这是最常见也最省时间的用法。

### 场景二：页面很多，只想盯一个关键路径

不要一上来就扫整站。优先选：

- 首页首屏
- 登录后 dashboard
- 关键转化页
- 用户明确反馈慢的页面

这个 skill 更适合“重点页面的反复采样”，不是大规模爬站。

### 场景三：你已经知道某个改动可能影响性能

把 label 写得更具体，例如：

- `before-cache-fix`
- `after-cache-fix`
- `before-webpack-split`
- `after-webpack-split`

这样之后回看历史目录，几乎不用再猜每次采样对应什么改动。

## 权限和环境边界

这个 skill 只是在 `agent-browser` 之上包了一层标准流程，不会绕过执行环境的权限控制。

你需要知道几个现实约束：

### 1. `agent-browser` 仍然可能需要提权运行

尤其在受限沙箱里，浏览器 daemon、socket、外部页面访问、artifact 回写都可能要求更高权限。

也就是说：

- 这个 skill 可以减少你重复敲命令
- 但不能替代 CLI/沙箱审批机制

### 2. 产物目录的权限应尽量一致

如果第一次采样是用更高权限跑出来的，那么后续对同一目录的汇总、重写、比较，最好也用同样权限级别执行，避免出现“能读不能写”的情况。

### 3. 这是浏览器采样，不是线上真实用户指标

这里看到的是一次受控环境下的浏览器视角数据。它很适合做“前后对比”和“定位问题线索”，但不等价于真实用户全量数据。

### 4. 验证码依然需要按站点规则处理

这个 skill 现在支持“人工过一次验证码，再复用状态”的工作流，但不提供验证码绕过能力。

也就是说：

- 你可以手动完成一次验证，再复用 `--profile` / `--state` / `--session-name`
- 你可以为测试环境准备免验证码账号、白名单或 staging 入口
- 但不应该把这个 skill 当成验证码破解工具

## 如何解读这些指标

### Response end

表示主文档响应接收完成的大致时间。偏高时，通常先怀疑：

- 网络链路慢
- 服务端响应慢
- 重定向过多

### DOMContentLoaded / Load event

更适合看页面主流程完成到什么程度。

- `DOMContentLoaded` 更偏 DOM 可用
- `Load event` 更偏页面资源加载完成

如果两者都高，说明整体加载过程偏慢。

### First paint / First contentful paint

更接近“用户什么时候看到东西”。如果这两个值明显变差，通常会直接影响体感。

### Total transfer

适合粗看页面总传输体积是否变大。注意这只是浏览器侧看到的传输量，不是完整网络分析平台里的全部口径。

### Resource count

资源数变多，常常意味着：

- 请求拆得更碎
- 新增脚本或样式
- 某些懒加载变成首屏加载

### Long tasks / Max RunTask

这两个更偏主线程繁忙程度。如果它们明显升高，通常说明：

- JS 执行更重
- 主线程被更长的任务阻塞
- 页面交互流畅度可能受到影响

## 推荐的实践习惯

- 先比较同一页面、同一环境下的前后变化，再谈绝对值
- label 保持简短但语义明确
- 每次大改前先采一份 baseline
- 真要深挖时，再去打开 `profile.json`
- 报告给别人时优先贴 `summary.md` 或 `comparison.md`

## 你后面还可以怎么扩展

如果之后你想把它继续做重一些，可以往这几个方向扩：

- 增加 Lighthouse 支持
- 增加移动端 viewport/网络条件参数
- 增加多 URL 批量采样
- 增加阈值判断和失败退出码
- 增加 CI 集成
- 增加对比报告模板

当前版本先把“可重复采样 + 固定产物 + 可比较”这三个核心问题解决掉。
