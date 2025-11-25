import os
from playwright.sync_api import sync_playwright

def verify_ui():
    cwd = os.getcwd()
    blackbox_path = f"file://{cwd}/blackbox.html"
    browser_path = f"file://{cwd}/index.html"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()

        # Mock electron ipcRenderer
        mock_electron_script = """
        window.require = function(module) {
            if (module === 'electron') {
                return {
                    ipcRenderer: {
                        send: (channel, data) => console.log('Mock Send:', channel, data),
                        on: (channel, func) => {
                            window['mock_on_' + channel] = func;
                            // Trigger immediately if getting profiles
                            if (channel === 'profiles-data') {
                                // wait for listener to be attached
                            }
                        }
                    }
                };
            }
        };
        """

        # --- Verify Blackbox UI ---
        print("Verifying Blackbox UI...")
        page_bb = context.new_page()
        page_bb.add_init_script(mock_electron_script)
        page_bb.goto(blackbox_path)

        # Inject dummy data for table
        page_bb.evaluate("""
            const mockData = [
                { id: '1234567890', profile: 'BANKING', title: 'My Bank - Login', proxy: 'Direct', ttl: 0, creationTime: Date.now() - 60000 },
                { id: '0987654321', profile: 'MALWARE_ANALYST', title: 'Suspicious Site', proxy: 'socks5://127.0.0.1:9050', ttl: 600000, creationTime: Date.now() - 120000 }
            ];
            // Simulate the event coming from IPC
            if (window['mock_on_containers-data']) {
                 window['mock_on_containers-data'](null, mockData);
            } else {
                console.log("Listener not found!");
            }
        """)

        # Wait a bit for rendering
        page_bb.wait_for_timeout(500)
        page_bb.screenshot(path="verification/blackbox_ui.png")
        print("Blackbox UI screenshot taken.")

        # --- Verify Browser UI ---
        print("Verifying Browser UI...")
        page_br = context.new_page()
        page_br.add_init_script(mock_electron_script)
        page_br.goto(browser_path)

        # Inject profile data
        page_br.evaluate("""
            const mockProfiles = [
                { key: 'STANDARD', name: 'Standard' },
                { key: 'BANKING', name: 'Banking' },
                { key: 'MALWARE_ANALYST', name: 'Malware Analyst' }
            ];
             if (window['mock_on_profiles-data']) {
                window['mock_on_profiles-data'](null, mockProfiles);
            }
        """)

        # Click new tab button to show menu
        page_br.click("#new-tab-btn")

        # Wait for menu to appear
        page_br.wait_for_selector("#profile-menu.visible")
        page_br.screenshot(path="verification/browser_ui.png")
        print("Browser UI screenshot taken.")

        browser.close()

if __name__ == "__main__":
    verify_ui()