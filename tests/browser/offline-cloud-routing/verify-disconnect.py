#!/usr/bin/env python3
"""Real Chromium connectivity; SDK boundaries mocked, external HTTP blocked."""
import argparse,json,sys
from pathlib import Path
from datetime import datetime,timedelta,timezone
from playwright.sync_api import sync_playwright,expect

p=argparse.ArgumentParser(description=__doc__)
p.add_argument('fixture_url');p.add_argument('out',type=Path);p.add_argument('--browser',required=True)
p.add_argument('--public-copy-local-url')
a=p.parse_args();a.out.mkdir(exist_ok=True,parents=True)
receipt={'taipei':datetime.now(timezone(timedelta(hours=8))).isoformat(),'provider':'local synthetic boundary only','cases':[]}

def base(c,url):
 c.route('**/*',lambda r:r.continue_() if r.request.url.startswith(url.split('/tests/')[0]+('/') if '/tests/' in url else url) else deny(r))
 return c.new_page()

def deny(route):
 unexpected.append(route.request.url.split('?',1)[0])
 route.abort()
def state(page):return page.evaluate('window.fixture.read()')
def change(c,page,offline):
 c.set_offline(offline)
 page.wait_for_function('wanted => navigator.onLine === wanted',arg=not offline)
def wait_results(page,n):
 page.wait_for_function('n=>window.fixture.read().results.length===n',arg=n)
def yes(s,code='REQ211_CLOUD_INTERRUPTED'):
 return s['results'][-1]=={'status':'blocked','code':code}

