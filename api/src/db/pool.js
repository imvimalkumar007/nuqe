import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

// Resolve .env from the project root regardless of cwd.
// In Docker, env vars are already injected by Compose — config() is a no-op.
const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '../../../.env'), override: false });

const { Pool } = pg;

export const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 20 });
