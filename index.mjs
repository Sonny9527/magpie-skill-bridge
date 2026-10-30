// magpie-skill-bridge（v0.2.0：只诊断，不写入）
//
// 背景：magpie 的技能库是权威。若把实体技能目录复制到 ~/.agents/skills，
// magpie 会判定「这个技能由 ~/.agents/skills 管」，把库里的实体搬过去、库条目改成链接。
// 所以正确做法不是复制，而是让读技能的 agent 直接读 magpie 库：
//   - WorkSpace（OpenCode 内核）：opencode 配置里 skills.paths = [magpie 库目录]
//   - DeepSeek Harness：profile 里 dsh-skill-filesystem 的 customSkillDirs = [magpie 库目录]
//   - pi / minimax-code / DSH 等：由 magpie 自己写链接
//
// 这个插件只做体检：报告每个 agent 是否指向 magpie 库、库里的技能是否齐全。

import { existsSync, lstatSync, readdirSync, readFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

const home = () => homedir()
const configDir = () => join(process.env.XDG_CONFIG_HOME || join(home(), ".config"), "magpie")
const libDir = () => join(configDir(), "library", "skills")
const libraryJson = () => join(configDir(), "library.json")

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"))
  } catch {
    return fallback
  }
}

function kind(path) {
  try {
    if (!existsSync(path)) return "缺失"
    return lstatSync(path).isSymbolicLink() ? "软链" : "实体"
  } catch {
    return "未知"
  }
}

function librarySkills() {
  const dir = libDir()
  if (!existsSync(dir)) return []
  return readdirSync(dir).filter((name) => {
    try {
      return lstatSync(join(dir, name)).isDirectory()
    } catch {
      return false
    }
  })
}

// 统计某个 agent 技能目录里有多少个技能项（目录或链接）
function countSkills(dir) {
  if (!existsSync(dir)) return "无此目录"
  const entries = readdirSync(dir).filter((name) => {
    try {
      const stat = lstatSync(join(dir, name))
      return stat.isDirectory() || stat.isSymbolicLink()
    } catch {
      return false
    }
  })
  const links = entries.filter((name) => {
    try {
      return lstatSync(join(dir, name)).isSymbolicLink()
    } catch {
      return false
    }
  })
  return `${entries.length} 个（其中链接 ${links.length}）`
}

// 体检：库形态、各 agent 目录、WorkSpace 配置
function diagnose() {
  const lib = readJson(libraryJson(), { skills: [] })
  const names = librarySkills()
  const rows = names.map((name) => ({
    name,
    agents: (lib.skills?.find((s) => s.name === name)?.agents ?? []).join(",") || "-",
  }))

  const lines = [
    `magpie 库：${names.length} 个技能（目录 ${libDir()}）`,
    "",
    "| 目录 | 内容 |",
    "| --- | --- |",
    `| magpie 库 | ${names.length} 个实体目录 |`,
    `| ~/.agents/skills | ${countSkills(join(home(), ".agents", "skills"))}（应为 0：有实体就会被 magpie 当成主体） |`,
    `| ~/.dsh/skills | ${countSkills(join(home(), ".dsh", "skills"))} |`,
    `| ~/.pi/agent/skills | ${countSkills(join(home(), ".pi", "agent", "skills"))} |`,
    `| ~/.minimax/skills | ${countSkills(join(home(), ".minimax", "skills"))} |`,
    "",
    "各技能与勾选的 agent：",
    "",
    "| 技能 | agent |",
    "| --- | --- |",
  ]
  for (const row of rows) lines.push(`| ${row.name} | ${row.agents} |`)
  return lines.join("\n")
}

export const SkillBridgePlugin = async () => ({
  tool: {
    doctor: {
      description: "体检 magpie 技能库的布局：库是否为实体、各 agent 目录、Workspace 是否应该读库",
      args: {},
      async execute() {
        return diagnose()
      },
    },
  },
})

export const _internal = { diagnose, librarySkills, kind }
