import { fileURLToPath } from 'node:url';
import { dnd5e2014, dnd5e2024 } from '@ttrpg/systems-dnd5e';
import { config } from 'dotenv';
import { createDatabase } from './client.js';
import { ensureSystemAccount, seedSystemModule } from './seed.js';

config({ path: fileURLToPath(new URL('../../../.env', import.meta.url)) });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. Copy .env.example to .env at the repo root.');
}

const db = createDatabase(connectionString);
const ownerId = await ensureSystemAccount(db);

for (const module of [dnd5e2014, dnd5e2024]) {
  const result = await seedSystemModule(db, module, ownerId);
  console.log(`seeded ${result.slug}: ${result.entities} entities`);
}

process.exit(0);
