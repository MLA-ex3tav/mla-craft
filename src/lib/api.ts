import { invoke } from "./transport";
import type {
  AppInfo,
  BackupEntry,
  BuildInfo,
  ContentCategory,
  ContentFile,
  ContentSearchOptions,
  ContentSearchPage,
  Instance,
  JavaRuntime,
  McVersion,
  NewInstanceRequest,
  PlayerEntry,
  PlayerIdentity,
  PlayersData,
  PlayerSnapshot,
  ScheduleSettings,
  ServerProperty,
  ServerSettings,
  ServerType,
} from "./types";

export function getAppInfo(): Promise<AppInfo> {
  return invoke<AppInfo>("get_app_info");
}

export function listInstances(): Promise<Instance[]> {
  return invoke<Instance[]>("list_instances");
}

export function getInstance(id: string): Promise<Instance> {
  return invoke<Instance>("get_instance", { id });
}

function announceInstances<T>(result: T): T {
  window.dispatchEvent(new Event("mla-instances-changed"));
  return result;
}

export function createInstance(request: NewInstanceRequest): Promise<Instance> {
  return invoke<Instance>("create_instance", { request }).then(announceInstances);
}

export function updateInstance(
  instance: Instance,
  dir: string,
): Promise<Instance> {
  return invoke<Instance>("update_instance", { instance, dir }).then(announceInstances);
}

export function deleteInstance(id: string, deleteFiles: boolean): Promise<void> {
  return invoke<void>("delete_instance", { id, deleteFiles }).then(announceInstances);
}

export function listMcVersions(serverType: ServerType): Promise<McVersion[]> {
  return invoke<McVersion[]>("list_mc_versions", { serverType });
}

export function listBuilds(
  serverType: ServerType,
  mcVersion: string,
): Promise<BuildInfo[]> {
  return invoke<BuildInfo[]>("list_builds", { serverType, mcVersion });
}

export function installServer(id: string): Promise<Instance> {
  return invoke<Instance>("install_server", { id });
}

export function getEula(id: string): Promise<boolean> {
  return invoke<boolean>("get_eula", { id });
}

export function setEula(id: string, accepted: boolean): Promise<void> {
  return invoke<void>("set_eula", { id, accepted });
}

export function listJavaRuntimes(): Promise<JavaRuntime[]> {
  return invoke<JavaRuntime[]>("list_java_runtimes");
}

export function ensureJavaRuntime(major: number): Promise<JavaRuntime> {
  return invoke<JavaRuntime>("ensure_java_runtime", { major });
}

export function systemMemoryMb(): Promise<number> {
  return invoke<number>("system_memory_mb");
}

export function startServer(id: string): Promise<void> {
  return invoke<void>("start_server", { id });
}

export function stopServer(id: string): Promise<void> {
  return invoke<void>("stop_server", { id });
}

export function killServer(id: string): Promise<void> {
  return invoke<void>("kill_server", { id });
}

export function sendServerCommand(id: string, command: string): Promise<void> {
  return invoke<void>("send_server_command", { id, command });
}

export function serverStatus(id: string): Promise<boolean> {
  return invoke<boolean>("server_status", { id });
}

export function onlinePlayers(id: string): Promise<string[]> {
  return invoke<string[]>("online_players", { id });
}

export function getServerProperties(id: string): Promise<ServerProperty[]> {
  return invoke<ServerProperty[]>("get_server_properties", { id });
}

export function setServerProperties(
  id: string,
  values: Record<string, string>,
): Promise<void> {
  return invoke<void>("set_server_properties", { id, values });
}

export function updateServerSettings(
  id: string,
  settings: ServerSettings,
): Promise<Instance> {
  return invoke<Instance>("update_server_settings", { id, settings });
}

export function getPlayers(id: string): Promise<PlayersData> {
  return invoke<PlayersData>("get_players", { id });
}

export function savePlayerList(
  id: string,
  list: string,
  entries: PlayerEntry[],
): Promise<void> {
  return invoke<void>("save_player_list", { id, list, entries });
}

export function removePlayer(
  id: string,
  list: string,
  idField: string,
  value: string,
): Promise<PlayersData> {
  return invoke<PlayersData>("remove_player", { id, list, idField, value });
}

export function lookupPlayer(name: string): Promise<PlayerIdentity> {
  return invoke<PlayerIdentity>("lookup_player", { name });
}

export function listContent(id: string): Promise<ContentFile[]> {
  return invoke<ContentFile[]>("list_content", { id });
}

export function toggleContent(id: string, name: string): Promise<void> {
  return invoke<void>("toggle_content", { id, name });
}

export function deleteContent(id: string, name: string): Promise<void> {
  return invoke<void>("delete_content", { id, name });
}

export function addContentFile(id: string, path: string): Promise<string> {
  return invoke<string>("add_content_file", { id, path });
}

export function searchContent(
  id: string,
  source: string,
  options: ContentSearchOptions = {},
): Promise<ContentSearchPage> {
  return invoke<ContentSearchPage>("search_content", {
    page: options.page ?? 0,
    id,
    source,
    query: options.query ?? null,
    category: options.category ?? null,
    sort: options.sort ?? null,
  });
}

export function listContentCategories(
  id: string,
  source: string,
): Promise<ContentCategory[]> {
  return invoke<ContentCategory[]>("list_content_categories", { id, source });
}

export function installContent(
  id: string,
  source: string,
  projectId: string,
): Promise<string[]> {
  return invoke<string[]>("install_content", { id, source, projectId });
}

export function installedContentIds(id: string): Promise<string[]> {
  return invoke<string[]>("installed_content_ids", { id });
}

export function listBackups(id: string): Promise<BackupEntry[]> {
  return invoke<BackupEntry[]>("list_backups", { id });
}

export function createBackup(id: string): Promise<string> {
  return invoke<string>("create_backup", { id });
}

export function deleteBackup(id: string, name: string): Promise<void> {
  return invoke<void>("delete_backup", { id, name });
}

export function updateSchedule(
  id: string,
  settings: ScheduleSettings,
): Promise<Instance> {
  return invoke<Instance>("update_schedule", { id, settings });
}

export function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  return String(err);
}

export function exportMrpack(id: string, path: string): Promise<{ indexed: number; bundled: number }> {
  return invoke<{ indexed: number; bundled: number }>("export_mrpack", { id, path });
}

export function restartServer(id: string): Promise<void> {
  return invoke<void>("restart_server", { id });
}

export function getPlayerSnapshot(id: string, player: PlayerEntry): Promise<PlayerSnapshot> {
  return invoke<PlayerSnapshot>("get_player_snapshot", { id, name: player.name ?? null, uuid: player.uuid ?? null });
}