with sync_playwright() as pw:
 b=pw.chromium.launch(executable_path=a.browser,args=['--disable-background-networking','--no-first-run','--proxy-server=http://127.0.0.1:9','--proxy-bypass-list=127.0.0.1'])
 receipt['browser']=b.version
 for viewport in (390,1280):
  for case in ('offline-start','queued-lock','appcheck-pending','sdk-pending','online-control'):
   c=b.new_context(viewport={'width':viewport,'height':844 if viewport==390 else 800},
    is_mobile=viewport==390,has_touch=viewport==390,service_workers='block')
   unexpected=[];page=base(c,a.fixture_url);page.set_default_timeout(7000)
   faults=[];page.on('pageerror',lambda v:faults.append(str(v)))
   page.goto(a.fixture_url)
   button=page.get_by_role('button',name='Run synthetic cloud request')
   expect(button).to_be_enabled()
   click=button.tap if viewport==390 else button.click
   if case=='offline-start':
    change(c,page,True);click()
   elif case=='queued-lock':
    page.evaluate('window.fixture.startLock()');click()
    page.wait_for_function('window.fixture.pendingLock()')
    change(c,page,True);change(c,page,False)
    page.evaluate('window.fixture.releaseLock()')
   elif case=='appcheck-pending':
    page.evaluate("window.fixture.setHold('token')");click()
    page.wait_for_function('window.fixture.read().calls.appCheckToken===1')
    change(c,page,True);change(c,page,False)
    page.evaluate("window.fixture.release('token')")
   elif case=='sdk-pending':
    page.evaluate("window.fixture.setHold('model')");click()
    page.wait_for_function('window.fixture.read().calls.sdkModelStarts===1')
    change(c,page,True);change(c,page,False)
    page.evaluate("window.fixture.release('model')")
   else:click()
   wait_results(page,1);s=state(page);q=s['calls'];checks={}
   checks['correct_outcome']=yes(s,'REQ211_CLOUD_OFFLINE_STOP' if case=='offline-start' else 'REQ211_CLOUD_INTERRUPTED') if case!='online-control' else s['results']==[{'status':'terminal','source':'in_cloud'}]
   expected={'offline-start':(0,0,0,0),'queued-lock':(0,0,0,0),'appcheck-pending':(1,1,0,0),
      'sdk-pending':(1,1,1,1),'online-control':(1,1,1,0)}[case]
   checks['phase_bounds_on_spend_provider_transport_abort']=(s['spend'],q['appCheckToken'],q['sdkModelStarts'],q['sdkAbortSignals'])==expected
   first=page.get_by_role('status').inner_text()
   if case in ('queued-lock','appcheck-pending','sdk-pending'):
    page.screenshot(path=str(a.out/f'{viewport}-{case}.png'))
    page.wait_for_timeout(220)
    still=state(page)
    checks['reconnect_did_not_create_separate_attempt']=still==s
    page.evaluate("window.fixture.setHold('')")
    click()
    wait_results(page,2);fresh=state(page)
    checks['fresh_explicit_click_only']=fresh['results'][-1]=={'status':'terminal','source':'in_cloud'} and fresh['spend']==s['spend']+1 and fresh['calls']['sdkModelStarts']==q['sdkModelStarts']+1
   checks['isolated_no_external_or_page_errors']=not unexpected and not faults
   receipt['cases'].append({'viewport':viewport,'scenario':case,'checks':checks,'phase':s,'status':first,'external':unexpected,'pageErrors':faults})
   print(viewport,case,first,s['spend'],q,checks,flush=True);c.close()
 if a.public_copy_local_url:
  for viewport in (390,1280):
   c=b.new_context(viewport={'width':viewport,'height':844 if viewport==390 else 800},is_mobile=viewport==390,has_touch=viewport==390)
   unexpected=[];page=base(c,a.public_copy_local_url);page.set_default_timeout(10000)
   page.add_init_script("Object.defineProperty(window,'LanguageModel',{value:{availability:async()=> 'unavailable'}})")
   page.goto(a.public_copy_local_url);page.get_by_role('heading',level=1).wait_for()
   page.wait_for_function('Boolean(navigator.serviceWorker?.controller)')
   setup=page.get_by_test_id('firebase-setup-btn')
   gesture=(lambda e:e.tap()) if viewport==390 else (lambda e:e.click())
   gesture(setup);setup_text=page.get_by_role('dialog').inner_text()
   gesture(page.get_by_role('dialog').get_by_role('button'))
   change(c,page,True)
   sh=page.get_by_role('button',name='Shorten Kinkaku-ji Golden Pavilion by 15 min')
   gesture(sh)
   saved=page.get_by_test_id('itinerary-local-save');expect(saved).to_contain_text('Saved on this browser')
   end=page.get_by_test_id('timeline-stops').locator('[data-testid^=stop-card-]').first.inner_text()
   offline=page.reload(wait_until='domcontentloaded');page.get_by_role('heading',level=1).wait_for()
   offline_equivalent=page.get_by_test_id('timeline-stops').locator('[data-testid^=stop-card-]').first.inner_text()==end
   disabled=lambda:page.get_by_test_id('inference-mode-select').evaluate("e=>Array.from(e.options).slice(2).every(o=>o.disabled)")
   history=page.get_by_test_id('telemetry-inspector')
   empty=lambda:history.locator('table').count()==0
   cloud_disabled_offline=disabled() and empty()
   header_offline= 'Offline' in page.locator('header').inner_text()
   history.scroll_into_view_if_needed()
   page.screenshot(path=str(a.out/f'{viewport}-public-offline-reload.png'))
   change(c,page,False)
   page.reload(wait_until='domcontentloaded');page.get_by_role('heading',level=1).wait_for()
   expect(page.locator('header')).to_contain_text('Online')
   checks={'cloud_mode_locked_without_authorization':cloud_disabled_offline and disabled(),
    'cached_offline_reload_keeps_local_edits':offline.ok and offline_equivalent and page.get_by_test_id('timeline-stops').locator('[data-testid^=stop-card-]').first.inner_text()==end,
    'no_phantom_history_after_disconnect_reconnect_reload':empty(),
    'real_offline_online_status':header_offline,'no_unexpected_external_request':not unexpected}
   receipt['cases'].append({'viewport':viewport,'scenario':'locked-competition-copy-offline-reload','checks':checks,'isolatedCompetitionBuild':True,'setupText':setup_text,'external':unexpected})
   print(viewport,'public offline/reload',checks,flush=True);c.close()
 b.close()
receipt['passed']=sum(sum(c['checks'].values()) for c in receipt['cases'])
receipt['total']=sum(len(c['checks']) for c in receipt['cases'])
(a.out/'RUNTIME-DISCONNECT.actual.json').write_text(json.dumps(receipt,indent=2)+'\n',encoding='utf-8')
print(f"PASS {receipt['passed']}/{receipt['total']}",flush=True)
sys.exit(0 if receipt['total'] and receipt['passed']==receipt['total'] else 1)
