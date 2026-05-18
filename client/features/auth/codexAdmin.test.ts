import { describe, expect, it } from 'vitest';

import { APP_ID } from '../../app/config';
import { isCodexGameAdmin } from './codexAdmin';

describe('isCodexGameAdmin', () => {
  it('returns true for platform admins', () => {
    expect(isCodexGameAdmin({ is_admin: true }, [])).toBe(true);
  });

  it('returns true for codex app role admin', () => {
    expect(isCodexGameAdmin({ is_admin: false }, [{ app_id: 'codex', role: 'admin' }])).toBe(true);
  });

  it('returns false for non-admin users', () => {
    expect(isCodexGameAdmin({ is_admin: false }, [{ app_id: 'codex', role: 'user' }])).toBe(false);
  });

  it('returns false when appRoles is undefined and user is not platform admin', () => {
    expect(isCodexGameAdmin({ is_admin: false }, undefined)).toBe(false);
  });

  it('returns false for admin role on a different app', () => {
    expect(isCodexGameAdmin({ is_admin: false }, [{ app_id: 'other', role: 'admin' }])).toBe(false);
  });

  it('returns true when codex admin appears among mixed app roles', () => {
    expect(
      isCodexGameAdmin({ is_admin: false }, [
        { app_id: 'other', role: 'admin' },
        { app_id: APP_ID, role: 'admin' },
      ]),
    ).toBe(true);
  });

  it('uses the first codex role entry when multiple codex roles exist', () => {
    expect(
      isCodexGameAdmin({ is_admin: false }, [
        { app_id: APP_ID, role: 'user' },
        { app_id: APP_ID, role: 'admin' },
      ]),
    ).toBe(false);
    expect(
      isCodexGameAdmin({ is_admin: false }, [
        { app_id: APP_ID, role: 'admin' },
        { app_id: APP_ID, role: 'user' },
      ]),
    ).toBe(true);
  });
});
