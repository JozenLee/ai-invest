/** A detached worker must survive its parent closing the startup channel. */
export async function notifyAnalysisParent(message: { ready?: boolean; error?: string }) {
  if (!process.connected || !process.send) return
  await new Promise<void>(resolve => {
    try {
      process.send!(message, () => resolve())
    } catch {
      resolve()
    }
  })
}
