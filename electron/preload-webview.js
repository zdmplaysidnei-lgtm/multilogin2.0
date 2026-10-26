const { webFrame } = require('electron');

const mainWorldScript = `
(function() {
  if (window.__sidneiAntiDetectInstalled) return;
  try {
    Object.defineProperty(window, '__sidneiAntiDetectInstalled', { value: true, configurable: false, writable: false });
  } catch(_) {}

  // 1. Defeat navigator.webdriver
  try {
    Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
  } catch(_) {}

  // 2. Suppress WebAuthn / Passkeys / FIDO
  if (window.PublicKeyCredential) {
    try {
      Object.defineProperty(window.PublicKeyCredential, 'isUserVerifyingPlatformAuthenticatorAvailable', {
        value: () => Promise.resolve(false),
        configurable: true
      });
      Object.defineProperty(window.PublicKeyCredential, 'isConditionalMediationAvailable', {
        value: () => Promise.resolve(false),
        configurable: true
      });
      if (typeof window.PublicKeyCredential.isExternalCTAP2SecurityKeySupported === 'function') {
        Object.defineProperty(window.PublicKeyCredential, 'isExternalCTAP2SecurityKeySupported', {
          value: () => Promise.resolve(false),
          configurable: true
        });
      }
    } catch(_) {}
  }

  if (navigator.credentials) {
    try {
      const origGet = navigator.credentials.get.bind(navigator.credentials);
      navigator.credentials.get = function(opts) {
        if (opts && opts.publicKey) return Promise.reject(new DOMException('Not allowed', 'NotAllowedError'));
        return origGet(opts);
      };
      const origCreate = navigator.credentials.create.bind(navigator.credentials);
      navigator.credentials.create = function(opts) {
        if (opts && opts.publicKey) return Promise.reject(new DOMException('Not allowed', 'NotAllowedError'));
        return origCreate(opts);
      };
    } catch(_) {}
  }

  // 3. Languages
  try {
    Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'], configurable: true });
  } catch(_) {}

  // 4. User-Agent Data
  try {
    const brands = [
      { brand: 'Google Chrome', version: '141' },
      { brand: 'Chromium', version: '141' },
      { brand: 'Not_A Brand', version: '24' },
    ];
    const fullVersionList = [
      { brand: 'Google Chrome', version: '141.0.7390.107' },
      { brand: 'Chromium', version: '141.0.7390.107' },
      { brand: 'Not_A Brand', version: '24.0.0.0' },
    ];
    const uaData = {
      brands,
      mobile: false,
      platform: 'Windows',
      getHighEntropyValues: () => Promise.resolve({
        brands,
        mobile: false,
        platform: 'Windows',
        platformVersion: '15.0.0',
        architecture: 'x86',
        bitness: '64',
        model: '',
        uaFullVersion: '141.0.7390.107',
        fullVersionList,
        wow64: false,
      }),
      toJSON: () => ({ brands, mobile: false, platform: 'Windows' }),
    };
    Object.defineProperty(navigator, 'userAgentData', { get: () => uaData, configurable: true });
  } catch (_) {}

  // 5. Clean Google Chrome window.chrome object (matches real Chrome, no runtime/webstore leaks)
  try {
    window.chrome = window.chrome || {};
    window.chrome.app = window.chrome.app || {
      isInstalled: false,
      InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
      RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' },
      getDetails: function() {},
      getIsInstalled: function() { return false; },
      runningState: function() { return 'cannot_run'; }
    };
    window.chrome.csi = window.chrome.csi || function() {};
    window.chrome.loadTimes = window.chrome.loadTimes || function() {
      return {
        commitLoadTime: Date.now() / 1000,
        connectionInfo: 'h2',
        finishDocumentLoadTime: Date.now() / 1000,
        finishLoadTime: Date.now() / 1000,
        firstPaintAfterLoadTime: 0,
        navigationType: 'Other',
        npnNegotiatedProtocol: 'h2',
        requestTime: Date.now() / 1000,
        startLoadTime: Date.now() / 1000,
        wasAlternateProtocolAvailable: false,
        wasFetchedViaSpdy: true,
        wasNpnNegotiated: true
      };
    };
    // Ensure no suspicious bot markers
    delete window.chrome.runtime;
    delete window.chrome.webstore;
  } catch (_) {}

  // 6. Clean Electron & Node globals
  ['process', 'require', '__electron_log', 'Buffer', 'global'].forEach((key) => {
    try {
      if (key in window) {
        Object.defineProperty(window, key, { get: () => undefined, configurable: true });
      }
    } catch {}
  });
})();
`;

try {
  webFrame.executeJavaScript(mainWorldScript);
} catch(e) {
  console.error('[PRELOAD ERROR]', e);
}
