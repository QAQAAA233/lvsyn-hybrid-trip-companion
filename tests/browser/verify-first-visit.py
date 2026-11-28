#!/usr/bin/env python3
"""Anonymous first-visit matrix; isolated browser, synthetic capability only."""
from pathlib import Path
from datetime import datetime,timezone,timedelta
import argparse,base64,json,os,re,socket,subprocess,sys,tempfile,time
from playwright.sync_api import expect,sync_playwright

P=argparse.ArgumentParser(description=__doc__)
P.add_argument('dist',type=Path); P.add_argument('out',type=Path); P.add_argument('--native-browser',action='store_true')
P.add_argument('--desktop-only',action='store_true'); P.add_argument('--browser',required=True)
a=P.parse_args(); a.out.mkdir(exist_ok=True,parents=True)
sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
origin=f'http://127.0.0.1:{port}'
server=subprocess.Popen([sys.executable,'-m','http.server',str(port),'--bind','127.0.0.1','--directory',str(a.dist.resolve())],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
receipt={'startedAtTaipei':datetime.now(timezone(timedelta(hours=8))).isoformat(),'cases':[],'syntheticModelRequests':0}
flags=['--disable-background-networking','--no-first-run','--lang=en-US','--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1']
FIXTURE="""({delay,mode})=>{
  window.__fixtureCreates=0;
  Object.defineProperty(window,'LanguageModel',{configurable:true,value:{
    async availability(opts){await new Promise(r=>setTimeout(r,delay));return opts?.expectedInputs?.some(x=>x.type==='image')?'unavailable':mode;},
    create(){window.__fixtureCreates++;throw Error('isolated fixture: no completed model result');}
  }});
}"""
def outset(page,testid,bt,details):
 el=page.get_by_test_id(testid)
 for _ in range(25):
  if el.evaluate('e=>e===document.activeElement'):
   q=el.evaluate("""e=>{const r=e.getBoundingClientRect();const c=getComputedStyle(e);return {focus:true,
      outline:c.outlineStyle,offset:parseFloat(c.outlineOffset),outlineWidth:parseFloat(c.outlineWidth),
      x:r.x,y:r.y,right:r.right,bottom:r.bottom,iw:innerWidth,ih:innerHeight}}""")
   details[testid]=q
   return q['outline'] not in ('none','hidden') and q['outlineWidth']>=1 and q['x']>=0 and q['right']<=q['iw']
  page.keyboard.press('Tab')
 details[testid]={'focus':False}
 return False

def test_current(page,ctx,name,width,height,touch,zoom=None):
 checks={}; measurements={}; external=[]; logs=[]; page_errors=[]
 case={'name':name,'checks':checks,'measurements':measurements,'external':external,'console':logs,'pageErrors':page_errors}
 receipt['cases'].append(case)
 def route(r):
  if r.request.url.startswith(origin+'/') and r.request.method in ('GET','HEAD'):
   r.continue_()
  else:
   external.append({'path':r.request.url.split('?')[0].split('/')[2] if '://' in r.request.url else 'other','method':r.request.method})
   r.abort()
 ctx.route('**/*',route)
 page.on('pageerror',lambda e:page_errors.append(str(e)[:200]))
 page.on('console',lambda m:logs.append({'type':m.type,'text':m.text[:210]}) if m.type in ('warning','error') else None)
 page.add_init_script('('+FIXTURE+')('+json.dumps({'delay':850,'mode':'unavailable'})+')')
 page.set_default_timeout(5500)
 def shot(step):
  if zoom is not None:
   session=ctx.new_cdp_session(page)
   try:
    raw=session.send('Page.captureScreenshot',{'format':'png','fromSurface':True,'captureBeyondViewport':False})
    png=base64.b64decode(raw['data'])
    (a.out/f'{name}-{step}.png').write_bytes(png)
   finally:session.detach()
  else: png=page.screenshot(path=str(a.out/f'{name}-{step}.png'))
  return len(png)
 def geometry():
  return page.evaluate("""()=>({width:innerWidth,height:innerHeight,document:document.documentElement.scrollWidth,
    dpr:devicePixelRatio,pinch:visualViewport.scale,reduce:matchMedia('(prefers-reduced-motion: reduce)').matches,
    animated:getComputedStyle(document.querySelector('[data-testid=firebase-setup-btn]')).transitionDuration,
    active:document.activeElement?.getAttribute('aria-label')||document.activeElement?.getAttribute('data-testid')||document.activeElement?.tagName})""")
 try:
  then=time.monotonic()
  response=page.goto(origin+'/',wait_until='domcontentloaded')
  heading=page.locator('h1')
  heading.wait_for(state='visible')
  early=geometry()
  header=page.locator('header')
  heading_time=round((time.monotonic()-then)*1000)
  checks['view_loaded_promptly']=response.ok and heading_time<5000
  checks['initial_check_not_unavailability']=bool(re.search('Checking device support',header.inner_text(),re.I))
  checks['initial_no_results']=page.get_by_test_id('proposal-source-badge').count()==0
  shot('initial')
  remaining=5-(time.monotonic()-then)
  if remaining>0:page.wait_for_timeout(remaining*1000)
  final_geom=geometry()
  header_text=header.inner_text()
  checks['status_clearly_separates_device_cloud_offline_editing']=all(x in header_text for x in ('unavailable in this browser','Cloud is locked in this demo','Itinerary editing works offline'))
  controls=['verify-on-device-btn','run-concierge-btn','init-nano-btn','studio-init-nano-btn']
  checks['unavailable_actions_disabled']=all(page.get_by_test_id(x).is_disabled() for x in controls)
  checks['no_false_cloud_fallback_claim']='Every run executes' not in page.get_by_test_id('on-device-proof-panel').evaluate('e=>e.parentElement.innerText')
  checks['cloud_modes_not_exposed_as_available']=page.get_by_test_id('inference-mode-select').evaluate("e=>Array.from(e.options).slice(2).every(o=>o.disabled)")
  checks['top_no_horizontal_clipping']=final_geom['document']<=final_geom['width']+1
  selects={}
  for label in ('Select preset trip','Inference mode','Trip day of week'):
   opt=page.get_by_role('combobox',name=label)
   v=opt.evaluate('''e=>{const r=e.getBoundingClientRect(), c=getComputedStyle(e);
     const ctx=document.createElement('canvas').getContext('2d');
     ctx.font=c.fontWeight+' '+c.fontSize+' '+c.fontFamily;
     const fontSize=parseFloat(c.fontSize), line=parseFloat(c.lineHeight)||fontSize;
     const text=e.selectedOptions[0].textContent.trim();
     const available=r.width-parseFloat(c.paddingInlineStart)-parseFloat(c.paddingInlineEnd);
     return {boxWidth:r.width,boxHeight:r.height,fontSize,line,appearance:c.appearance,text,
       textWidth:ctx.measureText(text).width,available};}''')
   selects[label]=v
   checks['legible_selected_option_'+label]=v['appearance']=='none' and v['boxHeight']>=v['fontSize']*1.4 and v['line']>=v['fontSize'] and v['available']>=v['textWidth']-0.75
  measurements['currentSelectValues']=selects
  checks['reduce_honored']=final_geom['reduce'] and set(final_geom['animated'].replace(' ','').split(','))<= {'0s'}
  if zoom is not None:
   checks['genuine_page_zoom_not_pinch']=abs(final_geom['dpr']-zoom)<0.07 and abs(final_geom['pinch']-1)<.05 and abs(final_geom['width']*zoom-width)<16
  measurements.update({'firstContentMs':heading_time,'early':early,'atFiveSeconds':final_geom,'header':header_text})
  shot('first-five-seconds')
  if touch:
   page.get_by_test_id('firebase-setup-btn').tap()
  else:
   foc={}
   for elem in ('trip-selector','inference-mode-select','firebase-setup-btn'):
    checks[f'{elem}_keyboard_focus_visible']=outset(page,elem,None,foc)
   measurements['fieldFocus']=foc
   page.keyboard.press('Enter')
  dlg=page.get_by_role('dialog')
  dlg.wait_for(state='visible')
  dlg_geom=dlg.evaluate("""e=>{const r=e.getBoundingClientRect(); return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,iw:innerWidth,ih:innerHeight,overflowY:getComputedStyle(e).overflowY,bottomReadable:e.scrollHeight<=e.clientHeight||['auto','scroll'].includes(getComputedStyle(e).overflowY)}}""")
  measurements['dialog']=dlg_geom
  checks['dialog_and_content_reflow']=dlg_geom['bottomReadable'] and dlg_geom['top']>=0 and dlg_geom['bottom']<=dlg_geom['ih'] and dlg_geom['left']>=0 and dlg_geom['right']<=dlg_geom['iw']
  shot('setup')
  if touch:
   dlg.get_by_role('button').tap()
   checks['setup_closes_by_touch']=not dlg.is_visible()
  else:
   extra=dlg.evaluate('e=>e.scrollHeight>e.clientHeight+2')
   if extra:
    page.keyboard.press('End')
    page.wait_for_timeout(350)
    can_scroll=dlg.evaluate('e=>e.scrollTop>2')
    shot('setup-scrolled')
    page.keyboard.press('Home')
    page.wait_for_timeout(180)
   else: can_scroll=True
   if zoom is not None:
    checks['keyboard_reads_scrollable_dialog_end']=can_scroll
   page.keyboard.press('Tab')
   checks['keyboard_stays_in_modal']=geometry()['active']=='Close Firebase setup'
   page.keyboard.press('Escape')
   checks['escape_restores_trigger']=not dlg.is_visible() and geometry()['active']=='firebase-setup-btn'
   if dlg.is_visible():dlg.get_by_role('button').click()
  p=page.get_by_test_id('on-device-proof-panel')
  p.scroll_into_view_if_needed();shot('proof')
  # No inference button is pressed here. Real editing still works when both routes are unavailable.
  btn=page.get_by_role('button',name='Shorten Kinkaku-ji Golden Pavilion by 15 min'); (btn.tap if touch else btn.click)()
  checks['offline_local_edit_save']= 'Saved on this browser' in page.get_by_test_id('itinerary-local-save').inner_text()
  checks['no_model_attempt']=page.evaluate('()=>window.__fixtureCreates')==0
 except Exception as e: checks['flow_completed']=False;measurements['error']=str(e)[:550]
 checks['no_application_console_errors']=not any(x['type']=='error' for x in logs) and not page_errors
 checks['no_nonlocal_request']=not external
 print(name, sum(checks.values()),len(checks),'failed:',[k for k,v in checks.items() if not v],flush=True)
def set_zoom(settings,zoom):
 settings.goto('chrome://settings/appearance')
 all_selects=settings.locator('select')
 candidates=[el for el in all_selects.all() if el.evaluate("e=>Array.from(e.options).some(o=>o.label.trim() === '400%')")]
 assert len(candidates)==1,'Could not identify the native Page zoom setting'
 candidates[0].select_option(label=f'{zoom*100}%')
 val=candidates[0].evaluate('e=>e.selectedOptions[0].label')
 assert val.strip()==f'{zoom*100}%',val
 return val
try:
 with sync_playwright() as pw:
  b=pw.chromium.launch(executable_path=a.browser,args=flags)
  receipt['version']=b.version
  if not a.desktop_only:
   for w,h,t in ((390,844,True),(1280,800,False)) + (() if a.native_browser else ((640,400,False),(320,200,False))):
    c=b.new_context(viewport={'width':w,'height':h},has_touch=t,is_mobile=t,reduced_motion='reduce',service_workers='block')
    test_current(c.new_page(),c,('desktop' if w==1280 else 'touch' if t else 'reflow-only')+f'-{w}',w,h,t)
    c.close()
   # Positive eligibility only, not inference: synthetic text available / image unsupported.
   c=b.new_context(viewport={'width':390,'height':844},has_touch=True,reduced_motion='reduce',service_workers='block')
   hits=[];c.route('**/*',lambda r:r.continue_() if r.request.url.startswith(origin+'/') else (hits.append(1),r.abort()))
   p=c.new_page();p.add_init_script('('+FIXTURE+')('+json.dumps({'delay':130,'mode':'available'})+')')
   p.goto(origin+'/');expect(p.get_by_test_id('nano-text-availability')).to_have_text(re.compile(r'text: available'))
   m={}
   m['available_text_enables_verify_and_run']=not p.get_by_test_id('verify-on-device-btn').is_disabled() and not p.get_by_test_id('run-concierge-btn').is_disabled()
   p.get_by_test_id('tab-sign_vision').tap();p.get_by_test_id('sample-kyoto-sign').tap();p.get_by_role('img',name='Kyoto Teahouse Notice (PNG)').wait_for()
   m['unsupported_image_stays_disabled_even_with_sample']=p.get_by_test_id('run-vision-btn').is_disabled()
   m['no_model_or_cloud_dispatched']=p.evaluate('()=>window.__fixtureCreates')==0 and not hits
   p.get_by_test_id('on-device-proof-panel').scroll_into_view_if_needed()
   p.screenshot(path=str(a.out/'synthetic-text-only.png'))
   receipt['cases'].append({'name':'synthetic-text-only','checks':m})
   c.close()
  b.close()
  if a.native_browser:
   for z in (2,4):
    with tempfile.TemporaryDirectory() as profile:
     c=pw.chromium.launch_persistent_context(profile,executable_path=a.browser,headless=False,viewport={'width':1280,'height':800},
       reduced_motion='reduce',service_workers='block',args=flags+['--headless=new','--window-size=1280,800'])
     settings=c.pages[0]
     native=set_zoom(settings,z)
     test_current(c.new_page(),c,f'native-zoom-{z*100}',1280,800,False,z)
     receipt['cases'][-1]['nativeZoomSetting']=native
     c.close()
finally:
 server.terminate();server.wait(timeout=6)
 receipt['passed']=sum(sum(c['checks'].values()) for c in receipt['cases'])
 receipt['total']=sum(len(c['checks']) for c in receipt['cases'])
 (a.out/'FIRST-VISIT.actual.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
 print(f"PASS {receipt['passed']}/{receipt['total']}",flush=True)
sys.exit(0 if receipt['passed']==receipt['total'] and receipt['total'] else 1)
