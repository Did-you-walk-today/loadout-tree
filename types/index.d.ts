export type SkillEntry = { name: string; plugin?: string; tokens: number; source: string }
export type ServerEntry = { server: string; label: string; plugin?: string; tokens: number; tools: string[] }
export type Inventory = { skills: SkillEntry[]; servers: ServerEntry[]; descriptions: Record<string, string> }
export type Translated = Record<string, { source: string; text: string }>
export type Categories = Record<string, { source: string; category: string }>
export type HookSeen = { event: string; head: string; tokens: number; isCut: boolean }

declare module 'claude-code' {
  interface PluginState {
    loadout: {
      inventory: Shaped<Inventory>
      off: Shaped<string[]>
      language: Shaped<string>
      translated: Shaped<Translated>
      expanded: Shaped<string[]>
      presets: Shaped<Record<string, { off: string[] }>>
      activePreset: Shaped<string>
      starred: Shaped<string[]>
      descs: Shaped<Record<string, string>>
      showBasic: Shaped<boolean>
      categories: Shaped<Categories>
      view: Shaped<string>
      inFlight: Shaped<string[]>
      recent: Shaped<string[]>
      startOff: Shaped<string[]>
      band: Shaped<string>
      once: Shaped<string[]>
      hookSeen: Shaped<Record<string, HookSeen>>
      skillSeen: Shaped<Record<string, number>>
    }
  }
}
