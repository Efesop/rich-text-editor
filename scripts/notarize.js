const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;

  // Always attempt notarization on CI for mac builds. Identity may be provided via env (CSC_NAME)
  // Support either App-Specific Password or API key credentials
  await notarize({
    tool: 'notarytool',
    appBundleId: context.packager.appInfo.appId,
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword:
      process.env.APPLE_ID_PASSWORD || process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
    apiKey: process.env.APPLE_API_KEY,
    apiKeyId: process.env.APPLE_API_KEY_ID,
    apiIssuer: process.env.APPLE_API_ISSUER,
    staple: true,
  });
};
