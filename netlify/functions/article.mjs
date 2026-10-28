import apiHandler from '../../api/article.mjs';
import { netlifyHandler } from '../lib/adapter.mjs';
export const handler = netlifyHandler(apiHandler);
