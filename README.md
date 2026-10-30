# magpie-skill-bridge

把 magpie 技能库里更新过的技能同步到 `~/.agents/skills`，让 WorkSpace 等读取该目录的 agent 也能用到新版本。

## 为什么需要它

magpie 更新一个技能时，会在它自己的库里落一份新的实体目录（原来的软链被替换）：

```
~/.config/magpie/library/skills/tdd   软链 → ~/.agents/skills/tdd   （正常）
~/.config/magpie/library/skills/tdd   实体目录                      （magpie 刚更新过）
```

而 WorkSpace（OpenCode 内核）扫描技能用的是 Bun 的 glob `~/.agents/skills/**/SKILL.md`，`**` 不进入软链目录——所以技能必须放在 `~/.agents/skills` 下并且是实体目录，WorkSpace 才认。magpie 更新完，`~/.agents/skills` 里还是旧版本。

这个插件把新版本搬回 `~/.agents/skills`，库里恢复成软链，并补回 `magpie library skill hand-back` 会抹掉的 GitHub 来源元数据。

## 它做什么

- **自动**：插件在 magpie 的插件宿主里监听 magpie 技能库目录，magpie 一更新就同步（magpie 运行时始终有效）。
- **手动**：给 agent 两个工具，`skill_sync`（同步）和 `skill_status`（看每个技能的分布）。
- 幂等：没有待同步的技能时不做任何写入。

## 安装

从 GitHub 装（仓库打了 `magpie-plugin` 标签，会出现在 magpie 应用「插件 → 发现 → 非官方插件 · GitHub」）：

```bash
magpie plugin add Sonny9527/magpie-skill-bridge
```

本地文件夹就地加载（开发用，不装任何东西；改完源码在应用里把插件关掉再打开即可生效）：

```bash
magpie plugin add ./magpie-skill-bridge
```

## 工具

| 工具 | 作用 |
| --- | --- |
| `skill_sync` | 把库里更新过的技能搬回 `~/.agents/skills`，返回同步了哪些 |
| `skill_status` | 列出每个技能：勾选了哪些 agent、来源、库里形态、`~/.agents/skills` 形态、Workspace 是否可见 |

## 测试

```bash
sb=$(mktemp -d)               # 沙箱里跑，不碰真正的 magpie
m() { env HOME=$sb XDG_CONFIG_HOME=$sb/.config XDG_CACHE_HOME=$sb/.cache \
      MAGPIE_ADDR=127.0.0.1:3499 magpie "$@"; }
m plugin add ./magpie-skill-bridge
m plugin --json
```

## 注意

- 插件和外部的 `magpie-skill-refresh` 脚本用同一个锁文件（`$TMPDIR/magpie-skill-sync.lock`），不会互相踩。
- 插件在 magpie 的插件宿主（Bun）里运行，有本机文件权限；只操作 `~/.config/magpie` 和 `~/.agents`。
- 终端里执行 `magpie library skill update` 这类不常驻宿主的更新，宿主随命令结束就退出，此时插件的监听来不及触发，跑一次 `magpie-skill-refresh` 即可。

## License

MIT
