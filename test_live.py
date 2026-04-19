from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('https://score-phantom.onrender.com')
    page.wait_for_load_state('networkidle')
    page.screenshot(path='home.png', full_page=True)
    print("Page title:", page.title())
    
    # Let's dump text content to see what's rendered
    print("Main content:")
    print(page.locator('body').inner_text()[:500])
    
    browser.close()
