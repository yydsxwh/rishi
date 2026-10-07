import { useEffect, useState } from 'react'
import { loadContacts, resolveAccount, type TrustedAccount } from '../lib/location'

const MATCH_LABEL: Record<string, string> = {
  ACCOUNT: '账号',
  KK_NUMBER: 'KK号',
  EMAIL: '邮箱',
  PHONE: '手机号',
  USER_SUB: '账号 ID',
}

/** 选人只负责找到 usr_。确认之后才由外层创建闹钟或位置授权。 */
export default function TrustPersonPicker({ onConfirm }: { onConfirm: (person: TrustedAccount) => void }) {
  const [contacts, setContacts] = useState<{ sub: string; displayName: string; username: string | null; kkNumber: number | null }[]>([])
  const [source, setSource] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [pending, setPending] = useState<TrustedAccount | null>(null)
  const [error, setError] = useState('')
  const [debugId, setDebugId] = useState('')

  useEffect(() => {
    void loadContacts()
      .then((body) => {
        setContacts(body.contacts)
        setSource(body.source)
      })
      .catch(() => setSource('unavailable'))
  }, [])

  async function lookup() {
    setError('')
    setPending(null)
    try {
      setPending(await resolveAccount(identifier.trim()))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '没有找到可授权的账号，请核对输入内容')
    }
  }

  function confirm(person: TrustedAccount) {
    setPending(null)
    setIdentifier('')
    onConfirm(person)
  }

  return (
    <div>
      <h4>添加可信联系人</h4>
      <p className="muted">可以从最近私聊里选，也可以输入账号、KK号、邮箱或手机号。是不是 KKChat 好友，不决定能不能授权。</p>
      {source === 'unconfigured' && <p className="muted">最近联系人还没接上 KKChat。你仍然可以用账号、KK号、邮箱或手机号添加。</p>}
      <div className="row wrap">
        {contacts.map((contact) => (
          <button
            key={contact.sub}
            className="btn ghost"
            type="button"
            onClick={() =>
              setPending({
                userSub: contact.sub,
                displayName: contact.displayName,
                avatarUrl: '',
                matchedBy: 'ACCOUNT',
                maskedIdentifier: contact.username || (contact.kkNumber ? String(contact.kkNumber) : '最近联系人'),
                accountName: contact.username || '',
                kkNumberMasked: contact.kkNumber ? `${String(contact.kkNumber).slice(0, 2)}***` : '',
              })
            }
          >
            {contact.displayName}
          </button>
        ))}
      </div>
      <label>
        输入账号、KK号、邮箱或手机号
        <input className="input" value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder="账号、KK号、邮箱或手机号" />
      </label>
      <button className="btn ghost" type="button" onClick={() => void lookup()}>查找</button>
      {error && <p className="muted">{error}</p>}
      {pending && (
        <div className="card">
          <strong>确认授权给：</strong>
          <p>昵称：{pending.displayName}</p>
          {pending.accountName && <p>账号：{pending.accountName}</p>}
          {pending.kkNumberMasked && <p>KK号：{pending.kkNumberMasked}</p>}
          <p>匹配方式：{MATCH_LABEL[pending.matchedBy] || '账号'} {pending.maskedIdentifier}</p>
          <div className="row wrap">
            <button className="btn primary" type="button" onClick={() => confirm(pending)}>确认是此人</button>
            <button className="btn ghost" type="button" onClick={() => setPending(null)}>取消</button>
          </div>
        </div>
      )}
      <details>
        <summary>开发调试：直接填写 usr_</summary>
        <label>
          账号 ID
          <input className="input" value={debugId} onChange={(event) => setDebugId(event.target.value)} />
        </label>
        <button
          className="btn ghost"
          type="button"
          onClick={() => {
            const userSub = debugId.trim()
            if (!userSub.startsWith('usr_')) {
              setError('调试入口只接受 usr_ 开头的账号 ID')
              return
            }
            confirm({ userSub, displayName: '调试账号', avatarUrl: '', matchedBy: 'USER_SUB', maskedIdentifier: '账号 ID', accountName: '', kkNumberMasked: '' })
          }}
        >
          使用这个账号 ID
        </button>
      </details>
    </div>
  )
}
