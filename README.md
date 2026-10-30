# magpie-skill-bridge

**把 magpie 技能库里更新过的技能同步到 `~/.agents/skills`，让 WorkSpace 等读取该目录的 agent 也能用到新版本。**

**Sync skills updated in magpie's library into `~/.agents/skills`, so WorkSpace and other agents that read that directory get the new versions.**

[中文](#中文) · [English](#english)

---

## 中文

### 为什么需要它

magpie 更新一个技能时，会在它自己的库里落一份新的实体目录（原来的软链被替换）：

```
~/.config/magpie/library/skills/tdd   软链 → ~/.agents/skills/tdd   （正常）
~/.config/magpie/library/skills/tdd   实体目录                      （magpie 刚更新过）
```

而 WorkSpace（OpenCode 内核）扫描技能用的是 Bun 的 glob `~/.agents/skills/**/SKILL.md`，`**` 不进入软链目录——所以技能必须放在 `~/.agents/skills` 下并且是实体目录，WorkSpace 才认。magpie 更新完，`~/.agents/skills` 里还是旧版本。

这个插件把新版本搬回 `~/.agents/skills`，库里恢复成软链，并补回 `magpie library skill hand-back` 会抹掉的 GitHub 来源元数据。

### 它做什么

- **自动**：插件在 magpie 的插件宿主里监听 magpie 技能库目录，magpie 一更新就同步（magpie 运行时始终有效）。
- **手动**：给 agent 两个工具，`skill_sync`（同步）和 `skill_status`（看每个技能的分布）。
- 幂等：没有待同步的技能时不做任何写入。

### 安装

从 GitHub 装（仓库打了 `magpie-plugin` 标签，会出现在 magpie 应用「插件 → 发现 → 非官方插件 · GitHub」）：

```bash
magpie plugin add Sonny9527/magpie-skill-bridge
```

本地文件夹就地加载（开发用，不装任何东西；改完源码在应用里把插件关掉再打开即可生效）：

```bash
magpie plugin add ./magpie-skill-bridge
```

### 工具

| 工具 | 作用 |
| --- | --- |
| `skill_sync` | 把库里更新过的技能搬回 `~/.agents/skills`，返回同步了哪些 |
| `skill_status` | 列出每个技能：勾选了哪些 agent、来源、库里形态、`~/.agents/skills` 形态、Workspace 是否可见 |

### 测试

```bash
sb=$(mktemp -d)               # 沙箱里跑，不碰真正的 magpie
m() { env HOME=$sb XDG_CONFIG_HOME=$sb/.config XDG_CACHE_HOME=$sb/.cache \
      MAGPIE_ADDR=127.0.0.1:3499 magpie "$@"; }
m plugin add ./magpie-skill-bridge
m plugin --json
```

### 注意

- 插件和外部的 `magpie-skill-refresh` 脚本用同一个锁文件（`$TMPDIR/magpie-skill-sync.lock`），不会互相踩。
- 插件在 magpie 的插件宿主（Bun）里运行，有本机文件权限；只操作 `~/.config/magpie` 和 `~/.agents`。
- 终端里执行 `magpie library skill update` 这类不常驻宿主的更新，宿主随命令结束就退出，此时插件的监听来不及触发，跑一次 `magpie-skill-refresh` 即可。

---

## English

### Why

When magpie updates a skill, it drops a fresh **real directory** into its own library, replacing the symlink that used to point at the shared copy:

```
~/.config/magpie/library/skills/tdd   symlink → ~/.agents/skills/tdd   (normal)
~/.config/magpie/library/skills/tdd   real directory                  (just updated)
```

WorkSpace runs on the OpenCode core and discovers skills with Bun's glob `~/.agents/skills/**/SKILL.md`. `**` does not descend into symlinked directories, so a skill has to be a **real directory** under `~/.agents/skills` for WorkSpace to see it. Right after a magpie update, the copy WorkSpace reads is still the old one.

This plugin moves the new version back into `~/.agents/skills`, turns the library entry back into a symlink, and restores the GitHub source metadata that `magpie library skill hand-back` strips.

### What it does

- **Automatic**: the plugin watches magpie's skill library from the plugin host and syncs as soon as magpie updates something (always on while magpie runs).
- **Manual**: two tools for agents — `skill_sync` (sync) and `skill_status` (show where each skill lives).
- Idempotent: it writes nothing when there is nothing to sync.

### Install

From GitHub (the repo carries the `magpie-plugin` topic, so it also shows up in the app under *Plugins → Discover → Unofficial plugins · GitHub*):

```bash
magpie plugin add Sonny9527/magpie-skill-bridge
```

From a local folder (for development; nothing is installed, and toggling the plugin off and on again in the app reloads your changes):

```bash
magpie plugin add ./magpie-skill-bridge
```

### Tools

| Tool | What it does |
| --- | --- |
| `skill_sync` | Moves skills that were updated in the library back into `~/.agents/skills` and reports which ones moved |
| `skill_status` | Lists every skill: which agents it is ticked for, its source, its shape in the library and in `~/.agents/skills`, and whether WorkSpace can read it |

### Test

```bash
sb=$(mktemp -d)               # run it in a sandbox, so your real magpie is untouched
m() { env HOME=$sb XDG_CONFIG_HOME=$sb/.config XDG_CACHE_HOME=$sb/.cache \
      MAGPIE_ADDR=127.0.0.1:3499 magpie "$@"; }
m plugin add ./magpie-skill-bridge
m plugin --json
```

### Notes

- The plugin and the standalone `magpie-skill-refresh` script share one lock file (`$TMPDIR/magpie-skill-sync.lock`), so they never fight each other.
- The plugin runs in magpie's plugin host (Bun) with local file permissions; it only touches `~/.config/magpie` and `~/.agents`.
- Updates run from the terminal (`magpie library skill update`) end with the host, so the watcher may not fire — run `magpie-skill-refresh` once in that case.

---

## License

MIT
