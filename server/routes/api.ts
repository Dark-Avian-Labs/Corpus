import { Router } from 'express';

import { epic7ApiRouter } from './epic7Api.js';
import { warframeApiRouter } from './warframeApi.js';

export const apiRouter = Router();

apiRouter.get('/status', (_req, res) => {
  res.json({ ok: true, app: 'corpus' });
});

apiRouter.use('/warframe', warframeApiRouter);
apiRouter.use('/epic7', epic7ApiRouter);
