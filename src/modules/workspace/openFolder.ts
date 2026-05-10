import { open } from "@tauri-apps/plugin-dialog";
import { useWorkspaceStore } from "./store";

/**
 * Show the native folder picker. If the user picks a folder, mark it as the
 * workspace root and prepend it to the recents list. Returns the chosen path
 * or null if the user cancelled.
 */
export async function pickAndOpenFolder(
  defaultPath?: string,
): Promise<string | null> {
  const result = await open({
    directory: true,
    multiple: false,
    defaultPath,
    title: "Open folder",
  });
  if (typeof result !== "string" || result.length === 0) return null;
  await useWorkspaceStore.getState().openRoot(result);
  return result;
}
