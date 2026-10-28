import apiHandler from '../../api/news.mjs';
import { netlifyHandler } from '../lib/adapter.mjs';
export const handler = netlifyHandler(apiHandler);
