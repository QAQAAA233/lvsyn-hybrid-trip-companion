import {createHash} from 'node:crypto';

export const SDK_BROWSER_SHA256 = '760274f365ce86e6d46e20cb42ffb56645778bd83e1238e8974353c8c8be1e8b';
export const TRANSPORT_ID = 'virtual:req211-ai-egress';
const call = 'response = await fetch(url.toString(), fetchOptions);';

export function sealFirebaseAiBrowser(code) {
  if (createHash('sha256').update(code).digest('hex') !== SDK_BROWSER_SHA256 ||
      code.split(call).length !== 2) throw new Error('REQ211_AI_SDK_BYTES_OR_TRANSPORT_CHANGED');
  return "import {req211GuardedModelFetch} from '" + TRANSPORT_ID + "';\n" +
    code.replace(call, 'response = await req211GuardedModelFetch(url.toString(), fetchOptions);');
}
