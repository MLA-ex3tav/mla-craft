export type ServerType =
  | "vanilla"
  | "paper"
  | "spigot"
  | "fabric"
  | "neoforge"
  | "forge";

export const SERVER_TYPES: ServerType[] = [
  "vanilla",
  "paper",
  "spigot",
  "fabric",
  "neoforge",
  "forge",
];

export const SERVER_TYPE_LABELS: Record<ServerType, string> = {
  vanilla: "Vanilla",
  paper: "Paper",
  spigot: "Spigot",
  fabric: "Fabric",
  neoforge: "NeoForge",
  forge: "Forge",
};

export interface AppInfo {
  name: string;
  version: string;
  os: string;
  arch: string;
  appDataDir: string;
}

export interface McVersion {
  id: string;
  versionType: string;
  javaMajor: number | null;
  latest: boolean;
}

export interface BuildInfo {
  id: string;
  channel: string | null;
  releasedAt: string | null;
}

export interface Instance {
  id: string;
  name: string;
  type: ServerType;
  mcVersion: string;
  loaderVersion: string | null;
  build: number | null;
  javaPath: string | null;
  javaMajor: number | null;
  memoryMinMb: number;
  memoryMaxMb: number;
  jvmArgs: string[];
  port: number;
  mcsrCoop?: boolean;
  createdAt: string;
  lastStarted: string | null;
  installed: boolean;
  dir: string;
  backupIntervalMinutes?: number | null;
  backupRetention?: number | null;
  restartIntervalMinutes?: number | null;
  lastBackupAt?: string | null;
  lastRestartAt?: string | null;
}

export interface NewInstanceRequest {
  dir: string;
  name: string;
  type: ServerType;
  mcVersion: string;
  loaderVersion?: string | null;
  build?: number | null;
  memoryMinMb: number;
  memoryMaxMb: number;
  port: number;
  mcsrCoop?: boolean;
}

export interface JavaRuntime {
  major: number;
  path: string;
  version: string;
  source: string;
}

export interface TaskProgress {
  id: string;
  phase: string;
  downloaded: number;
  total: number | null;
  percent: number;
  message: string | null;
}

export type ServerState =
  | "starting"
  | "running"
  | "stopping"
  | "stopped"
  | "crashed";

export interface LogLine {
  id: string;
  line: string;
}

export interface StateChange {
  id: string;
  state: ServerState;
}

export interface ServerProperty {
  key: string;
  value: string;
  kind: "text" | "int" | "bool" | "enum";
  options?: string[];
  label: string;
  description: string;
}

export interface ServerSettings {
  memoryMinMb: number;
  memoryMaxMb: number;
  jvmArgs: string[];
  port: number;
  mcsrCoop?: boolean;
}

export interface PlayerEntry {
  uuid?: string;
  name?: string;
  ip?: string;
  reason?: string;
  level?: number;
  [key: string]: unknown;
}

export interface PlayersData {
  whitelist: PlayerEntry[];
  ops: PlayerEntry[];
  bannedPlayers: PlayerEntry[];
  bannedIps: PlayerEntry[];
}

export interface PlayerIdentity {
  uuid: string;
  name: string;
}

export interface FsEntry {
  name: string;
  path: string;
  isDir: boolean;
}

export interface ContentFile {
  name: string;
  display: string;
  size: number;
  enabled: boolean;
  projectName: string | null;
  iconUrl: string | null;
}

export interface ContentProject {
  source: string;
  id: string;
  name: string;
  description: string;
  iconUrl: string | null;
  downloads: number;
  author: string | null;
}

export interface ContentCategory {
  id: string;
  name: string;
}

export interface ContentSearchPage {
  projects: ContentProject[];
  total: number | null;
  hasMore: boolean;
}

export interface ContentSearchOptions {
  page?: number;
  query?: string;
  category?: string;
  sort?: string;
}

export interface BackupEntry {
  name: string;
  size: number;
  created: string;
}

export interface ScheduleSettings {
  backupIntervalMinutes: number | null;
  backupRetention: number | null;
  restartIntervalMinutes: number | null;
}

export interface PlayerInventoryItem { id: string; slot: number | null; count: number }
export interface PlayerSnapshot {
  uuid: string;
  savedAt: string | null;
  source: "saved" | "live";
  observedAt?: string;
  health: number | null;
  food: number | null;
  xpLevel: number | null;
  xpProgress: number | null;
  position: number[] | null;
  dimension: string | number | null;
  gameMode: number | null;
  lastDeath: { pos: number[]; dimension: string | number | null } | null;
  inventory: PlayerInventoryItem[] | null;
  enderChest: PlayerInventoryItem[] | null;
  dataVersion: number | null;
}
