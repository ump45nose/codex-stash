# codex-stash

Codex Desktop 侧栏里的「收纳箱」：把暂时推进不了的会话收起来，只记标题和恢复日期。它是独立插件，不改 Codex 安装包，也不依赖置顶或归档。

A sidebar stash bin for Codex Desktop. Park a conversation you cannot move right now, with a title and a resume date. It is a standalone addon: it does not patch the Codex install, and it does not use pins or archive.

## 模块 / Modules

三个包可以分开使用、分开升版本：

| 包 | 职责 |
| --- | --- |
| [`stash-core`](stash-core) | 纯状态：`stash`、`setDate`、`unstash`、`list`、`due`、`onUserMessage`。没有 DOM。 |
| [`codex-adapter`](codex-adapter) | 唯一接触 Codex DOM 的代码。选择器表、当前 thread id、点击原会话、发送检测、定位失败时停用。见 [SELECTORS.md](codex-adapter/SELECTORS.md)。 |
| [`loader`](loader) | 幂等安装 / 卸载、CDP 只连 `127.0.0.1`、版本守卫 `window.__codexStash_v1`。 |

[`ui`](ui) 只画收纳箱、日期弹层和右键菜单，不查询 Codex 选择器。

Three packages, versioned separately:

| Package | Job |
| --- | --- |
| [`stash-core`](stash-core) | Pure state. No DOM. |
| [`codex-adapter`](codex-adapter) | The only code that touches the Codex DOM. Selectors, current thread id, open-by-click, send detection, fail-safe disable. See [SELECTORS.md](codex-adapter/SELECTORS.md). |
| [`loader`](loader) | Idempotent install and uninstall over loopback CDP. Guard: `window.__codexStash_v1`. |

[`ui`](ui) draws the section, the date popover, and the context menu. It does not query Codex.

状态文档（`version: 1`）按稳定 thread id 索引，每条只有 `title`、`dueAt`、`stashedAt`。标题只用于显示，刷新自侧栏；**不会**从标题反推 id。`local:<uuid>` 与裸 uuid 是同一条。`client-new-thread` 这种尚未落盘的 id 不能收纳。

The stored document is `{ version: 1, items: { [threadId]: { title, dueAt, stashedAt } } }`. The title is a display cache. A title is never turned into an id. `local:<uuid>` and the bare uuid are the same key. Draft `client-new-thread` ids are rejected.

## 安装 / Install

需要 Node.js 22+。调试端口只绑定在本机。

Requires Node.js 22+. Keep the debugger on loopback.

```bash
npm install
npm run build
npm test
```

先让 Codex Desktop 自己打开调试端口（不要把端口暴露到局域网）。应用名可能是 Codex 或 ChatGPT，以你机器上的安装为准：

Start Codex Desktop with a loopback debugger. The app name may be Codex or ChatGPT depending on the build:

```bash
# macOS, 示例 / example
open -a Codex --args --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1
```

等主窗口出现后：

When the main window is up:

```bash
node loader/bin/codex-stash.mjs install --port 9222
node loader/bin/codex-stash.mjs status --port 9222
node loader/bin/codex-stash.mjs uninstall --port 9222
```

`install` 可以重复执行：会先卸掉同一版本的旧脚本标识，再挂上一次。页面里若已有 `window.__codexStash_v1` 且版本相同，不会重复注册监听。节点 id 前缀是 `codex-stash-v1-`，重连时会先清掉这些节点。

`uninstall` 卸掉注入脚本和页面上的收纳箱。它不删除 `~/.codex-stash/stash.json`，也**不会**归档、取消置顶或删除任何 Codex 会话 / 工作区。

`install` is safe to repeat. `uninstall` removes the addon only. It does not delete the stash file, and it never archives, unpins, or deletes a Codex conversation or workspace.

可选命令：

| 命令 | 作用 |
| --- | --- |
| `export` | 把页面里的收纳状态写到 stash 文件 |
| `import` | 把 stash 文件写回页面 `localStorage` |
| `watch` | 保持 CDP 连接，把页面变更原子写入 stash 文件 |

页面内的实时副本在渲染进程的 `localStorage` 键 `codex-stash:v1`。独立文件默认在 `~/.codex-stash/stash.json`（可用 `CODEX_STASH_HOME` 改目录）。这个目录不是 `~/.codex`，插件拒绝把状态写进 Codex 自己的配置目录。`install` 时比较两边的 `updatedAt`，留较新的一份。

`watch` 退出后，文件不再跟随页面；下次 `install` 会再同步一次。没有常驻进程时，以页面 `localStorage` 为准。

The live copy is `localStorage` key `codex-stash:v1` inside the renderer. The independent file is `~/.codex-stash/stash.json` (`CODEX_STASH_HOME` overrides the directory). The addon refuses to write inside `~/.codex`. `install` keeps whichever copy has the newer `updatedAt`.

和 CodexHost 一起用时：两边都通过 CDP 注入同一个渲染进程。本插件只删除自己的节点，快捷键在冒泡阶段监听，若事件已经被 `preventDefault` 就让开。若 CodexHost 在 `window.__codexHostReservedHotkeys` 里公布了占用的快捷键（字符串，如 `Mod+Shift+S`），收纳箱不会绑定冲突的组合。

