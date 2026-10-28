import apiHandler from '../../api/image.mjs';
import { netlifyHandler } from '../lib/adapter.mjs';
export const handler = netlifyHandler(apiHandler);
