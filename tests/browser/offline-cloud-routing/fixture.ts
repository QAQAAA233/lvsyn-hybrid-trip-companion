import {InferenceMode} from 'firebase/ai';
import {createCompetitionRuntime} from '../../../src/firebase/init';
import {runCompetitionPrompt} from '../../../src/ai/hybridInferenceService';
import {CLOUD_ATTEMPT_KEY} from '../../../src/firebase/cloudAttemptBudget';
import {calls,release,setHold} from './sdk-fixture';
import {fixtureBoundary} from './egress-fixture';

const button=document.querySelector<HTMLButtonElement>('button')!;
const message=document.querySelector<HTMLElement>('[role=status]')!;
const projectId='local-fixture-demo',appId='1:123456:web:001122334455';
const placeholders=['sample-not-api-credential','sample-not-site-credential'];
const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify([projectId,appId,...placeholders])));
const fingerprint=Array.from(new Uint8Array(hash), b=>b.toString(16).padStart(2,'0')).join('');
const handle=await createCompetitionRuntime({
 VITE_FIREBASE_PROJECT_ID:projectId,VITE_REQ211_APPROVED_PROJECT_ID:projectId,
 VITE_FIREBASE_APP_ID:appId,VITE_REQ211_APPROVED_WEB_APP_ID:appId,
 VITE_FIREBASE_API_KEY:placeholders[0],VITE_REQ211_RECAPTCHA_ENTERPRISE_SITE_KEY:placeholders[1],
 VITE_REQ211_OWNER_RECEIPT_SHA256:'0'.repeat(64),VITE_REQ211_APPROVED_BINDING_SHA256:fingerprint,
});
if(!handle.setup.isLiveProject)throw new Error('Synthetic route uninitialized');
let unlock:(()=>void)|undefined;
const results:{status:string,source?:string,code?:string}[]=[];
Object.assign(window,{fixture:{setHold,release,
 startLock:()=>new Promise<void>(started=>{
  void navigator.locks.request('hybrid-trip.cloud-attempts.v1.exclusive',()=>new Promise<void>(resolve=>{unlock=resolve;started();}));
 }),
 releaseLock:()=>unlock?.(),
 pendingLock:async()=> (await navigator.locks.query()).pending?.some(l=>l.name==='hybrid-trip.cloud-attempts.v1.exclusive')??false,
 read:()=>({results,calls:{...calls,transportBoundary:fixtureBoundary.calls},
  spend:JSON.parse(localStorage.getItem(CLOUD_ATTEMPT_KEY)??'null')?.attempts??0,navigatorOnline:navigator.onLine}),
}});
button.disabled=false;
button.addEventListener('click',async()=>{
 button.disabled=true;
 message.textContent='Pending synthetic request';
 try{
  const out=await runCompetitionPrompt(handle,{taskKind:'concierge',
   requestedMode:InferenceMode.ONLY_IN_CLOUD,prompt:'reviewer negative-path fixture'},()=>undefined);
  results.push({status:'terminal',source:out.telemetry.actualSource});
  message.textContent='Synthetic terminal response; never a real cloud call';
 }catch(err){
  const code=err instanceof Error?err.message:String(err);
  results.push({status:'blocked',code});
  message.textContent=code;
 }finally{button.disabled=false;}
});
