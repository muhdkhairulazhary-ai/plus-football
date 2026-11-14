"""Liquid Glass interaction/layout checks, local mock transport only.
Chromium emulation is not physical iPhone Safari verification.
"""
import unittest
import io,json
from PIL import Image,ImageStat
import sys
sys.dont_write_bytecode=True
from pathlib import Path
import redesign_browser as harness

class LiquidGlassBrowser(unittest.IsolatedAsyncioTestCase):
 asyncSetUp=harness.RedesignBrowser.asyncSetUp
 asyncTearDown=harness.RedesignBrowser.asyncTearDown
 route=harness.RedesignBrowser.route
 panel=harness.RedesignBrowser.nav

 async def test_ambient_light_changes_pixels_inside_translucent_panel(self):
  shots=Path('/tmp/plus-football-liquid-glass');shots.mkdir(exist_ok=True)
  metrics={}
  await self.panel('kedudukan')
  for width in [375,390,430]:
   await self.page.set_viewport_size({'width':width,'height':844})
   await self.page.evaluate('document.querySelector(".app-scroll").scrollTo(0,0)');await self.page.wait_for_timeout(400)
   panel=self.page.locator('#kedudukan .standings-panel')
   self.assertEqual(await panel.evaluate('(e)=>getComputedStyle(e).backdropFilter'),'blur(8px)')
   self.assertEqual(await self.page.locator('#main').evaluate('(e)=>getComputedStyle(e).overflow'),'visible')
   self.assertEqual(await self.page.locator('#main').evaluate('(e)=>getComputedStyle(e).filter'),'none')
   self.assertEqual(await self.page.locator('.ambient-lights').evaluate('(e)=>getComputedStyle(e).position'),'absolute')
   self.assertEqual(await panel.locator('h3').evaluate('(e)=>getComputedStyle(e).filter'),'none')
   await self.page.locator('#appScroll').evaluate('(e)=>e.scrollTop=0')
   r=await panel.bounding_box();pane=await self.page.locator('#appScroll').bounding_box()
   crop=(int(r['x']+r['width']*.2),int(max(r['y']+100,pane['y']+40)),int(r['x']+r['width']*.8),int(min(r['y']+r['height']-30,pane['y']+pane['height']-25)))
   on=await self.page.screenshot(path=str(shots/f'ambient-card-{width}.png'))
   await self.page.locator('.ambient-lights').evaluate('(e)=>e.hidden=true')
   off=await self.page.screenshot(path=str(shots/f'ambient-card-disabled-{width}.png'))
   await self.page.locator('.ambient-lights').evaluate('(e)=>e.hidden=false')
   a,b=Image.open(io.BytesIO(on)).convert('RGB'),Image.open(io.BytesIO(off)).convert('RGB')
   # Interior central area, excluding borders/edge glow; text is identical.
   self.assertGreater(crop[3],crop[1])
   lit=ImageStat.Stat(a.crop(crop)).mean;unlit=ImageStat.Stat(b.crop(crop)).mean
   delta=[round(x-y,2) for x,y in zip(lit,unlit)]
   self.assertGreater(delta[0],10,f'{width}: light must visibly change card INTERIOR {delta}')
   self.assertGreater(delta[0]-delta[1],6,f'{width}: ambient contribution must be burgundy/red {delta}')
   metrics[width]={'interiorRGBWithLight':lit,'interiorRGBWithoutLight':unlit,'deltaRGB':delta}
   await self.page.evaluate('document.querySelector(".app-scroll").scrollTo(0,0)');await self.page.wait_for_timeout(350)
   await self.page.screenshot(path=str(shots/f'ambient-{width}.png'))
  (shots/'ambient-pixel-evidence.json').write_text(json.dumps(metrics,indent=2))

 async def test_dock_stays_at_viewport_bottom_and_all_panels_work(self):
  shots=Path('/tmp/plus-football-liquid-glass');shots.mkdir(exist_ok=True)
  for width in [375,390,430]:
   await self.page.set_viewport_size({'width':width,'height':844})
   for view in ['berita','skor','kedudukan','perlawanan']:
    await self.panel(view)
    await self.page.evaluate('document.querySelector(".app-scroll").scrollTo(0,document.querySelector(".app-scroll").scrollHeight)')
    await self.page.wait_for_timeout(350)
    nav=self.page.locator('.primary-nav');r=await nav.bounding_box()
    self.assertGreater(r['y'],700);self.assertLessEqual(r['y']+r['height'],833)
    self.assertGreaterEqual(r['x'],12);self.assertLessEqual(r['x']+r['width'],width-11)
    self.assertFalse(await self.page.evaluate('document.documentElement.scrollWidth>innerWidth'))
    for link in await nav.locator('a').all():
     size=await link.bounding_box();self.assertGreaterEqual(size['height'],44);self.assertGreaterEqual(size['width'],44)
     self.assertTrue(await link.evaluate('(a)=>{const r=a.getBoundingClientRect();return a.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}'))
    await self.page.evaluate('document.querySelector(".app-scroll").scrollTo(0,0)');await self.page.wait_for_timeout(300)
    await self.page.screenshot(path=str(shots/f'{view}-{width}.png'))
   await self.panel('berita')
   await self.page.locator('#featuredStory button').first.click()
   self.assertTrue(await self.page.locator('.top').evaluate('(e)=>e.inert'))
   self.assertTrue(await self.page.locator('#modal').is_visible())
   await self.page.screenshot(path=str(shots/f'article-{width}.png'))
   await self.page.keyboard.press('Escape')

 async def test_opaque_fallback_reduced_motion_and_contrast(self):
  # Simulate browsers with no backdrop-filter, without relying on a CSS parser.
  await self.page.add_style_tag(content='*{-webkit-backdrop-filter:none!important;backdrop-filter:none!important}')
  nav=self.page.locator('.primary-nav')
  color=await nav.evaluate('(e)=>getComputedStyle(e).backgroundColor')
  self.assertNotIn(color,['transparent','rgba(0, 0, 0, 0)'])
  await self.page.emulate_media(reduced_motion='reduce')
  self.assertEqual(await nav.locator('a').first.evaluate('(e)=>getComputedStyle(e).transitionDuration'),'0s')
  self.assertEqual(await self.page.locator('html').evaluate('(e)=>getComputedStyle(e).scrollBehavior'),'auto')
  await self.page.emulate_media(contrast='more')
  self.assertEqual(await nav.evaluate('(e)=>getComputedStyle(e).backgroundColor'),'rgb(18, 18, 21)')
  self.assertEqual(await nav.evaluate('(e)=>getComputedStyle(e).backdropFilter'),'none')

 async def test_desktop_navigation_and_glass_not_on_scrolling_cards(self):
  await self.page.set_viewport_size({'width':1280,'height':900})
  self.assertNotEqual(await self.page.locator('.primary-nav').evaluate('(e)=>getComputedStyle(e).position'),'fixed')
  self.assertEqual(await self.page.locator('.story').first.evaluate('(e)=>getComputedStyle(e).backdropFilter'),'none')
  await self.page.locator('#menuToggle').click()
  self.assertTrue(await self.page.locator('#quickMenu').is_visible())
  await self.page.keyboard.press('Escape')
  self.assertTrue(await self.page.locator('#quickMenu').is_hidden())

if __name__=='__main__':unittest.main(verbosity=2)
