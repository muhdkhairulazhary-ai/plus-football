"""Rasterize the existing plus+ wordmark locally. No remote fonts or AI.
Requires the existing Python Playwright/Chromium test environment.
"""
import asyncio,shutil
from pathlib import Path
from playwright.async_api import async_playwright
ROOT=Path(__file__).resolve().parents[1]
async def main():
 svg=(ROOT/'icons/plus-football-brand.svg').read_text()
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  try:
   page=await browser.new_page(device_scale_factor=1)
   await page.route('**/*',lambda route:route.abort())
   for size,canonical,compatibility in [
    (180,'apple-touch-icon-plus-football-v2.png','apple-touch-icon.png'),
    (192,'plus-football-192-v2.png','icon-192.png'),
    (512,'plus-football-512-v2.png','icon-512.png')]:
    await page.set_viewport_size({'width':size,'height':size})
    await page.set_content('<html><body style="margin:0;background:#0b0b0b">'+svg.replace('<svg ','<svg style="display:block;width:100vw;height:100vh" ',1)+'</body></html>')
    await page.screenshot(path=str(ROOT/'icons'/canonical))
    # Existing icon URLs remain valid for older manifests/shortcuts.
    shutil.copyfile(ROOT/'icons'/canonical,ROOT/'icons'/compatibility)
  finally:await browser.close()
asyncio.run(main())
