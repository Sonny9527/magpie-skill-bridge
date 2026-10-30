// magpie-skill-bridge
// magpie 更新技能时，会在它自己的库里落一份新的实体目录（原来的软链被替换），
// 而 WorkSpace 只认 ~/.agents/skills 下的实体目录（Bun 的 glob 不进软链目录），
// 于是 WorkSpace 用的还是旧版本。这个插件把新版本搬回 ~/.agents/skills，并把库里的条目恢复成软链。
//
// 提供两个工具给 agent：
//   skill_sync   把库里更新过的技能同步到 ~/.agents/skills
//   skill_status 查看每个技能在 magpie 库、各 agent 目录里的形态
// 同时在插件宿主里监听 magpie 技能库目录，magpie 一更新就自动同步。

import { watch } from "node:fs"
import { execFile } from "node:child_process"
import { existsSync, lstatSync, readFileSync, readdirSync, rmSync, writeFileSync, mkdirSync, rmdirSync } from "node:fs"
import { homedir, tmpdir } from "node:os"
import { basename, join } from "node:path"

const home = () => homedir()
const configDir = () => join(process.env.XDG_CONFIG_HOME || join(home(), ".config"), "magpie")
const libDir = () => join(configDir(), "library", "skills")
const agentsDir = () => join(home(), ".agents", "skills")
const libraryJson = () => join(configDir(), "library.json")
const sourcesFile = () => join(configDir(), "skills-sources.json")
const lockDir = () => join(tmpdir(), "magpie-skill-sync.lock")

const magpieBin = () => {
  if (process.env.MAGPIE_BIN) return process.env.MAGPIE_BIN
  const local = join(home(), ".local", "bin", "magpie")
  return existsSync(local) ? local : "magpie"
}

// 库的条目形态：软链（正常）还是实体目录（magpie 刚更新过）
function entryKind(path) {
  try {
    if (!existsSync(path)) return "missing"
    return lstatSync(path).isSymbolicLink() ? "link" : "dir"
  } catch {
    return "missing"
  }
}

// 待同步的技能：库里是实体目录，说明 magpie 用新版把它换下来了
function pendingUpdates() {
  const dir = libDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => entryKind(join(dir, name)) === "dir")
    .sort()
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return fallback
  }
}

function runMagpie(args) {
  return new Promise((resolve) => {
    execFile(magpieBin(), args, { timeout: 120000 }, (err, stdout, stderr) => {
      resolve({ code: err ? (err.code ?? 1) : 0, stdout: stdout ?? "", stderr: stderr ?? "" })
    })
  })
}

// 把 hand-back 抹掉的 GitHub 来源补回来
function restoreSources() {
  const sources = readJson(sourcesFile(), null)
  if (!sources) return false
  const lib = readJson(libraryJson(), null)
  if (!lib || !Array.isArray(lib.skills)) return false
  let changed = false
  for (const skill of lib.skills) {
    const source = sources[skill.name]
    if (source && JSON.stringify(skill.source) !== JSON.stringify(source)) {
      skill.source = source
      changed = true
    }
  }
  if (changed) writeFileSync(libraryJson(), JSON.stringify(lib, null, 2) + "\n")
  return changed
}

// 同步：把库里更新过的实体目录搬回 ~/.agents/skills，库里恢复成软链
async function sync({ quiet = false } = {}) {
  const pending = pendingUpdates()
  if (pending.length === 0) {
    if (!quiet) return { ok: true, moved: [], note: "没有待同步的技能" }
    return { ok: true, moved: [] }
  }

  try {
    mkdirSync(lockDir())
  } catch {
    return { ok: false, moved: [], note: "另一个同步正在进行，稍后再试" }
  }

  const moved = []
  const failed = []
  try {
    for (const name of pending) {
      const target = join(agentsDir(), name)
      if (existsSync(target)) rmSync(target, { recursive: true, force: true })
      const res = await runMagpie(["library", "skill", "hand-back", name])
      if (res.code === 0) moved.push(name)
      else failed.push({ name, error: (res.stderr || res.stdout).trim() })
    }
    restoreSources()
  } finally {
    try {
      rmdirSync(lockDir())
    } catch {}
  }

  return { ok: failed.length === 0, moved, failed }
}

// 状态：每个技能在库里、各 agent 目录里的形态
function status() {
  const lib = readJson(libraryJson(), { skills: [] })
  const rows = []
  for (const skill of lib.skills ?? []) {
    const name = skill.name
    rows.push({
      name,
      agents: (skill.agents ?? []).join(",") || "-",
      source: skill.source?.kind ?? "-",
      library: entryKind(join(libDir(), name)),
      shared: entryKind(join(agentsDir(), name)),
      visible: entryKind(join(agentsDir(), name)) === "dir",
    })
  }
  return rows
}

function formatStatus(rows) {
  const visible = rows.filter((r) => r.visible).length
  const stale = rows.filter((r) => r.library === "dir").length
  const lines = [
    `技能共 ${rows.length} 个：Workspace 可读（实体目录）${visible} 个，待同步（库里是实体目录）${stale} 个`,
    "",
    "| 技能 | 勾选的 agent | 来源 | magpie 库 | ~/.agents/skills | Workspace 可见 |",
    "| --- | --- | --- | --- | --- | --- |",
  ]
  for (const r of rows) {
    lines.push(
      `| ${r.name} | ${r.agents} | ${r.source} | ${r.library} | ${r.shared} | ${r.visible ? "是" : "否"} |`,
    )
  }
  return lines.join("\n")
}

// 监听 magpie 技能库：magpie 一更新就自动同步
function startWatcher(log) {
  const dir = libDir()
  if (!existsSync(dir)) return
  let timer = null
  let running = false
  const trigger = () => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(async () => {
      if (running) return
      running = true
      try {
        const res = await sync({ quiet: true })
        if (res.moved.length > 0) log?.(`skill-bridge: 已同步 ${res.moved.length} 个技能到 ~/.agents/skills`)
      } catch (err) {
        log?.(`skill-bridge: 同步失败 ${err}`)
      } finally {
        running = false
      }
    }, 2000)
  }
  try {
    watch(dir, { persistent: false }, trigger)
  } catch {
    // 监听失败也不影响插件其它功能，用户仍可手动调用 skill_sync
  }
}

export const SkillBridgePlugin = async ({ client }) => {
  const log = (message) => {
    try {
      client?.app?.log?.({ level: "info", service: "skill-bridge", message })
    } catch {}
  }

  startWatcher(log)
  // 插件启动时先补一次，覆盖 magpie 关着时更新过的技能
  sync({ quiet: true }).catch(() => {})

  return {
    tool: {
      sync: {
        description:
          "把 magpie 技能库里更新过的技能同步到 ~/.agents/skills，让 WorkSpace 等读取该目录的 agent 用到新版本",
        args: {},
        async execute() {
          const res = await sync()
          if (!res.ok && res.failed?.length) {
            return `同步未完全成功：${res.failed.map((f) => `${f.name}（${f.error}）`).join("；")}`
          }
          if (!res.moved.length) return "没有待同步的技能，~/.agents/skills 已是最新"
          return `已同步 ${res.moved.length} 个技能到 ~/.agents/skills：${res.moved.join("、")}`
        },
      },
      status: {
        description: "查看 magpie 技能库里每个技能的分布：库内形态、~/.agents/skills 形态、Workspace 是否可见",
        args: {},
        async execute() {
          return formatStatus(status())
        },
      },
    },
  }
}

// 单元测试用；导出函数会被 magpie 当成插件，所以只导出对象
export const _internal = { sync, status, pendingUpdates, entryKind, formatStatus }
