import { preEncodeShuffled } from '../../../../lib/index.ts';
import { obfuscator } from '../utils/obfuscator.ts';

const SELECTORS = ['.secret'];

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('render:response', async (response, { event }) => {
    if (typeof response.body !== 'string') return;
    const contentType = response.headers?.['content-type'] || response.headers?.['Content-Type'] || '';
    if (!String(contentType).toLowerCase().includes('text/html')) return;

  const pm = await obfuscator.getRotatingMapping(response.body);
    const ip = (event.headers.get?.('x-forwarded-for') ?? '').split(',')[0].trim();
    const ua = event.headers.get?.('user-agent') ?? '';

    response.body = await obfuscator.serveWithMapping(response.body, SELECTORS, pm, {
      pageKey: event.path,
      clientFingerprint: `${ip}|${ua}`,
      sendClientMapping: false,
    });

    // Inject pre-encoded counter values (shuffled order) so COUNT stays obfuscated client-side.
    const { encoded: preArr, indices: preIdx } = preEncodeShuffled(
      Array.from({ length: 100 }, (_, i) => String(i)),
      pm.mapping,
    );
    const preScript = `<script>var _pre=${JSON.stringify(preArr)},_preIdx=${JSON.stringify(preIdx)},c=0,el=document.getElementById('cnt')<\/script>`;
    response.body = response.body.replace('</body>', `${preScript}</body>`);

    if (response.headers) {
      delete response.headers['content-length'];
      delete response.headers['Content-Length'];
    }
  });
});
