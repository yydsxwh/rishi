import type { DaysConfig } from './config'
import { dispatchToUser } from './push-dispatch'

/** 只唤醒设备去拉授权过的闹钟。具体走哪家推送由设备上报的可用通道决定。 */
export async function wakeOwnerDevices(config: DaysConfig, ownerUserId: string): Promise<{ pushed: number; skipped: string }> {
  return dispatchToUser(config, ownerUserId)
}
