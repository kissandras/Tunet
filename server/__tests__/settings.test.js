// @vitest-environment node

import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { writeCurrentSettingsSnapshot } from '../routes/settings.js';

const createTestDb = () => {
  const database = new Database(':memory:');
  database.exec(`
    CREATE TABLE current_settings (
      ha_user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      device_label TEXT,
      data TEXT NOT NULL,
      data_enc TEXT,
      revision INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (ha_user_id, device_id)
    );

    CREATE TABLE current_settings_history (
      ha_user_id TEXT NOT NULL,
      device_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      data TEXT NOT NULL,
      data_enc TEXT,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (ha_user_id, device_id, revision)
    );

    CREATE INDEX idx_current_settings_history_lookup
      ON current_settings_history(ha_user_id, device_id, revision DESC);
  `);
  return database;
};

describe('writeCurrentSettingsSnapshot', () => {
  let database;

  beforeEach(() => {
    database = createTestDb();
  });

  afterEach(() => {
    database.close();
  });

  it('creates the first revision for a new device', () => {
    const result = writeCurrentSettingsSnapshot({
      database,
      haUserId: 'user-1',
      deviceId: 'device-1',
      data: { version: 1 },
      baseRevision: null,
      historyKeepLimit: 50,
    });

    expect(result).toMatchObject({ ok: true, revision: 1 });
    const row = database
      .prepare('SELECT revision FROM current_settings WHERE ha_user_id = ? AND device_id = ?')
      .get('user-1', 'device-1');
    expect(row).toEqual({ revision: 1 });
  });

  it('rejects updates without a usable base revision when the row already exists', () => {
    writeCurrentSettingsSnapshot({
      database,
      haUserId: 'user-1',
      deviceId: 'device-1',
      data: { version: 1 },
      baseRevision: null,
      historyKeepLimit: 50,
    });

    const result = writeCurrentSettingsSnapshot({
      database,
      haUserId: 'user-1',
      deviceId: 'device-1',
      data: { version: 2 },
      baseRevision: undefined,
      historyKeepLimit: 50,
    });

    expect(result).toEqual({
      ok: false,
      status: 409,
      error: 'Revision conflict',
      revision: 1,
    });
  });

  it('uses compare-and-swap semantics for updates', () => {
    writeCurrentSettingsSnapshot({
      database,
      haUserId: 'user-1',
      deviceId: 'device-1',
      data: { version: 1 },
      baseRevision: null,
      historyKeepLimit: 50,
    });

    const firstUpdate = writeCurrentSettingsSnapshot({
      database,
      haUserId: 'user-1',
      deviceId: 'device-1',
      data: { version: 2 },
      baseRevision: 1,
      historyKeepLimit: 50,
    });
    const staleUpdate = writeCurrentSettingsSnapshot({
      database,
      haUserId: 'user-1',
      deviceId: 'device-1',
      data: { version: 3 },
      baseRevision: 1,
      historyKeepLimit: 50,
    });

    expect(firstUpdate).toMatchObject({ ok: true, revision: 2 });
    expect(staleUpdate).toEqual({
      ok: false,
      status: 409,
      error: 'Revision conflict',
      revision: 2,
    });
  });
});