import apiHandler from '../../api/health.mjs';
import { netlifyHandler } from '../lib/adapter.mjs';
export const handler = netlifyHandler(apiHandler);
