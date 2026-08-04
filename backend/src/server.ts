import { createApp } from './app';
import { env } from './config/env';
import { logger } from './middleware/requestLogger';

const app = createApp();

app.listen(env.PORT, () => {
  logger.info(`PPC backend listening on port ${env.PORT} (${env.NODE_ENV})`);
});
