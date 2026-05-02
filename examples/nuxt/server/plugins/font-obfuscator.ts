import { preEncodeShuffled } from "font-obfuscator";
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
    });

    // Inject pre-encoded counter values (shuffled order) so COUNT stays obfuscated client-side.
    const { encoded: preArr, indices: preIdx } = preEncodeShuffled(
      Array.from({ length: 100 }, (_, i) => String(i)),
      pm.mapping,
      { variants: pm.variants },
    );
    const preScript = `<script>var _pre=${JSON.stringify(preArr)},_preIdx=${JSON.stringify(preIdx)},c=0,el=document.getElementById('cnt')<\/script>`;
    response.body = response.body.replace('</body>', `${preScript}</body>`);

    const h = response.headers as any;
    if (h) {
      if (typeof h.set === 'function') {
        h.set('cache-control', 'no-store');
        if (typeof h.delete === 'function') {
          h.delete('content-length');
          h.delete('Content-Length');
        }
      } else {
        delete h['content-length'];
        delete h['Content-Length'];
        h['cache-control'] = 'no-store';
      }
    }
  });
});
