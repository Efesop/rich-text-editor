import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.dashnote.app',
  appName: 'Dash',
  webDir: 'out',
  // Production: WebView serves from `capacitor://localhost` (default secure
  // scheme). Outbound `wss://dash-relay.efesop.deno.net` is secure-secure —
  // no mixed-content concern.
  // Local dev against `ws://localhost:8000` (insecure) needs the WebView
  // origin to also be insecure or the connection is blocked. Re-add this
  // block for that case:
  //   server: { iosScheme: 'http' }
  ios: {
    // We handle safe-area insets in CSS via env(); don't double-apply
    // them at the WebView level (would shift layout when keyboard shows).
    contentInset: 'never',
    limitsNavigationsToAppBoundDomains: false,
    backgroundColor: '#ffffff',
    scrollEnabled: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      launchAutoHide: true,
      backgroundColor: '#ffffff',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: false
    },
    Keyboard: {
      resize: 'native',
      resizeOnFullScreen: true
    },
    StatusBar: {
      overlaysWebView: true,
      style: 'DEFAULT',
      backgroundColor: '#ffffff'
    }
  }
};

export default config;
