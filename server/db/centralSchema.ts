import { createCentralSchema } from '@corpus/core';

import { getCentralDb } from './connection.js';

export function ensureCentralSchema(): void {
  createCentralSchema(getCentralDb());
}
