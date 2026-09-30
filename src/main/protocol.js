import { net, protocol } from 'electron';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isInlineImage } from '../shared/fileTypes.js';

const SCHEME = 'md-asset';

// Must run before the app's `ready` event.
export function registerAssetScheme() {
  protocol.registerSchemesAsPrivileged([
    { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
}

// `pathToFileURL` percent-encodes spaces, `#`, `?`, `%` and non-ASCII characters,
// so any file name survives the round trip through the URL.
export function toAssetUrl(filePath, version) {
  const url = `${SCHEME}://local${pathToFileURL(filePath).pathname}`;
  return version ? `${url}?v=${Math.round(version)}` : url;
}

export function handleAssetProtocol() {
  protocol.handle(SCHEME, async (request) => {
    let filePath;
    try {
      filePath = fileURLToPath(`file://${new URL(request.url).pathname}`);
    } catch {
      return new Response('Bad request', { status: 400 });
    }
    if (!isInlineImage(filePath)) return new Response('Forbidden', { status: 403 });
    try {
      return await net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}
