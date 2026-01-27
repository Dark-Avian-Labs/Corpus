/**
 * Epic7 – Import account data (hero ratings, artifact gauge) into a game account
 *
 * Expects Heros.csv (Hero,Class,Element,Stars,Imprint) and Artifacts.csv
 * (Artifact,Class,Stars,Limit Break) in the import folder. Comma-delimited.
 *
 * Set TARGET_ACCOUNT_ID in .env or pass as first CLI arg.
 *
 * Usage: npx tsx import/importAccount.ts [accountId]
 *    or: npm run import-account
 */

import { config as loadEnv } from '@dotenvx/dotenvx';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

import { CSV_IMPORT_DIR, SQLITE_DB_PATH } from '../src/config.js';

loadEnv();

const HERO_RATINGS = ['-', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS'] as const;

function output(msg: string): void {
  console.log(msg);
}

function outputError(msg: string): void {
  console.error('ERROR:', msg);
}

function outputSuccess(msg: string): void {
  console.log('✓', msg);
}

function outputWarn(msg: string): void {
  console.warn('⚠', msg);
}

function parseGauge(val: string): number {
  const n = parseInt(val, 10);
  if (!isNaN(n)) return Math.max(0, Math.min(5, n));
  const filled = (val.match(/▰/g) || []).length;
  return Math.max(0, Math.min(5, filled));
}

function normalizeRating(val: string): string {
  const v = val.toUpperCase().trim();
  if (HERO_RATINGS.includes(v as (typeof HERO_RATINGS)[number])) return v;
  if (!v || v === 'N/A' || v === 'NONE') return '-';
  return '-';
}

function run(): void {
  const accountIdArg = process.argv[2];
  const accountId = accountIdArg
    ? parseInt(accountIdArg, 10)
    : parseInt(process.env.TARGET_ACCOUNT_ID ?? '0', 10);

  output('Account Data Import');
  output(`Target Account ID: ${accountId || '(none)'}`);
  output('');

  if (!accountId || accountId < 1) {
    outputError(
      'Set TARGET_ACCOUNT_ID in .env or pass account ID as first argument.',
    );
    process.exit(1);
  }

  if (!fs.existsSync(SQLITE_DB_PATH)) {
    outputError('Database not found. Run npm run import first.');
    process.exit(1);
  }

  const db = new Database(SQLITE_DB_PATH);

  const account = db
    .prepare('SELECT id, account_name FROM game_accounts WHERE id = ?')
    .get(accountId) as { id: number; account_name: string } | undefined;

  if (!account) {
    outputError(`Account ID ${accountId} not found.`);
    const rows = db
      .prepare(
        'SELECT ga.id, ga.account_name, u.username FROM game_accounts ga JOIN users u ON ga.user_id = u.id',
      )
      .all() as { id: number; account_name: string; username: string }[];
    if (rows.length) {
      output('Available accounts:');
      rows.forEach((r) =>
        output(`  ${r.id} – ${r.account_name} (${r.username})`),
      );
    }
    db.close();
    process.exit(1);
  }

  outputSuccess(`Account: ${account.account_name}`);
  output('');

  const heroesPath = path.join(CSV_IMPORT_DIR, 'Heros.csv');
  if (fs.existsSync(heroesPath)) {
    output('Importing hero data from Heros.csv...');
    const raw = fs.readFileSync(heroesPath, 'utf-8');
    const lines = raw.split(/\r?\n/).map((l) => l.replace(/^\uFEFF/, ''));
    const header = lines[0]?.split(',').map((c) => c.trim()) ?? [];
    const nameCol = header.findIndex((h) => /^Hero$/i.test(h));
    let ratingCol = header.findIndex((h) => /^Imprint$/i.test(h));
    if (ratingCol < 0 && header.length) ratingCol = header.length - 1;

    if (nameCol < 0) {
      outputError('Heros.csv: could not find "Hero" column.');
    } else {
      const update = db.prepare(
        'UPDATE account_heroes SET rating = ? WHERE account_id = ? AND LOWER(name) = LOWER(?)',
      );
      let updated = 0;
      let notFound = 0;
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i]!.split(',').map((c) => c.trim());
        const name = (cells[nameCol] ?? '').trim();
        if (!name) continue;
        const rating = normalizeRating(cells[ratingCol] ?? '-');
        const r = update.run(rating, accountId, name);
        if (r.changes > 0) updated++;
        else notFound++;
      }
      outputSuccess(`Heroes updated: ${updated}`);
      if (notFound) outputWarn(`Not found in account: ${notFound}`);
    }
  } else {
    output('No Heros.csv found. Skipping.');
  }
  output('');

  const artifactsPath = path.join(CSV_IMPORT_DIR, 'Artifacts.csv');
  if (fs.existsSync(artifactsPath)) {
    output('Importing artifact data from Artifacts.csv...');
    const raw = fs.readFileSync(artifactsPath, 'utf-8');
    const lines = raw.split(/\r?\n/).map((l) => l.replace(/^\uFEFF/, ''));
    const header = lines[0]?.split(',').map((c) => c.trim()) ?? [];
    const nameCol = header.findIndex((h) => /^Artifact$/i.test(h));
    let gaugeCol = header.findIndex((h) => /^Limit Break$/i.test(h));
    if (gaugeCol < 0 && header.length) gaugeCol = header.length - 1;

    if (nameCol < 0) {
      outputError('Artifacts.csv: could not find "Artifact" column.');
    } else {
      const update = db.prepare(
        'UPDATE account_artifacts SET gauge_level = ? WHERE account_id = ? AND LOWER(name) = LOWER(?)',
      );
      let updated = 0;
      let notFound = 0;
      for (let i = 1; i < lines.length; i++) {
        const cells = lines[i]!.split(',').map((c) => c.trim());
        const name = (cells[nameCol] ?? '').trim();
        if (!name) continue;
        const level = parseGauge(cells[gaugeCol] ?? '0');
        const r = update.run(level, accountId, name);
        if (r.changes > 0) updated++;
        else notFound++;
      }
      outputSuccess(`Artifacts updated: ${updated}`);
      if (notFound) outputWarn(`Not found in account: ${notFound}`);
    }
  } else {
    output('No Artifacts.csv found. Skipping.');
  }

  db.close();
  output('');
  outputSuccess('Account data import complete.');
}

run();