CodexHost can inject into the same renderer. This addon only removes nodes it created. Its hotkey listener runs on the bubble path and steps aside when `preventDefault` has already run. If CodexHost publishes `window.__codexHostReservedHotkeys` (strings such as `Mod+Shift+S`), a conflicting binding is not installed.

## 使用 / Usage

1. 打开要收纳的会话。侧栏当前行需要带有稳定的 `data-app-action-sidebar-thread-id`（或文档化的路由 / portal 回退）。还在 `client-new-thread` 草稿态时不能收纳。
2. 按快捷键，选 **明天**、**3天后**、**下周一** 或 **自定义**。默认恢复时刻是本地时间 09:00。
3. 收纳箱出现在「置顶」下面（没有置顶分区时，排在第一个原生分区前面）。样式从原生分区复制 class 和标签名。
4. 每一行只有标题和日期。到期的行有「到期」标记，并排在前面。
5. 点击一行，会点击原来的侧栏行，回到那个会话。不会去改置顶状态。
6. 右键：**改日期**、**移出**。移出只删收纳记录。
7. 在已收纳的会话里发出一条用户消息后，该条自动移出。换到别的会话再发送，不会误删。
8. 侧栏里已经找不到的会话会变灰，标题仍是缓存，只能移出，点击不会导航。

1. Open the conversation. It needs a stable `data-app-action-sidebar-thread-id` (or the documented route / portal fallback). Draft `client-new-thread` ids cannot be stashed.
2. Press the hotkey and pick **Tomorrow**, **In 3 days**, **Next Monday**, or **Custom**. Resume time is 09:00 local.
3. The section sits under Pinned, or above the first native section when Pinned is absent. Class names and tags are copied from a native section.
4. A row is a title and a date. Due rows show a due badge and sort first.
5. Clicking a row clicks the original sidebar row. Pin state is not written.
6. Context menu: change date, remove. Remove deletes the stash record only.
7. Sending a user message in a stashed conversation removes that row. Sending in a different conversation does not.
8. A thread that is no longer in the sidebar is greyed out. You can remove it; the click does not navigate.

界面文案默认中文。`~/.codex-stash/config.json`：

Default copy is Chinese. `~/.codex-stash/config.json`:

```json
{
  "hotkey": "Mod+Shift+H",
  "locale": "zh",
  "notify": true
}
```

`locale` 取 `zh` 或 `en`。也可以在命令行覆盖：`--hotkey Mod+Shift+H --locale en`。

## 常驻运行 / Run persistently (macOS)

CodexHost 每次启动 Codex 都会换一个调试端口，所以 `watch` 不传 `--port` 时会自动从正在运行的 Codex 主进程参数（`--remote-debugging-port=…`）里找端口。它会一直运行：端口变了就跟着换，页面重载、开新窗口或 Codex 重启后都会重新注入，已经挂载时不会重复注入。

```bash
codex-stash watch                 # 前台运行，自动发现端口
codex-stash service install       # 安装为 LaunchAgent（RunAtLoad + KeepAlive）
codex-stash service status
codex-stash service uninstall     # 停止并删除 LaunchAgent
```

- LaunchAgent：`~/Library/LaunchAgents/io.github.ump45nose.codex-stash.plist`，执行 `/opt/homebrew/bin/node <repo>/loader/bin/codex-stash.mjs watch`（没有 Homebrew node 时使用当前 node）。
- 日志：`~/Library/Logs/codex-stash/watch.log` 和 `watch.err.log`。
- 临时停止：`launchctl bootout gui/$(id -u)/io.github.ump45nose.codex-stash`；恢复：`launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/io.github.ump45nose.codex-stash.plist`。
- 停掉服务不会移除页面里已经挂载的收纳箱；要移除请再执行 `codex-stash uninstall`。

CodexHost picks a new debugger port per launch, so `watch` without `--port` reads it from the running Codex main process (`--remote-debugging-port=…`). It keeps one CDP session per main renderer, follows port changes, and re-injects after reloads, new windows and Codex restarts, never twice while mounted. `codex-stash service install|uninstall|status` manages it as a LaunchAgent (RunAtLoad + KeepAlive, logs in `~/Library/Logs/codex-stash/`). Stopping the service does not unmount the section; run `codex-stash uninstall` for that. Other commands also auto-discover the port when `--port`/`CODEX_STASH_CDP_PORT` is absent, falling back to 9222.

## 快捷键 / Hotkey

默认 **⌘⇧H**（macOS）或 **Ctrl+Shift+H**（其他系统）。⌘⇧S、⌘⌥S、⌘⇧B、⌘⇧U 在实测中已被 Codex 自身占用，不可用。`Mod` 表示当前平台的主键。

不会绑定已知的 Codex 快捷键：

- `Mod+Shift+F`：搜索会话（Codex Desktop）
- `Mod+Shift+P`：部分界面上的 Plan 模式

