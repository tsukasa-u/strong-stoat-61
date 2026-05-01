import { getRequestURL, setResponseHeader } from 'h3';
import { FontObfuscator } from 'font-obfuscator';

const obfuscator = new FontObfuscator({
  fontUrl:
    'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansjp/NotoSansJP%5Bwght%5D.ttf',
  fontRoutePrefix: '/_obf/font'
});

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
