"""Liquid Glass interaction/layout checks, local mock transport only.
Chromium emulation is not physical iPhone Safari verification.
"""
import unittest
import sys
sys.dont_write_bytecode=True
from pathlib import Path
import redesign_browser as harness

class LiquidGlassBrowser(unittest.IsolatedAsyncioTestCase):
 asyncSetUp=harness.RedesignBrowser.asyncSetUp
 asyncTearDown=harness.RedesignBrowser.asyncTearDown
 route=harness.RedesignBrowser.route
 panel=harness.RedesignBrowser.nav

 async def test_dock_stays_at_viewport_bottom_and_all_panels_work(self):
  shots=Path('/tmp/plus-football-liquid-glass');shots.mkdir(exist_ok=True)
  for width in [375,390,430]:
   await self.page.set_viewport_size({'width':width,'height':844})
   for view in ['berita','skor','kedudukan','perlawanan']:
    await self.panel(view)
    await self.page.evaluate('window.scrollTo(0,document.documentElement.scrollHeight)')
    await self.page.wait_for_timeout(350)
    nav=self.page.locator('.primary-nav');r=await nav.bounding_box()
    self.assertGreater(r['y'],700);self.assertLessEqual(r['y']+r['height'],833)
    self.assertGreaterEqual(r['x'],12);self.assertLessEqual(r['x']+r['width'],width-11)
    self.assertFalse(await self.page.evaluate('document.documentElement.scrollWidth>innerWidth'))
    for link in await nav.locator('a').all():
     size=await link.bounding_box();self.assertGreaterEqual(size['height'],44);self.assertGreaterEqual(size['width'],44)
     self.assertTrue(await link.evaluate('(a)=>{const r=a.getBoundingClientRect();return a.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2))}'))
    await self.page.evaluate('window.scrollTo(0,0)');await self.page.wait_for_timeout(300)
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
