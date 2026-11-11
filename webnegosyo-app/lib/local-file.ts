/**
 * Read a picked local file (file:// or content:// uri) into a Blob.
 *
 * React Native's fetch resolves local uris, so this needs no native module and
 * ships over the air. Kept in its own module so upload tests can stub it.
 */
export async function readLocalFile(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  return res.blob();
}
