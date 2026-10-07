import { useEffect, useState } from 'react'
import { daysFetch } from '../lib/days-api'
import { oemGuide } from '../lib/oem-guide'

type Item = { ok: boolean | null; label: string; detail: string }

/** 网页上能检查的只有登录和浏览器定位。闹钟和后台定位以 Android 本机检查为准。 */
export default function DeviceHealthCard() {
  const [items, setItems] = useState<Item[]>([])
  const guide = oemGuide(typeof navigator === 'undefined' ? '' : navigator.userAgent)

  useEffect(() => {
    void daysFetch('/api/days/auth/session')
      .then((response) => response.json())
      .then((body: { user?: { name?: string } | null }) => {
        const signedIn = Boolean(body.user)
        setItems([
          { ok: signedIn, label: '登录', detail: signedIn ? `已登录 ${body.user?.name || ''}` : '还没登录，授权和同步都不可用' },
          { ok: false, label: '推送', detail: '网页不能接收 FCM。远程闹钟要装 Android 客户端。' },
          { ok: null, label: '精确闹钟', detail: '网页不能登记系统闹钟。' },
          { ok: null, label: '定位', detail: '点「更新我的最近位置」后才会向系统要定位权限。' },
          { ok: false, label: 'iPhone 远程闹钟', detail: '尚未验证，不能当成已经支持。' },
        ])
      })
      .catch(() => setItems([{ ok: false, label: '登录', detail: '暂时连不上日事服务' }]))
  }, [])

  return (
    <div className="card">
      <h3>设备检查</h3>
      <p className="muted">发送成功不等于手机一定会响。只有对方手机回执「已成功设置」之后才算设好。</p>
      {items.map((item) => (
        <p key={item.label}>{item.ok == null ? '·' : item.ok ? '✅' : '⚠️'} {item.label}：{item.detail}</p>
      ))}
      <h4>{guide.brand} 后台设置</h4>
      {guide.steps.map((step) => <p key={step}>{step}</p>)}
    </div>
  )
}
