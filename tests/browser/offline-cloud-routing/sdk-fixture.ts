type App={name:string,options:Record<string,unknown>};
const apps:App[]=[];
export const calls={appCheckInit:0,appCheckToken:0,sdkModelStarts:0,sdkAbortSignals:0};
const gates=new Map<string,()=>void>();
let hold='';
export function setHold(name:string){hold=name;}
export function release(name:string){gates.get(name)?.();gates.delete(name);}
async function stopAt(name:string){
 if(hold===name)await new Promise<void>(resolve=>gates.set(name,resolve));
}
export function getApps(){return [...apps];}
export function initializeApp(options:Record<string,unknown>,name:string){
 const app={name,options};apps.push(app);return app;
}
export const setLogLevel=()=>undefined;
export class GoogleAIBackend {}
export class ReCaptchaEnterpriseProvider {constructor(_siteKey:string){}}
export const InferenceMode={PREFER_ON_DEVICE:'PREFER_ON_DEVICE',ONLY_ON_DEVICE:'ONLY_ON_DEVICE',
  PREFER_IN_CLOUD:'PREFER_IN_CLOUD',ONLY_IN_CLOUD:'ONLY_IN_CLOUD'} as const;
export const InferenceSource={ON_DEVICE:'on_device',IN_CLOUD:'in_cloud'} as const;
export function getAI(app:App){return {app};}
export function initializeAppCheck(app:App){calls.appCheckInit++;return {app};}
export async function getToken(_app:{app:App}){
 calls.appCheckToken++;
 await stopAt('token');
 return {token:'local-fixture-placeholder'};
}
export function getGenerativeModel(_ai:unknown,_config:unknown,_opts:unknown){
 return {async generateContentStream(_parts:unknown, callOptions?:{signal?:AbortSignal}){
  calls.sdkModelStarts++;
  const signal=callOptions?.signal;
  signal?.addEventListener('abort',()=>{calls.sdkAbortSignals++;},{once:true});
  const response=(async()=>{
   await stopAt('model');
   signal?.throwIfAborted();
   return {inferenceSource:InferenceSource.IN_CLOUD,text:()=> 'Synthetic terminal trace, not a cloud result'};
  })();
  return {response, stream:(async function*(){ const done=await response;yield done; })()};
 }};
}
