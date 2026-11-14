"""National-team centre: local mocks only, no real football requests."""
import sys
sys.dont_write_bytecode=True
import asyncio,unittest
from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse,parse_qs
from zoneinfo import ZoneInfo
import redesign_browser as harness

class InternationalBrowser(unittest.IsolatedAsyncioTestCase):
 asyncSetUp=harness.RedesignBrowser.asyncSetUp
 asyncTearDown=harness.RedesignBrowser.asyncTearDown
 nav=harness.RedesignBrowser.nav

 async def route(self,route):
  u=urlparse(route.request.url)
  if '/api/football' in u.path or (u.netloc=='www.thesportsdb.com' and 'eventsday.php' in u.path):
   self.calls.append(route.request.url)
   if getattr(self,'gate',None):await self.gate.wait()
   if getattr(self,'limited',False):return await route.fulfill(status=429,headers={'Retry-After':'180','Access-Control-Expose-Headers':'Retry-After'},json={'error':'MOCK quota'})
   if getattr(self,'malformed',False):return await route.fulfill(json={'response':{'bad':'MOCK'},'events':{'bad':'MOCK'}})
   query=parse_qs(u.query);day=query.get('date',query.get('d',['2026-11-14']))[0]
   if u.netloc=='www.thesportsdb.com':
    return await route.fulfill(json={'events':[] if getattr(self,'empty',False) else [{'idEvent':'mock-sports','idLeague':'900','strSport':'Soccer','strLeague':'International Friendlies','strHomeTeam':'Aruba','strAwayTeam':'Curaçao','dateEvent':day,'strTime':'12:00:00','strStatus':'Match Finished','intHomeScore':0,'intAwayScore':0}]})
   def match(ident,name,home,away,status='FT',time='12:00:00Z'):
    return {'fixture':{'id':ident,'date':day+'T'+time,'status':{'short':status},'venue':{'name':'MOCK <img src=x onerror=alert(1)>'}},'league':{'id':ident,'name':name},'teams':{'home':{'name':home},'away':{'name':away}},'goals':{'home':0,'away':2 if status=='FT' else None}}
   rows=[match(10,'Friendlies','Malaysia','China'),match(30,'World Cup - Qualification Asia','Japan','Indonesia','NS'),match(17,'Asian Cup','Aruba','Curaçao'),match(39,'Premier League','MOCK Club','MOCK Club 2'),match(999,'Friendlies Clubs','MOCK Club','MOCK Club 2'),match(998,'Unknown Cup','MOCK Unconfirmed','MOCK Other'),match(4,'Euro Championship','France','Germany','NS','20:00:00Z')]
   return await route.fulfill(json={'response':[] if getattr(self,'empty',False) else rows,'updatedAt':datetime.now(ZoneInfo('UTC')).isoformat()})
  return await harness.RedesignBrowser.route(self,route)

 async def open_international(self):
  await self.nav('skor');await self.page.locator('[data-score="international"]').click()

 async def load(self,provider='api'):
  await self.page.locator('#internationalDataSources').evaluate('(e)=>e.open=true')
  await self.page.locator('#internationalSource').select_option(provider)
  await self.page.locator('#internationalDataSources').evaluate('(e)=>e.open=false')
  await self.page.locator('#internationalRefresh').click()
  await self.page.wait_for_function('document.querySelector("#internationalResults").getAttribute("aria-busy")!=="true"')

 async def test_manual_only_filters_flags_and_three_iPhone_widths(self):
  await self.open_international();before=len(self.calls)
  self.assertEqual(await self.page.locator('#internationalLoad').is_enabled(),True)
  await self.page.locator('#internationalSearch').fill('Malaysia');await self.page.locator('#internationalSearch').fill('')
  self.assertEqual(len(self.calls),before)
  await self.load();self.assertEqual(len(self.calls),before+1)
  self.assertEqual(await self.page.locator('#internationalResults .mc-card').count(),3)
  self.assertEqual(await self.page.locator('#internationalResults [data-match-id="10"] .mc-team-score').first.inner_text(),'0')
  self.assertIn('🇲🇾',await self.page.locator('#internationalResults').inner_text())
  self.assertNotIn('MOCK Club',await self.page.locator('#internationalResults').inner_text())
  await self.page.locator('#internationalDataSources').evaluate('(e)=>e.open=true')
  await self.page.locator('#internationalKind').select_option('qualifiers');self.assertEqual(await self.page.locator('#internationalResults .mc-card').count(),1)
  await self.page.locator('#internationalKind').select_option('all')
  await self.page.locator('#internationalDataSources').evaluate('(e)=>e.open=false')
  await self.page.locator('#internationalSearch').fill('Aruba');self.assertEqual(await self.page.locator('#internationalResults .mc-card').count(),1)
  await self.page.locator('#internationalSearch').fill('')
  await self.page.locator('#internationalCompetition').select_option('10');self.assertEqual(await self.page.locator('#internationalResults .mc-card').count(),1)
  await self.page.locator('#internationalCompetition').select_option('all')
  await self.page.locator('#internationalResults summary').first.click()
  self.assertIn('MOCK <img',await self.page.locator('#internationalResults').inner_text())
  self.assertEqual(await self.page.locator('#internationalResults img').count(),0)
  self.assertEqual(len(self.calls),before+1)
  shots=Path('/tmp/plus-football-international');shots.mkdir(exist_ok=True)
  for width in [375,390,430]:
   await self.page.set_viewport_size({'width':width,'height':844})
   self.assertFalse(await self.page.evaluate('document.documentElement.scrollWidth>innerWidth'))
   await self.page.evaluate('document.querySelector(".app-scroll").scrollTo(0,0)');await self.page.screenshot(path=str(shots/f'international-{width}.png'),full_page=True)
   for control in ['internationalRefresh','internationalSearch','internationalCompetition']:
    r=await self.page.locator('#'+control).bounding_box();self.assertGreaterEqual(r['height'],44)

 async def test_MYT_rollover_and_country_search_do_not_spend_another_request(self):
  await self.open_international();await self.load();before=len(self.calls)
  await self.page.locator('#internationalDataSources').evaluate('(e)=>e.open=true')
  await self.page.locator('#internationalDate').fill((await self.page.locator('#internationalQueryDate').input_value()))
  await self.page.locator('#internationalDate').evaluate('(e)=>{const d=new Date(e.value+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+1);e.value=d.toISOString().slice(0,10);e.dispatchEvent(new Event("change"))}')
  self.assertEqual(await self.page.locator('#internationalResults .mc-card').count(),1)
  self.assertIn('04:00 MYT',await self.page.locator('#internationalResults').inner_text())
  await self.page.locator('#internationalSearch').fill('France');self.assertEqual(len(self.calls),before)

 async def test_shared_cooldown_blocks_club_button_and_preserves_club_filters(self):
  await self.open_international();await self.load();before=len(self.calls)
  await self.page.locator('[data-score="4328"]').click()
  self.assertTrue(await self.page.locator('#internationalPanel').is_hidden())
  await self.page.locator('.free-api-panel summary').click()
  self.assertTrue(await self.page.locator('#apiMatchCheck').is_disabled())
  self.assertIn('TUNGGU',await self.page.locator('#apiMatchCheck').inner_text())
  self.assertEqual(len(self.calls),before)
  await self.page.locator('[data-score="4480"]').click()
  await self.page.locator('.mc-team-score').first.wait_for()
  self.assertIn('4480',await self.page.locator('#scoreContent').inner_text())

 async def test_SportsDB_one_query_supports_small_nations_and_offline_clears_scores(self):
  await self.open_international();before=len(self.calls);await self.load('sports')
  self.assertEqual(len(self.calls),before+1);self.assertIn('Curaçao',await self.page.locator('#internationalResults').inner_text())
  await self.page.evaluate('window.dispatchEvent(new Event("offline"))')
  self.assertEqual(await self.page.locator('#internationalResults .mc-card').count(),0)

 async def test_rate_limit_and_malformed_responses_are_manual_errors(self):
  await self.open_international();self.limited=True;before=len(self.calls);await self.load()
  self.assertIn('Had semakan',await self.page.locator('#internationalResults').inner_text());self.assertIn('3 minit',await self.page.locator('#internationalCooldown').inner_text());self.assertEqual(len(self.calls),before+1)
  await self.page.reload();await self.open_international();self.limited=False;self.malformed=True;await self.load()
  self.assertIn('tidak sah',await self.page.locator('#internationalResults').inner_text());self.assertEqual(await self.page.locator('#internationalResults .mc-card').count(),0)

 async def test_pending_filter_change_and_tab_switch_do_not_render_old_response(self):
  await self.open_international();self.gate=asyncio.Event();await self.page.locator('#internationalRefresh').click()
  await self.page.locator('#internationalSearch').fill('Japan');self.assertTrue(await self.page.locator('#internationalResults .skeleton').is_visible())
  await self.page.locator('[data-score="4328"]').click();self.gate.set();await self.page.wait_for_timeout(150)
  self.assertTrue(await self.page.locator('#internationalPanel').is_hidden())
  before=len(self.calls)
  await self.page.locator('[data-score="international"]').click()
  self.assertEqual(await self.page.locator('#internationalResults .mc-card').count(),1)
  self.assertEqual(len(self.calls),before)

 async def test_empty_sample_is_not_a_claim_that_no_matches_exist(self):
  self.empty=True;await self.open_international();await self.load()
  self.assertIn('tidak mengesahkan',await self.page.locator('#internationalResults').inner_text())
  self.assertEqual(await self.page.locator('#internationalResults .mc-card').count(),0)
  await self.page.reload();self.empty=False;self.limited=True;await self.open_international();await self.load('sports')
  self.assertIn('3 minit',await self.page.locator('#internationalCooldown').inner_text())

 async def test_snapshot_expires_without_polling_or_showing_stale_scores(self):
  await self.page.clock.install();await self.open_international();await self.load();before=len(self.calls)
  self.assertGreater(await self.page.locator('#internationalResults .mc-card').count(),0)
  await self.page.clock.fast_forward(121000)
  self.assertEqual(await self.page.locator('#internationalResults .mc-card').count(),0)
  self.assertIn('Semakan baharu',await self.page.locator('#internationalResults').inner_text());self.assertEqual(len(self.calls),before)

 async def test_pending_club_API_cannot_replace_international_selection_and_cache_is_shared(self):
  await self.page.clock.install();await self.nav('skor');self.gate=asyncio.Event()
  await self.page.locator('.free-api-panel summary').click();await self.page.locator('#apiMatchCheck').click()
  await self.page.locator('[data-score="international"]').click();self.gate.set();await self.page.wait_for_timeout(200)
  self.assertEqual(await self.page.locator('[data-score="international"]').get_attribute('aria-pressed'),'true')
  self.assertEqual(await self.page.locator('#internationalResults .mc-card').count(),0)
  before=len([url for url in self.calls if '/api/football?' in url]);self.assertEqual(before,1)
  await self.page.clock.fast_forward(61000);await self.load()
  self.assertEqual(len([url for url in self.calls if '/api/football?' in url]),before)
  self.assertGreater(await self.page.locator('#internationalResults .mc-card').count(),0)

 async def test_fixture_first_compact_days_and_on_demand_cooldown(self):
  await self.open_international();await self.load();before=len(self.calls)
  self.assertFalse(await self.page.locator('#internationalDataSources').evaluate('(e)=>e.open'))
  for ident in ['internationalSource','internationalQueryDate','internationalKind']:
   self.assertTrue(await self.page.locator('#'+ident).is_hidden())
  self.assertTrue(await self.page.locator('#internationalCooldown').is_hidden())
  await self.page.locator('#internationalRefresh').click()
  self.assertIn('Cuba lagi',await self.page.locator('#internationalCooldown').inner_text());self.assertEqual(len(self.calls),before)
  for offset,count in [('-1',0),('0',3),('1',1)]:
   await self.page.locator(f'[data-international-offset="{offset}"]').click()
   self.assertEqual(await self.page.locator('#internationalResults .mc-card').count(),count)
   self.assertEqual(await self.page.locator(f'[data-international-offset="{offset}"]').get_attribute('aria-pressed'),'true')
  self.assertEqual(len(self.calls),before)
  self.assertTrue(await self.page.locator('#internationalResults').evaluate('(e)=>!!(e.compareDocumentPosition(document.getElementById("internationalDataSources"))&Node.DOCUMENT_POSITION_FOLLOWING)'))

 async def test_dock_has_its_own_space_and_all_controls_are_scroll_accessible(self):
  await self.open_international();await self.load()
  shots=Path('/tmp/plus-football-international');shots.mkdir(exist_ok=True)
  for width in [375,390,430]:
   await self.page.set_viewport_size({'width':width,'height':844})
   pane=self.page.locator('#appScroll');dock=self.page.locator('.primary-nav')
   pr,dr=await pane.bounding_box(),await dock.bounding_box()
   self.assertLessEqual(pr['y']+pr['height'],dr['y']-4,'Dock must be outside content viewport')
   await pane.evaluate('(e)=>e.scrollTop=0')
   first=await self.page.locator('#internationalResults .mc-card').first.bounding_box()
   self.assertLess(first['y']+80,pr['y']+pr['height'],'First fixture must be visible before source settings')
   await self.page.screenshot(path=str(shots/f'compact-{width}.png'))
   await pane.focus();await self.page.keyboard.press('PageDown');await self.page.wait_for_timeout(300)
   self.assertGreater(await pane.evaluate('(e)=>e.scrollTop'),0,'Keyboard must scroll the native content pane')
   await self.page.locator('#internationalDataSources').evaluate('(e)=>e.open=true')
   for ident in ['internationalSearch','internationalCompetition','internationalSource','internationalQueryDate','internationalDate','internationalKind','installButton']:
    control=self.page.locator('#'+ident);await control.scroll_into_view_if_needed();await control.focus()
    r=await control.bounding_box()
    self.assertGreaterEqual(r['y'],pr['y']-1);self.assertLessEqual(r['y']+r['height'],pr['y']+pr['height']+1)
    self.assertTrue(await control.evaluate('(e)=>{const r=e.getBoundingClientRect();return e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}'),ident)
   self.assertGreater(await pane.evaluate('(e)=>e.scrollTop'),0)
   self.assertFalse(await pane.evaluate('(e)=>e.scrollWidth>e.clientWidth'))
   await self.page.locator('#internationalDataSources').evaluate('(e)=>e.open=false')
  # A shorter viewport approximates browser chrome/keyboard space; real Safari
  # keyboard and hardware safe areas still need physical-device verification.
  await self.page.set_viewport_size({'width':390,'height':620})
  await self.page.locator('#internationalDataSources').evaluate('(e)=>e.open=true')
  await self.page.locator('#internationalDate').focus();await self.page.locator('#internationalDate').scroll_into_view_if_needed()
  pr,dr=await self.page.locator('#appScroll').bounding_box(),await self.page.locator('.primary-nav').bounding_box()
  self.assertLessEqual(pr['y']+pr['height'],dr['y']-4)
  await self.page.keyboard.press('Tab')
  self.assertTrue(await self.page.evaluate('document.getElementById("appScroll").contains(document.activeElement)'))

 async def test_fresh_club_cache_is_visible_on_open_without_another_API_call(self):
  await self.nav('skor');await self.page.locator('.free-api-panel summary').click();await self.page.locator('#apiMatchCheck').click()
  await self.page.wait_for_function('document.querySelector("#apiMatchResults").textContent.includes("Tarikh pertanyaan")')
  before=len(self.calls);await self.page.locator('[data-score="international"]').click()
  self.assertEqual(await self.page.locator('#internationalResults .mc-card').count(),3);self.assertEqual(len(self.calls),before)
  await self.nav('berita');self.assertTrue(await self.page.locator('.ticker').is_visible())
  await self.nav('skor');self.assertEqual(len(self.calls),before);self.assertTrue(await self.page.locator('.ticker').is_hidden())

if __name__=='__main__':unittest.main(verbosity=2)
