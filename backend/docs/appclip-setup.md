# App Clip and universal link setup (founder, needs Apple Developer account)

The backend already serves `/.well-known/apple-app-site-association` (also at `/apple-app-site-association`) and `/.well-known/assetlinks.json`, rendered from `templates/` and env vars. Defaults are placeholders.

## Apple
1. Enrol in the Apple Developer Program (organisation account recommended; needs a D-U-N-S number).
2. Note the 10 character Team ID (Membership page). Set `IOS_TEAM_ID`.
3. Register bundle IDs: the app (e.g. `com.aevea.app`) and the clip (`com.aevea.app.Clip`). Set `IOS_BUNDLE_ID`, `IOS_CLIP_BUNDLE_ID`. Enable Associated Domains on both.
4. In Xcode (Flutter ios/ project): add an App Clip target; add Associated Domains `applinks:pet.theaevea.com` and `appclips:pet.theaevea.com` to app and clip.
5. Host the domain over valid HTTPS, no redirects on the AASA path, `Content-Type: application/json`. Deploy and check with `curl -I`.
6. In App Store Connect, create the App Clip Experience (Advanced App Clip Experience): URL prefix `https://pet.theaevea.com/t`, card title, subtitle, image. The clip must load the finder page for the URL it is invoked with.
7. The clip invocation URL is the NTAG tap URL (`/t?e=...&c=...`). The server verifies and redirects to `/p/{slug}`; the clip should open the web view or native screen for that. App Clips need a hosted app page association via `appclips` in the AASA (already in the template).
8. Test: TestFlight build, then Settings > Developer > Local Experiences for the clip before App Store approval. Apple caches AASA via its CDN; allow time after changes.
9. Keep the clip under Apple's size limit (currently 15 MB for iOS 16+ digital invocations; verify the current limit).

## Android
1. Get the release signing SHA-256 (Play App Signing certificate from Play Console > App integrity). Set `ANDROID_SHA256`, `ANDROID_PACKAGE`.
2. Add intent filters with `android:autoVerify="true"` for host `pet.theaevea.com`, paths `/p/` and `/t`.
3. Verify with `adb shell pm get-app-links com.aevea.app`.

## Note on tap behaviour
iPhones read NTAG 424 DNA URLs in the background (iPhone XS and later) and open the link; with the app/clip installed or invoked, the OS routes to it. Without them it opens Safari with the finder page, which works with no install.

## Untested
Nothing here has been run against Apple or Google. Component matching syntax in the AASA (`"?": {...}`) and the clip card requirements should be checked in Xcode and App Store Connect.
