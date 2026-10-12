import assert from 'node:assert/strict'
import { test } from 'node:test'
import { multiAccountTabsEnabled, resolveAccess, type AccountRecord, type BrokerState } from './tab-decision'

const TAB_ADMIN = 'tabcontextadmin0001'
const TAB_STUDENT = 'tabcontextstud00003'

function person(partial: Pick<AccountRecord, 'sessionId' | 'userId' | 'grantedRoles' | 'defaultRole'>): AccountRecord {
  return {
    active: true,
    pendingReview: false,
    authTimeSec: 1_700_000_000,
    display: {
      name: partial.userId,
      kkNumber: null,
      emailMasked: '',
      phoneMasked: '',
      avatarUrl: '',
      subHint: partial.userId,
    },
    ...partial,
  }
}

test('days web tabs stay off until explicitly enabled and do not share identity', () => {
  assert.equal(multiAccountTabsEnabled({}), false)
  assert.equal(multiAccountTabsEnabled({ MULTI_ACCOUNT_TABS: 'false' }), false)
  assert.equal(multiAccountTabsEnabled({ MULTI_ACCOUNT_TABS: 'true' }), true)
  const admin = person({
    sessionId: 'sess-admin',
    userId: 'usr_admin',
    grantedRoles: ['ADMIN'],
    defaultRole: 'ADMIN',
  })
  const student = person({
    sessionId: 'sess-student',
    userId: 'usr_student',
    grantedRoles: ['STUDENT'],
    defaultRole: 'STUDENT',
  })
  const state: BrokerState = {
    explicitPick: true,
    defaultSessionId: null,
    accounts: [admin, student],
    tabs: [
      { contextId: TAB_ADMIN, sessionId: admin.sessionId, activeRole: 'ADMIN', revoked: false },
      { contextId: TAB_STUDENT, sessionId: student.sessionId, activeRole: 'STUDENT', revoked: false },
    ],
  }
  const left = resolveAccess(state, { tabHeader: TAB_ADMIN })
  const right = resolveAccess(state, { tabHeader: TAB_STUDENT })
  assert.equal(left.kind, 'ready')
  assert.equal(right.kind, 'ready')
  if (left.kind === 'ready' && right.kind === 'ready') {
    assert.equal(left.account.userId, 'usr_admin')
    assert.equal(right.account.userId, 'usr_student')
    assert.deepEqual(right.permissionRoles, ['STUDENT'])
    assert.notEqual(left.account.userId, right.account.userId)
  }
  assert.equal(resolveAccess(state, { tabHeader: null }).kind, 'ambiguous')
})
