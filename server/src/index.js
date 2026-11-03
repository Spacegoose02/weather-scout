import { buildApp } from './app.js';
import { loadConfig } from './config.js';

const cfg = loadConfig();
const app = await buildApp({ config: cfg });
if (app.push) app.push.start(app.pushAlerts, cfg.push.pollSeconds * 1000, app.pushBriefing, app.lightning);
app.lightning.start();
app.stations.start();
app.homeAssistant.start();
try {
  await app.listen({ port: cfg.port, host: cfg.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => app.close().then(() => process.exit(0)));
