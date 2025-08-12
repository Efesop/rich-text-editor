const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;

  // Skip notarization entirely if identity is null (unsigned local builds)
  const identity = context.packager.platformSpecificBuildOptions.identity;
  if (!identity) return;

  return await notarize({
    tool: 'notarytool',
    appBundleId: context.packager.appInfo.appId,
    appPath: `${appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_ID_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
    apiKey: process.env.APPLE_API_KEY,
    apiKeyId: process.env.APPLE_API_KEY_ID,
    apiIssuer: process.env.APPLE_API_ISSUER,
  });
};