/**
 * Where ID photos live on the device: the app's own document directory,
 * never the camera roll. `expo-file-system` is loaded lazily, like every
 * other native module the register touches, so logic tests never load it.
 */

type FileSystemModule = typeof import("expo-file-system/legacy");

const PHOTO_FOLDER = "gov-id-photos/";

async function fileSystem(): Promise<FileSystemModule> {
  return import("expo-file-system/legacy");
}

export async function photoFolderUri(): Promise<string | null> {
  const FileSystem = await fileSystem();
  if (!FileSystem.documentDirectory) return null;
  const folder = `${FileSystem.documentDirectory}${PHOTO_FOLDER}`;
  await FileSystem.makeDirectoryAsync(folder, { intermediates: true }).catch(() => undefined);
  return folder;
}

export async function deletePhotoFile(fileUri: string): Promise<void> {
  const FileSystem = await fileSystem();
  await FileSystem.deleteAsync(fileUri, { idempotent: true });
}

export async function copyPhotoFile(from: string, to: string): Promise<void> {
  const FileSystem = await fileSystem();
  await FileSystem.copyAsync({ from, to });
}

/** Size in bytes, or null when the file is gone. */
export async function photoFileSize(fileUri: string): Promise<number | null> {
  const FileSystem = await fileSystem();
  const info = await FileSystem.getInfoAsync(fileUri);
  return info.exists && typeof info.size === "number" ? info.size : null;
}

export async function readPhotoBase64(fileUri: string): Promise<string | null> {
  const FileSystem = await fileSystem();
  const info = await FileSystem.getInfoAsync(fileUri);
  if (!info.exists) return null;
  return FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
}

export async function listPhotoFiles(): Promise<{ folder: string; names: string[] } | null> {
  const folder = await photoFolderUri();
  if (!folder) return null;
  const FileSystem = await fileSystem();
  const names = await FileSystem.readDirectoryAsync(folder).catch(() => [] as string[]);
  return { folder, names };
}
