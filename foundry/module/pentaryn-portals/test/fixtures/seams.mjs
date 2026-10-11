/**
 * The one place the tests reach module internals. Today they all live in portals.mjs's
 * `_internals`; when S3 splits the file, this shim re-exports the same names from the new files,
 * and no test changes. Import it only after the Foundry stub is installed (the entry registers
 * hooks at evaluation).
 */
export async function seams() {
  return (await import("../../portals.mjs"))._internals;
}
