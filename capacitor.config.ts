import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.embroideryglassbeads.warehouse',
  appName: 'Warehouse Stocks',
  webDir: 'dist',
  server: {
    url: 'http://116.74.77.22:8088',
    cleartext: true,
  },
  android: {
    buildOptions: {
      keystorePath: 'release.keystore',
      keystoreAlias: 'warehouse',
    },
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      backgroundColor: '#030712',
      showSpinner: false,
    },
  },
}

export default config
