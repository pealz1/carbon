# Private Carbon releases

The site Worker at getcarbon.cc runs before all static assets. The accounts Worker checks keys on signup, verifies account grants on session lookup, and limits administration to the existing admin allowlist. Signed installers and manifest files live in the private `carbon-private-releases` R2 bucket.

## First cutover

1. Apply the accounts migration `0011_access_keys.sql` before deploying the accounts Worker. It preserves existing accounts with a grant tied to their account. Confirm existing browser and desktop sign-in using the same account.
2. During staging, override the accounts Worker with `--var ACCESS_REQUIRED:false` and the site Worker with `--var PRIVATE_SITE:false`. Keep the old public updater available while a signed build using the authenticated site updater is prepared.
3. Run `website/publish-release.ps1` with `-WrappedWrangler` pointing at Wrangler and `-StagingPath` outside the repo. It copies the latest installer assets and their signatures to R2, verifies corresponding local signatures, and publishes the website changelog and update index. Changelog history is retained. Packages from earlier releases aren't copied by this command.
4. Verify anonymous access redirects to `/access`, anonymous assets and installers are blocked, an authenticated browser obtains an installer, and a signed app update succeeds with a desktop token. Use an entitled account and test the migrated user path before closing GitHub's public release path.
5. Deploy both Workers with their configured defaults and validate the same routes after enabling the gates. Change GitHub visibility after the site downloads and new updater are verified. Older builds that still point to GitHub need the website installer after the repo closes.
6. Open **Access keys** in the admin panel and send the existing-account notice in batches. The endpoint uses the existing email budget and records which messages were accepted by the mail service.

The access page offers $100 access through the admin email address. Fulfillment is manual through the access-key panel.

## Ongoing releases

Build signed installers with the Release workflow. GitHub keeps the signed output as a draft. Publish to R2 with `website/publish-release.ps1 -Tag vX.Y.Z -AllowDraft` before announcing it. Keep R2 private and use the website download URLs for distribution.
