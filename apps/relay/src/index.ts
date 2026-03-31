import relayPackage from '../package.json' with { type: 'json' };

import { buildRelayApp } from './app.js';
import { loadRelayConfig } from './config.js';
import { createDatabaseClient, initializeDatabase } from './db.js';

async function main() {
  const config = loadRelayConfig(process.env);
  const sql = createDatabaseClient(config);
  await initializeDatabase(sql);

  const app = await buildRelayApp({
    config,
    sql,
    relayVersion: relayPackage.version,
  });

  try {
    await app.listen({
      host: config.HOST,
      port: config.PORT,
    });
  } catch (error) {
    app.log.error(error);
    await sql.end();
    process.exit(1);
  }
}

void main();
