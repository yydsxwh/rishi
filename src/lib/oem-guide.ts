/** 各厂商后台限制不一样。这里只给系统设置路径，不用私有接口去绕过。 */

export type OemGuide = { brand: string; steps: string[] }

const GUIDES: { match: RegExp; guide: OemGuide }[] = [
  {
    match: /samsung/i,
    guide: {
      brand: 'Samsung',
      steps: [
        '设置 → 应用 → 颗秒日事 → 电池 → 不受限制',
        '设置 → 应用 → 颗秒日事 → 闹钟和提醒 → 允许',
        '通知里允许全屏意图，锁屏时才能弹出闹钟',
      ],
    },
  },
  {
    match: /xiaomi|redmi|poco|hyperos/i,
    guide: {
      brand: 'Xiaomi',
      steps: [
        '设置 → 应用设置 → 颗秒日事 → 省电策略 → 无限制',
        '开启自启动，否则划掉后台后收不到同步',
        '允许精确闹钟和锁屏通知',
      ],
    },
  },
  {
    match: /honor|huawei|magicui|emui/i,
    guide: {
      brand: 'Honor',
      steps: [
        '设置 → 应用 → 颗秒日事 → 电池 → 允许后台活动',
        '启动管理里改为手动管理，并允许自启动和后台活动',
        '允许闹钟和提醒，锁屏通知不要静默',
      ],
    },
  },
  {
    match: /oppo|realme|coloros/i,
    guide: {
      brand: 'OPPO',
      steps: [
        '设置 → 电池 → 应用耗电管理 → 颗秒日事 → 允许完全后台行为',
        '允许自启动和锁屏显示',
        '允许精确闹钟',
      ],
    },
  },
  {
    match: /vivo|iqoo|originos/i,
    guide: {
      brand: 'vivo',
      steps: [
        '设置 → 电池 → 后台耗电管理 → 颗秒日事 → 允许高耗电',
        '允许自启动和锁屏显示',
        '允许精确闹钟',
      ],
    },
  },
  {
    match: /pixel|google/i,
    guide: {
      brand: 'Pixel',
      steps: [
        '设置 → 应用 → 颗秒日事 → 闹钟和提醒 → 允许',
        '电池优化选不受限',
        '通知允许弹出',
      ],
    },
  },
]

export function oemGuide(hint: string): OemGuide {
  const found = GUIDES.find((item) => item.match.test(hint))
  if (found) return found.guide
  return {
    brand: 'Android',
    steps: [
      '允许通知、精确闹钟，并把电池优化设为不受限',
      '厂商系统如果有自启动或后台限制，需要手动打开',
      '权限被关掉或手机关机时，界面会显示失败，不会假装已经响铃',
    ],
  }
}
