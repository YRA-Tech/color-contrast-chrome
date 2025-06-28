color-contrast-chrome
Color Contrast Analyzer Extension for Google Chrome

This browser extension was originally written by Greg Krauss during his time at NCSU, so NCSU owns the original copyright (very permissively licensed), but they are no longer maintaining it.

Notes on the Code

Versions

2.0.50
After chatting with Greg, my team took their original code and
- removed the parts related to screen capture that were originally from a Google library but are now supported by the browser natively
- updated it to work with Manifest v3 (with appropriate security settings)
- added support for variable device pixel ratios, including support for browser zoom.  With this addition it should now work with Macs and other computers that have dense displays.
- With this addition there are now two capture modes -- hardware pixels or CSS pixels. In hardware pixel mode, the analysis image is the same size as the display pixels, which may be larger than what you want if your intention is to paste the image into a report.
- In CSS pixel mode, the resulting image is supposed to be true to the intended size and may be different that what is originally displayed.
  The browser doesn't offer a native way to get a screen capture that is always true to the CSS values you'd get if you used a display with 1:1 device pixel ratio, at 100% zoom.
  To address this we borrow a scaling technique from playwright.js (see https://playwright.dev/docs/api/class-elementhandle#element-handle-screenshot, https://github.com/microsoft/playwright/blob/main/packages/playwright-core/src/server/chromium/crPage.ts)

1.1.2

adjusted z-index for the draggable area to the maximum allowed value of 2147483647 to help ensure it will not be positioned underneath other elements
1.1.1

adjusted CSS for Windows buttons
1.1.0

added ability to download the image analysis to a local file
1.03

fixed a bug where the WCAG 2 and pixel radius settings were not sticking once you clicked the rescan button
1.02

added better support for processing local files within Chrome
1.01

added keyboard support for the popup window
increased the z-index value of the draggable area
1.00

compressed icon images and removed unused images
0.60

fixed problem with extension not loading when the page was idle for too long
made the layout screen more fluid
added WCAG contrast ratio levels to the conformance level selector
added the link to the help file
0.53

initial commit
