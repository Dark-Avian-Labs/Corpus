import { describe, expect, it } from 'vitest';

import { effectiveAppAdmin, type RemoteAuthState } from './auth.js';

function state(partial: Partial<RemoteAuthState> & Pick<RemoteAuthState, 'authenticated' | 'user'>): RemoteAuthState {
  return {
    has_game_access: true,
    permissions: [],
    app_roles: [],
    ...partial,
  };
}

describe('effectiveAppAdmin', () => {
  it('returns true for platform admins', () => {
    expect(
      effectiveAppAdmin(
        state({
          authenticated: true,
          user: { id: 1, username: 'a', is_admin: true },
        }),
      ),
    ).toBe(true);
  });

  it('returns true for codex app role admin', () => {
    expect(
      effectiveAppAdmin(
        state({
          authenticated: true,
          user: { id: 1, username: 'a', is_admin: false },
          app_roles: [{ app_id: 'codex', role: 'admin' }],
        }),
      ),
    ).toBe(true);
  });

  it('returns false for non-admin users', () => {
    expect(
      effectiveAppAdmin(
        state({
          authenticated: true,
          user: { id: 1, username: 'a', is_admin: false },
          app_roles: [{ app_id: 'codex', role: 'user' }],
        }),
      ),
    ).toBe(false);
  });

  it('returns false when not authenticated', () => {
    expect(
      effectiveAppAdmin(
        state({
          authenticated: false,
          user: null,
        }),
      ),
    ).toBe(false);
    expect(
      effectiveAppAdmin(
        state({
          authenticated: false,
          user: { id: 1, username: 'a', is_admin: true },
          app_roles: [{ app_id: 'codex', role: 'admin' }],
        }),
      ),
    ).toBe(false);
  });

  it('returns false for codex admin roles when checking a different app id', () => {
    expect(
      effectiveAppAdmin(
        state({
          authenticated: true,
          user: { id: 1, username: 'a', is_admin: false },
          app_roles: [{ app_id: 'codex', role: 'admin' }],
        }),
        'other-app',
      ),
    ).toBe(false);
  });

  it('returns true when admin role exists for the explicit app id', () => {
    expect(
      effectiveAppAdmin(
        state({
          authenticated: true,
          user: { id: 1, username: 'a', is_admin: false },
          app_roles: [{ app_id: 'other-app', role: 'admin' }],
        }),
        'other-app',
      ),
    ).toBe(true);
  });

  it('returns false when app_roles is empty or undefined', () => {
    expect(
      effectiveAppAdmin(
        state({
          authenticated: true,
          user: { id: 1, username: 'a', is_admin: false },
          app_roles: [],
        }),
      ),
    ).toBe(false);
    expect(
      effectiveAppAdmin(
        state({
          authenticated: true,
          user: { id: 1, username: 'a', is_admin: false },
          app_roles: undefined,
        }),
      ),
    ).toBe(false);
  });
});