冲突时分区仍会挂上（已有记录还能看），但快捷键不会注册，控制台有一条 `[codex-stash] hotkey not bound`。

The default is **⌘⇧H** on macOS and **Ctrl+Shift+H** elsewhere. ⌘⇧S, ⌘⌥S, ⌘⇧B and ⌘⇧U are already claimed by Codex in live testing and are refused. `Mod+Shift+F` (search threads) and `Mod+Shift+P` (plan mode on some surfaces) are refused. On a conflict the section still mounts, and the hotkey does not.

到期提醒：窗口重新获得焦点时，以及默认每 60 秒，检查一次。已经 `Notification.permission === "granted"` 时才会发系统通知，每条记录的每个到期时刻只通知一次。插件不会主动弹出授权请求。未授权时仍然用「到期」标记。

Due checks run on focus and every 60 seconds. A system notification is sent only when permission is already granted, once per thread and due instant. The addon does not request permission itself.

## 停用 / Fail-safe

选择器表是 `codex-desktop-26.623`。侧栏明显还在、但 thread id 和分区属性都没了时，适配器返回 `broken`：卸掉自己的节点，打一条诊断，继续观察。属性恢复后会重新挂上。空侧栏（还没画出分区）是 `loading`，不会当成损坏。

找不到 composer 地标时，回车检测保持关闭，避免把页面上任意输入框当成发送。此时仍可通过 `window` 上的自定义事件移出收纳，`detail.threadId` 必须是稳定 id，不能是标题：

When the documented attributes disappear, the addon removes itself and logs `[codex-stash] disabled`. It mounts again if a later mutation looks healthy. Send detection stays off unless a composer landmark is present. Other mods can dispatch:

```js
window.dispatchEvent(new CustomEvent('codex-stash:user-message', {
  detail: { threadId: '11111111-1111-1111-1111-111111111111' },
}))
```

同名兼容事件：`codexhost:user-message`（对应 [BytePioneer-AI/codex-host#526](https://github.com/BytePioneer-AI/codex-host/issues/526) 里建议的钩子）。在 CodexHost 真正发出之前，这条监听是空的。

`codexhost:user-message` is the same shape, for the hook requested in BytePioneer-AI/codex-host#526. Until CodexHost emits it, only the composer path and `codex-stash:user-message` apply.

## 开发 / Develop

```bash
npm test
npm run build   # loader/dist/inject.js，给 CDP 注入用
```

`stash-core` 用 Node 自带测试跑，不需要浏览器。适配器和 loader 的页面行为用 jsdom 覆盖安装、卸载、快捷键、自动移出和定位失败。

## 限制 / Limitations

这些事**必须**在真实的 Codex Desktop（以及你在用的 CodexHost 版本）上才能确认，本仓库的测试替换不了：

These need a real Codex Desktop install (and the CodexHost build you actually run). Unit tests do not replace them:

- 当前安装的侧栏是否仍是 `data-app-action-sidebar-*` 这套属性（表 id `codex-desktop-26.623`）。升级后对不上时，插件会停用而不是猜标题。
- 复制原生 class 之后，「收纳箱」是否和置顶 / 项目 / 最近视觉一致，包括中英文界面、窄侧栏、明暗主题。
- `aria-current="page"` 在行上还是在子节点上。
- 点击原生行是否真的被 Codex 的内存路由接住。插件不会自己改 `location`，也不会合成 `codex://` 链接。
- 原生 composer 和 CodexHost harness composer 是否都用 Enter 发送、Shift+Enter 换行，发送按钮的无障碍名称是否仍是 Send / 发送。
- Harness 会话是否带有同一个 `data-app-action-sidebar-thread-id`。没有稳定 id 的会话不会被收纳。
- Electron 里系统通知权限、`localStorage` 在这个 origin 上是否跨重启保留。
- 调试端口的进程名、以及主渲染目标是不是 `app://` 页面。`status` 打不出 `hasShell: true` 时，安装不会继续。
- CodexHost 实际占用的快捷键。公开文档里没有完整列表；冲突表只包含上面写明的 Codex 快捷键，外加 `window.__codexHostReservedHotkeys`。
- React 重绘侧栏的频率。观察器会在原生分区被换掉后重挂，但真实应用里是否闪烁要眼见为实。

相关上游讨论：[openai/codex#53388](https://github.com/openai/codex/issues/53388)（原生收纳或正式扩展点）、[BytePioneer-AI/codex-host#526](https://github.com/BytePioneer-AI/codex-host/issues/526)（与 CodexHost 共存）。

## 许可 / License

[MIT](LICENSE). 归因见 [NOTICE](NOTICE)。

Explodex（无许可证）只作设计参考，没有拷贝其代码。Codexion 与 Codex App HUD 为 MIT；这里按它们的文档重新实现了定位顺序、幂等安装、活动会话探针和「用稳定 thread id 做键」，没有复制其源文件。

Explodex has no license and was not copied. Codexion and Codex App HUD are MIT; their documented locator, install, and thread-id behavior was reimplemented, not copied. See [NOTICE](NOTICE).
