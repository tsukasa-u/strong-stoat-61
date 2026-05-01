import { getRequestURL, setResponseHeader } from 'h3';
import { obfuscator } from '../utils/obfuscator.ts';

export default defineEventHandler(async (event) => {
  const request = new Request(getRequestURL(event).toString(), {
    method: event.method,
    headers: event.headers,
  });

  const fontRes = await obfuscator.maybeHandleFontRequest(request);
  if (!fontRes) return;

  event.node.res.statusCode = fontRes.status;
  fontRes.headers.forEach((value, key) => setResponseHeader(event, key, value));
  return fontRes;
});
