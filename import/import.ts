/**
 * Epic7 Collection Tracker – Import
 *
 * Creates DB schema, imports base heroes from heroes.csv and base artifacts from artifacts.csv.
 * Creates a default admin user if none exist.
 *
 * CSV format:
 * - heroes.csv: Name;Class;Element;Stars (header row, then data)
 * - artifacts.csv: Name;Class;Stars (header row, then data)
 *
 * Usage: npx tsx import/import.ts
 *    or: npm run import
 */

import { config as loadEnv } from '@dotenvx/dotenvx';
import bcrypt from 'bcrypt';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

import {
  CSV_IMPORT_DIR,
  CSV_DELIMITER,
  SQLITE_DB_PATH,
  HERO_CLASSES,
  ARTIFACT_CLASSES,
  ELEMENTS,
  IMPORT_DEFAULT_ADMIN_USERNAME,
  IMPORT_DEFAULT_ADMIN_PASSWORD,
} from '../src/config.js';
import * as q from '../src/db/queries.js';
import { createSchema } from '../src/db/schema.js';

loadEnv();

function output(msg: string): void {
  console.log(msg);
}

function outputError(msg: string): void {
  console.error('ERROR:', msg);
}

function outputSuccess(msg: string): void {
  console.log('✓', msg);
}

function parseLine(line: string): string[] {
  return line.split(CSV_DELIMITER).map((c) => c.replace(/^\uFEFF/, '').trim());
}

function run(): void {
  output('Starting import...');
  output('');

  const dbDir = path.dirname(SQLITE_DB_PATH);
  if (!fs.existsSync(dbDir)) {
    output('Creating database directory...');
    fs.mkdirSync(dbDir, { recursive: true });
  }

  if (!fs.existsSync(CSV_IMPORT_DIR)) {
    output('Creating import directory...');
    fs.mkdirSync(CSV_IMPORT_DIR, { recursive: true });
  }

  output(`Database: ${SQLITE_DB_PATH}`);
  output('');

  let db: Database.Database;
  try {
    db = new Database(SQLITE_DB_PATH);
  } catch (e) {
    outputError(
      `Database connection failed: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
    throw new Error('Database connection failed');
  }

  output('Creating schema...');
  createSchema(db);
  outputSuccess('Schema created.');
  output('');

  if (!q.userExists(db, IMPORT_DEFAULT_ADMIN_USERNAME)) {
    const hash = bcrypt.hashSync(IMPORT_DEFAULT_ADMIN_PASSWORD, 10);
    q.createUser(db, IMPORT_DEFAULT_ADMIN_USERNAME, hash, true);
    outputSuccess('Default admin user created.');
  } else {
    outputSuccess('Default admin user already exists.');
  }
  output('');

  const heroesPath = path.join(CSV_IMPORT_DIR, 'heroes.csv');
  if (fs.existsSync(heroesPath)) {
    output('Importing heroes from heroes.csv...');
    const content = fs.readFileSync(heroesPath, 'utf-8');
    const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
    const ins = db.prepare(
      'INSERT INTO base_heroes (name, class, element, star_rating, display_order) VALUES (?, ?, ?, ?, ?)',
    );
    let order = 0;
    let count = 0;
    for (let i = 1; i < lines.length; i++) {
      const cells = parseLine(lines[i]!);
      const name = (cells[0] ?? '').trim();
      if (!name) continue;
      const cls = (cells[1] ?? '').toLowerCase().trim();
      const element = (cells[2] ?? '').toLowerCase().trim();
      const stars = Math.max(
        3,
        Math.min(5, parseInt(cells[3] ?? '5', 10) || 5),
      );
      if (!HERO_CLASSES.includes(cls as (typeof HERO_CLASSES)[number])) {
        continue;
      }
      if (!ELEMENTS.includes(element as (typeof ELEMENTS)[number])) continue;
      ins.run(name, cls, element, stars, order++);
      count++;
    }
    outputSuccess(`Imported ${count} heroes.`);
  } else {
    output('No heroes.csv found. Skipping.');
  }
  output('');

  const artifactsPath = path.join(CSV_IMPORT_DIR, 'artifacts.csv');
  if (fs.existsSync(artifactsPath)) {
    output('Importing artifacts from artifacts.csv...');
    const content = fs.readFileSync(artifactsPath, 'utf-8');
    const lines = content.split(/\r?\n/).filter((l) => l.length > 0);
    const ins = db.prepare(
      'INSERT INTO base_artifacts (name, class, star_rating, display_order) VALUES (?, ?, ?, ?)',
    );
    let order = 0;
    let count = 0;
    for (let i = 1; i < lines.length; i++) {
      const cells = parseLine(lines[i]!);
      const name = (cells[0] ?? '').trim();
      if (!name) continue;
      const cls = (cells[1] ?? '').toLowerCase().trim();
      const stars = Math.max(
        3,
        Math.min(5, parseInt(cells[2] ?? '5', 10) || 5),
      );
      if (
        !ARTIFACT_CLASSES.includes(cls as (typeof ARTIFACT_CLASSES)[number])
      ) {
        continue;
      }
      ins.run(name, cls, stars, order++);
      count++;
    }
    outputSuccess(`Imported ${count} artifacts.`);
  } else {
    output('No artifacts.csv found. Skipping.');
  }

  db.close();
  output('');
  outputSuccess('Import complete.');
  output('');
  output('Default admin user created.');
  output('  Username: (see IMPORT_DEFAULT_ADMIN_USERNAME in .env)');
  output('  Password: (check .env file)');
  output('');
  output('Change the password after first login!');
  output('');
  output('Run the app: npm run dev or npm start');
}

try {
  run();
} catch (error) {
  console.error(
    'Import failed:',
    error instanceof Error ? error.message : error,
  );
  process.exit(1);
}
