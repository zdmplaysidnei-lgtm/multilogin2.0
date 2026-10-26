import React, { useEffect, useState, useRef } from 'react';
import { RefreshCw, ShieldCheck, ShieldAlert, Lock, ChevronLeft, ChevronRight, Globe, Key, UploadCloud, Database, MessageSquare, Ban, X, Power, PlayCircle, HelpCircle, MessageCircle, Download, CheckCircle, AlertCircle, Search, ChevronUp, ChevronDown, Minus, Square, Maximize2 } from 'lucide-react';
import { Profile } from '../types';

interface BrowserWindowProps {
  profile: Profile;
  isVisible: boolean;
  onClose: () => void;
  onTerminate: () => void;
  onToast?: (msg: string, type: 'info' | 'error' | 'success') => void;
  blockedUrls?: string[];
  // Fix: Added missing onSyncSession prop to resolve TypeScript error in App.tsx
  onSyncSession?: (profileId: string, cookies: string, localStorageData: string) => void | Promise<void>;
}

interface DownloadStatus {
  fileName: string;
  progress: number;
  state: 'downloading' | 'success' | 'error';
}

const COMPATIBLE_USER_AGENT = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";

export const BrowserWindow: React.FC<BrowserWindowProps> = ({ profile, isVisible, onClose, onTerminate, onToast, blockedUrls = [], onSyncSession }) => {
  const [tabs] = useState<string[]>(profile.urls && profile.urls.length > 0 ? profile.urls : ['https://google.com']);
  const [activeTabIndex, setActiveTabIndex] = useState(0);
  const [isMaximized, setIsMaximized] = useState(false);
  const [webviewPreloadUrl, setWebviewPreloadUrl] = useState<string>('');

  const handleClearGoogleSession = async () => {
    if (!window.nebulaAPI?.clearGoogleSession) return;
    try {
      await window.nebulaAPI.clearGoogleSession('persist:' + profile.id);
      const activeWebview = webviewRefs.current[activeTabIndex];
      if (activeWebview) activeWebview.reload();
      if (onToast) onToast('Sessão Google limpa com sucesso! O formulário foi destravado.', 'success');
      else alert('Sessão Google limpa com sucesso! O formulário foi destravado.');
    } catch (_) {}
  };

  useEffect(() => {
    (window as any).nebulaAPI?.getWebviewPreload?.().then((url: string) => {
      if (url) setWebviewPreloadUrl(url);
    }).catch(() => {});
  }, []);
  const [position, setPosition] = useState({ x: 50, y: 50 });
  const [size, setSize] = useState({ width: 1000, height: 700 });
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDir, setResizeDir] = useState<string | null>(null);
  const [autoFillEnabled, setAutoFillEnabled] = useState(profile.autoLoginEnabled ?? true);
  const [download, setDownload] = useState<DownloadStatus | null>(null);
  const [filterUnlimitedActive, setFilterUnlimitedActive] = useState(false);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isRestoringSession, setIsRestoringSession] = useState(true);

  // 🔍 ESTADOS PARA PESQUISA (Ctrl+F)
  const [showSearchBar, setShowSearchBar] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<{ activeMatchOrdinal: number; matches: number }>({ activeMatchOrdinal: 0, matches: 0 });
  const searchInputRef = useRef<HTMLInputElement>(null);

  const dragStartRef = useRef({ x: 0, y: 0, winX: 0, winY: 0, w: 0, h: 0 });
  const webviewRefs = useRef<Array<any | null>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isReadyToNavigate, setIsReadyToNavigate] = useState(false);
  const lastProfileId = useRef<string | null>(null);

  // TRAVA DE 60 SEGUNDOS - REFERÊNCIA DE TEMPO
  const lastSyncTimeRef = useRef<number>(0);

  useEffect(() => {
    if (profile && lastProfileId.current === profile.id) return;
    setIsReadyToNavigate(false);
    setIsRestoringSession(true);
    lastProfileId.current = profile.id;

    const prepareSession = async () => {
      let retry = 0;
      // 🔥 CORREÇÃO: Timeout máximo de 3 segundos se nebulaAPI não existir
      while (!window.nebulaAPI && retry < 30) {
        await new Promise(r => setTimeout(r, 100));
        retry++;
      }

      // Se nebulaAPI existir, configura proxy e cookies
      if (window.nebulaAPI) {
        try {
          const preload = await (window as any).nebulaAPI.getWebviewPreload?.();
          if (preload) setWebviewPreloadUrl(preload);
        } catch (_) {}

        const partition = "persist:" + profile.id;
        try {
          await window.nebulaAPI.setProxy(profile.proxy || '', partition);
          if (window.nebulaAPI?.cleanStaleGoogleHandshake) {
            await window.nebulaAPI.cleanStaleGoogleHandshake(partition);
          }
          if (profile.cookies) {
            await window.nebulaAPI.setCookies(profile.cookies, partition);
          }
          await new Promise(r => setTimeout(r, 800));
        } catch (err) { console.error(err); }
      } else {
        // 🔥 FALLBACK: Se não tem nebulaAPI (modo web), não bloqueia
        console.warn('⚠️ nebulaAPI não disponível, carregando em modo web...');
        await new Promise(r => setTimeout(r, 500));
      }

      setIsRestoringSession(false);
      setIsReadyToNavigate(true);
    };
    prepareSession();

    // LISTENER DE DOWNLOAD (ADICIONADO)
    if (window.nebulaAPI?.onDownloadProgress) {
      window.nebulaAPI.onDownloadProgress((data: any) => {
        if (data.profileId === profile.id) {
          setDownload({
            fileName: data.fileName,
            progress: data.progress,
            state: data.state
          });
          if (data.state !== 'downloading') {
            setTimeout(() => setDownload(null), 5000);
          }
        }
      });
    }
  }, [profile.id]);

  const performCloudSync = async (isManual = false) => {
    const activeWebview = webviewRefs.current[activeTabIndex];
    if (!activeWebview || !profile || !window.nebulaAPI) return;

    // APLICAÇÃO DA TRAVA DE 60 SEGUNDOS (THROTTLING)
    const now = Date.now();
    if (!isManual && now - lastSyncTimeRef.current < 60000) {
      return; // Se não for manual e não passou 60s, cancela o envio para poupar CPU
    }

    if (isManual) setIsSyncing(true);
    try {
      const partition = "persist:" + profile.id;
      const cookieResult = await window.nebulaAPI.getCookies(partition);
      let lsData = "{}";
      try { 
        lsData = await activeWebview.executeJavaScript(`
          (function() {
            var data = {};
            for (var i = 0; i < localStorage.length; i++) {
              var key = localStorage.key(i);
              data[key] = localStorage.getItem(key);
            }
            return JSON.stringify(data);
          })()
        `); 
      } catch (e) { }
      if (cookieResult?.status === 'success') {
        // Fix: Call onSyncSession if provided to handle cloud sync via App.tsx
        if (onSyncSession) {
          const cookiesStr = JSON.stringify(cookieResult.cookies || []);
          await onSyncSession(profile.id, cookiesStr, lsData);
        } else {
          // Fallback to legacy local agent if onSyncSession is not available
          await fetch('http://127.0.0.1:19999/sync-cookies', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profileId: profile.id, cookies: cookieResult.cookies || [], localStorage: lsData })
          });
        }

        // ATUALIZA O TEMPO DO ÚLTIMO SYNC
        lastSyncTimeRef.current = Date.now();

        if (isManual && onToast) onToast('Sincronizado!', 'success');
      }
    } catch (e) { if (isManual) onToast('Erro Sync', 'error'); }
    finally { if (isManual) setTimeout(() => setIsSyncing(false), 800); }
  };

  const executeDiscordTokenLogin = async (webview: any) => {
    if (!profile.discordToken || !webview) return;
    const tokenScript = `
      (function() {
        const token = "${profile.discordToken}";
        function login(token) {
            setInterval(() => {
                if (document.body) {
                    const iframe = document.createElement('iframe');
                    iframe.style.display = 'none';
                    document.body.appendChild(iframe);
                    const local = iframe.contentWindow.localStorage;
                    if (local.token !== '"' + token + '"') {
                        local.token = '"' + token + '"';
                        location.reload();
                    }
                }
            }, 1000);
        }
        login(token);
      })();
    `;
    try {
      await webview.executeJavaScript(tokenScript);
      if (onToast) onToast('Injetando Token...', 'info');
    } catch (e) { console.error(e); }
  };

  const runCustomAutomation = async (webview: any) => {
    if (!profile.automationScript || !webview) return;
    const safeScript = `
      (function() {
        if (!window.__nebula_script_run) {
          try {
            ${profile.automationScript}
            window.__nebula_script_run = true;
          } catch(e) { console.error(e); }
        }
      })();
    `;
    try {
      await webview.executeJavaScript(safeScript);
      if (onToast) onToast('Script Iniciado!', 'success');
    } catch (e) { if (onToast) onToast('Erro no Script', 'error'); }
  };

  const toggleFilterUnlimited = async () => {
    const activeWebview = webviewRefs.current[activeTabIndex];
    if (!activeWebview) return;

    const newState = !filterUnlimitedActive;
    setFilterUnlimitedActive(newState);

    if (newState) {
      const filterScript = `
        (function() {
          if (window.__filterIlimitado) return;
          window.__filterIlimitado = true;

          function applyFilter() {
            // Pega todos os elementos de lista (linhas dos modelos)
            // Estratégia: procura elementos com largura grande (> 400px) e altura de linha (30-120px)
            // e verifica se o row contém ou não o texto "ilimitado"
            const candidates = document.querySelectorAll('*');
            const checked = new Set();

            candidates.forEach(el => {
              if (checked.has(el)) return;
              const rect = el.getBoundingClientRect();
              // Só processa elementos que parecem ser linhas da lista
              if (rect.width < 400 || rect.height < 30 || rect.height > 150) return;

              const fullText = (el.textContent || '').toLowerCase();

              // Se não tem "ilimitado" em nenhum lugar do card, esconde
              if (!fullText.includes('ilimitado') && !fullText.includes('unlimited')) {
                el.setAttribute('data-nebula-hidden', 'true');
                el.style.setProperty('display', 'none', 'important');
                checked.add(el);
              }
            });
          }

          applyFilter();
          window.__filterInterval = setInterval(applyFilter, 1500);
          console.log('\u221E Filtro Ilimitado ATIVADO');
        })();
      `;
      await activeWebview.executeJavaScript(filterScript);
      if (onToast) onToast('\u221E Filtro Ilimitado Ativado!', 'success');
    } else {
      // Desativa: mostra tudo de volta
      const removeFilterScript = `
        (function() {
          if (window.__filterInterval) clearInterval(window.__filterInterval);
          window.__filterIlimitado = false;
          document.querySelectorAll('[data-nebula-hidden]').forEach(el => {
            el.removeAttribute('data-nebula-hidden');
            el.style.removeProperty('display');
          });
          console.log('\u221E Filtro Ilimitado DESATIVADO');
        })();
      `;
      await activeWebview.executeJavaScript(removeFilterScript);
      if (onToast) onToast('Filtro removido', 'info');
    }
  };

  const handleSearch = (term: string) => {
    const activeWebview = webviewRefs.current[activeTabIndex];
    if (!activeWebview || !term) {
      if (activeWebview) activeWebview.stopFindInPage('clearSelection');
      setSearchResults({ activeMatchOrdinal: 0, matches: 0 });
      return;
    }
    activeWebview.findInPage(term);
  };

  const handleSearchNext = () => {
    const activeWebview = webviewRefs.current[activeTabIndex];
    if (activeWebview && searchTerm) {
      activeWebview.findInPage(searchTerm, { forward: true, findNext: true });
    }
  };

  const handleSearchPrev = () => {
    const activeWebview = webviewRefs.current[activeTabIndex];
    if (activeWebview && searchTerm) {
      activeWebview.findInPage(searchTerm, { forward: false, findNext: true });
    }
  };

  useEffect(() => {
    if (profile.customCSS) {
      try {
        (window as any).nebulaAPI?.registerCss("persist:" + profile.id, profile.customCSS);
      } catch (e) {}
    }
  }, [profile.id, profile.customCSS]);

  const closeSearch = () => {
    const activeWebview = webviewRefs.current[activeTabIndex];
    if (activeWebview) activeWebview.stopFindInPage('clearSelection');
    setShowSearchBar(false);
    setSearchTerm('');
    setSearchResults({ activeMatchOrdinal: 0, matches: 0 });
  };

  // 🔍 LISTENER PARA Ctrl+F
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isVisible) return;

      // Ctrl+F ou Cmd+F abre pesquisa
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        e.stopPropagation();
        setShowSearchBar(true);
        setTimeout(() => searchInputRef.current?.focus(), 100);
        return;
      }

      // Escape fecha pesquisa
      if (e.key === 'Escape' && showSearchBar) {
        closeSearch();
        return;
      }

      // Enter vai para próximo resultado
      if (e.key === 'Enter' && showSearchBar) {
        e.shiftKey ? handleSearchPrev() : handleSearchNext();
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isVisible, showSearchBar, searchTerm]);

  // 🔍 LISTENER PARA RESULTADO DE BUSCA DO WEBVIEW
  useEffect(() => {
    const activeWebview = webviewRefs.current[activeTabIndex];
    if (!activeWebview) return;

    const handleFoundInPage = (event: any) => {
      if (event.result) {
        setSearchResults({
          activeMatchOrdinal: event.result.activeMatchOrdinal || 0,
          matches: event.result.matches || 0
        });
      }
    };

    activeWebview.addEventListener('found-in-page', handleFoundInPage);
    return () => {
      activeWebview.removeEventListener?.('found-in-page', handleFoundInPage);
    };
  }, [activeTabIndex, isReadyToNavigate]);

  useEffect(() => {
    if (!isReadyToNavigate) return;

    tabs.forEach((_, idx) => {
      const webview = webviewRefs.current[idx];
      if (!webview) return;

      const handleDomReady = () => {
        if (idx === activeTabIndex) setIsLoading(false);

        // 🔥 INJETAR LOCALSTORAGE DO PERFIL PARA MANTER SESSÃO (EX: HAILUO, MINIMAX)
        if (profile.localStorage && profile.localStorage.trim().startsWith('{')) {
           const injectLsScript = `
             (function() {
               if (!sessionStorage.getItem('nebula_ls_injected')) {
                 try {
                   const lsData = ${profile.localStorage};
                   // Limpar chaves poluidas formato CDP multi-origin (0,1,2,3)
                   for (var _i = localStorage.length - 1; _i >= 0; _i--) {
                     var _k = localStorage.key(_i);
                     if (_k && /^\d+$/.test(_k)) { try { var _v = JSON.parse(localStorage.getItem(_k)); if (_v && _v.origin && Array.isArray(_v.localStorage)) { localStorage.removeItem(_k); } } catch(_e) {} }
                   }
                   let injected = false;
                   for (const key in lsData) {
                     if (!localStorage.getItem(key) || localStorage.getItem(key) !== lsData[key]) {
                       localStorage.setItem(key, lsData[key]);
                       injected = true;
                     }
                   }
                   sessionStorage.setItem('nebula_ls_injected', 'true');
                   if (injected) { console.log('[Nebula] LS injetado, recarregando...'); window.location.reload(); }
                 } catch (e) { console.error('Erro ao injetar LS', e); }
               }
             })();
           `;
           webview.executeJavaScript(injectLsScript);
        }

        webview.insertCSS(`
          input[name="Passwd"], input[type="password"], input[autocomplete*="password"],
          input[name*="password" i], input[name*="senha" i], input[id*="password" i], input[id*="senha" i] {
            -webkit-text-security: disc !important;
          }

          div[jsname="ipZ2Me"], div[class*="VfPpkd-mpDnFf"], div[class*="VfPpkd-dgl2Hf"],
          .VfPpkd-muHqAb-w39FEf, .VfPpkd-muHqAb-mWPyrf,
          div:has(> input[type="checkbox"]), label:has(input[type="checkbox"]),
          form:has(input[name="Passwd"]) input[type="checkbox"],
          input[type="checkbox"][id*="c"], input[type="checkbox"][id*="selection"],
          label[for*="c0"], label[for*="c1"], label[for*="selection"],
          div:has(> label[for*="selection"]), div:has(> label[for*="c0"]),
          input::-ms-reveal, input::-ms-clear,
          .password-toggle, .show-password, [class*="eye"], [id*="eye"], svg[class*="eye"], 
          button[class*="eye"], .reveal-password, [class*="PasswordToggle"],
          button[aria-label*="senha"], button[aria-label*="password"], 
          .toggle-password, i[class*="eye"], [data-testid*="eye"], [aria-label*="Show password"],
          [aria-label*="senha" i], [aria-label*="password" i], [aria-label*="mostrar" i], [aria-label*="show" i],
          button[title*="senha" i], button[title*="password" i],
          input[type="password"] ~ button, input[type="password"] ~ span, input[type="password"] ~ div:has(button) { 
              display: none !important; 
              visibility: hidden !important;
              opacity: 0 !important;
              pointer-events: none !important;
              height: 0 !important;
              min-height: 0 !important;
              max-height: 0 !important;
              overflow: hidden !important;
          }

          /* White-label: Substitui Creative Box por Ferramentas Ilimitadas e Ícone de IA */
          .brand img, img[alt*="Creative Box" i] {
            content: url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCA0OCA0OCIgd2lkdGg9IjQ4IiBoZWlnaHQ9IjQ4Ij4KICA8ZGVmcz4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iYmciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjMGIwODE5Ii8+CiAgICAgIDxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iIzIzMTAzYyIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICAgIDxsaW5lYXJHcmFkaWVudCBpZD0iYWkiIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPgogICAgICA8c3RvcCBvZmZzZXQ9IjAlIiBzdG9wLWNvbG9yPSIjMDBmMmZlIi8+CiAgICAgIDxzdG9wIG9mZnNldD0iNTAlIiBzdG9wLWNvbG9yPSIjOGI1Y2Y2Ii8+CiAgICAgIDxzdG9wIG9mZnNldD0iMTAwJSIgc3RvcC1jb2xvcj0iI2VjNDg5OSIvPgogICAgPC9saW5lYXJHcmFkaWVudD4KICAgIDxmaWx0ZXIgaWQ9Imdsb3ciIHg9Ii0yMCUiIHk9Ii0yMCUiIHdpZHRoPSIxNDAlIiBoZWlnaHQ9IjE0MCUiPgogICAgICA8ZmVHYXVzc2lhbkJsdXIgc3RkRGV2aWF0aW9uPSIxIiByZXN1bHQ9ImJsdXIiLz4KICAgIDxmaWx0ZXI+CiAgPC9kZWZzPgogIDxyZWN0IHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgcng9IjEyIiBmaWxsPSJ1cmwoI2JnKSIvPgogIDxyZWN0IHg9IjAuNSIgeT0iMC41IiB3aWR0aD0iNDciIGhlaWdodD0iNDciIHJ4PSIxMS41IiBmaWxsPSJub25lIiBzdHJva2U9InJnYmEoMTM5LDkyLDI0NiwwLjUpIiBzdHJva2Utd2lkdGg9IjEuNSIvPgogIDxwYXRoIGQ9Ik0yMiA5IEMyMiAxNyAxNSAyMiA3IDIyIEMxNSAyMiAyMiAyNyAyMiAzNSBDMjIgMjcgMjkgMjIgMzcgMjIgQzI5IDIyIDIyIDE3IDIyIDkgWiIgZmlsbD0idXJsKCNhaSkiLz4KICA8Y2lyY2xlIGN4PSIyMiIgY3k9IjIyIiByPSIyLjIiIGZpbGw9IiNmZmZmZmYiLz4KICA8cGF0aCBkPSJNMzUgOCBDMzUgMTIgMzIgMTUgMjggMTUgQzMyIDE1IDM1IDE4IDM1IDIyIEMzNSAxOCAzOCAxNSA0MiAxNSBDMzggMTUgMzUgMTIgMzUgOCBaIiBmaWxsPSIjMDBmMmZlIi8+CiAgPGNpcmNsZSBjeD0iMzUiIGN5PSIxNSIgcj0iMS4yIiBmaWxsPSIjZmZmZmZmIi8+CiAgPHBhdGggZD0iTTEzIDI4IEMxMyAzMSAxMC41IDMzIDggMzMgQzEwLjUgMzMgMTMgMzUgMTMgMzggQzEzIDM1IDE1LjUgMzMgMTggMzMgQzE1LjUgMzMgMTMgMzEgMTMgMjggWiIgZmlsbD0iI2VjNDg5OSIvPgo8L3N2Zz4=") !important;
            width: 46px !important;
            height: 46px !important;
            object-fit: contain !important;
            border-radius: 12px !important;
          }

          .brand b, .brand strong, .brand span, [class*="brand"] b {
            font-size: 0 !important;
            color: transparent !important;
            line-height: 0 !important;
            display: inline-flex !important;
            align-items: center !important;
          }

          .brand b::after, .brand strong::after, .brand span::after, [class*="brand"] b::after {
            content: "Ferramentas Ilimitadas" !important;
            font-size: 22px !important;
            line-height: 1.2 !important;
            font-weight: 800 !important;
            background: linear-gradient(135deg, #00f2fe 0%, #4facfe 30%, #a78bfa 70%, #f43f5e 100%) !important;
            -webkit-background-clip: text !important;
            -webkit-text-fill-color: transparent !important;
            display: inline-block !important;
            letter-spacing: -0.3px !important;
          }
        `);

        if (profile.customCSS) webview.insertCSS(profile.customCSS);

        if (profile.discordToken && webview.getURL().includes('discord.com')) {
          executeDiscordTokenLogin(webview);
        }
        if (profile.automationScript) {
          runCustomAutomation(webview);
        }

                // 🔥 SCRIPT ANTI-DETECÇÃO COMPATÍVEL COM GOOGLE ACCOUNTS (BASEADO NO CREATIVE BOX)
        const antiDetectionScript = `
          (function() {
            if (window.__cbAntiDetectRan) return;
            window.__cbAntiDetectRan = true;

            try {
              Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
            } catch (_) {}

            if (window.PublicKeyCredential) {
              try {
                Object.defineProperty(window.PublicKeyCredential, 'isUserVerifyingPlatformAuthenticatorAvailable', {
                  value: () => Promise.resolve(false), configurable: true, writable: false
                });
                Object.defineProperty(window.PublicKeyCredential, 'isConditionalMediationAvailable', {
                  value: () => Promise.resolve(false), configurable: true, writable: false
                });
                if (typeof window.PublicKeyCredential.isExternalCTAP2SecurityKeySupported === 'function') {
                  Object.defineProperty(window.PublicKeyCredential, 'isExternalCTAP2SecurityKeySupported', {
                    value: () => Promise.resolve(false), configurable: true, writable: false
                  });
                }
              } catch (_) {}
            }

            if (navigator.credentials) {
              try {
                const origGet = navigator.credentials.get.bind(navigator.credentials);
                Object.defineProperty(navigator.credentials, 'get', {
                  value: function(opts) {
                    if (opts && opts.publicKey) return Promise.reject(new DOMException('Passkeys disabled', 'NotAllowedError'));
                    return origGet(opts);
                  },
                  configurable: true,
                  writable: false
                });
                const origCreate = navigator.credentials.create.bind(navigator.credentials);
                Object.defineProperty(navigator.credentials, 'create', {
                  value: function(opts) {
                    if (opts && opts.publicKey) return Promise.reject(new DOMException('Passkeys disabled', 'NotAllowedError'));
                    return origCreate(opts);
                  },
                  configurable: true,
                  writable: false
                });
              } catch (_) {}
            }

            try {
              if (!navigator.languages || navigator.languages.length === 0) {
                Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'], configurable: true });
              }
              Object.defineProperty(navigator, 'platform', { get: () => 'Win32', configurable: true });
              Object.defineProperty(navigator, 'vendor', { get: () => 'Google Inc.', configurable: true });
            } catch (_) {}

            try {
              const cleanUA = navigator.userAgent
                .replace(/\s*Electron\/[^\s]+/g, '')
                .replace(/\s*creativebox\/[^\s]+/gi, '')
                .replace(/\s*multilogin[^\s]+/gi, '')
                .replace(/\s*sidnei[^\s]+/gi, '');
              if (cleanUA !== navigator.userAgent) {
                Object.defineProperty(navigator, 'userAgent', { get: () => cleanUA, configurable: true });
                Object.defineProperty(navigator, 'appVersion', { get: () => cleanUA.replace('Mozilla/', ''), configurable: true });
              }
            } catch (_) {}

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
              try {
                delete window.chrome.runtime;
                delete window.chrome.webstore;
              } catch (_) {}
            } catch (_) {}
          })();
        `;
        webview.executeJavaScript(antiDetectionScript);

        const maintenanceScript = `
          (function() {
            const blocked = ${JSON.stringify(blockedUrls || [])};
            function check() {
              const cur = window.location.href.toLowerCase();
              if (blocked.some(i => i && cur.includes(i.toLowerCase()))) {
                document.body.innerHTML = '<div style="background:#000;color:red;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:sans-serif;text-align:center;"><h1 style="font-size:50px;">🚫</h1><h2 style="font-weight:900;">ACESSO RESTRITO</h2><p>Página bloqueada pelo administrador.</p></div>';
                window.stop();
              }
            }
            setInterval(check, 1000); check();
          })();
        `;
        webview.executeJavaScript(maintenanceScript);

        // 🔥 MOTOR DE AUTO-PREENCHIMENTO MULTI-ETAPAS (COMPATÍVEL COM GOOGLE ACCOUNTS, REACT, VUE, SPAS)
        if (autoFillEnabled && (profile.email || profile.password)) {
          const autofillScript = `
            (function() {
              var EMAIL_VALUE = ${JSON.stringify(profile.email || '')};
              var PASSWORD_VALUE = ${JSON.stringify(profile.password || '')};

              var EMAIL_SELECTORS = [
                'input#identifierId',
                'input[name="identifier"]',
                'input[type="email"]',
                'input[inputmode="email"]',
                'input[autocomplete="email"]',
                'input[autocomplete="username"]',
                'input[autocomplete="tel"]',
                'input[name*="email" i]',
                'input[name*="mail" i]',
                'input[name*="user" i]',
                'input[name*="login" i]',
                'input[name*="identifier" i]',
                'input[name*="usuario" i]',
                'input[name*="cpf" i]',
                'input[name*="document" i]',
                'input[name*="account" i]',
                'input[id*="email" i]',
                'input[id*="mail" i]',
                'input[id*="user" i]',
                'input[id*="login" i]',
                'input[id*="identifier" i]',
                'input[id*="cpf" i]',
                'input[aria-label*="e-mail" i]',
                'input[aria-label*="email" i]',
                'input[aria-label*="usu" i]',
                'input[aria-label*="login" i]',
                'input[aria-label*="telefone" i]',
                'input[placeholder*="e-mail" i]',
                'input[placeholder*="email" i]',
                'input[placeholder*="usu" i]',
                'input[placeholder*="login" i]',
                'input[placeholder*="telefone" i]',
                'input[placeholder*="cpf" i]',
                'input[type="tel"]'
              ];

              var PASSWORD_SELECTORS = [
                'input[type="password"]',
                'input[name="Passwd"]',
                'input[autocomplete="current-password"]',
                'input[autocomplete="new-password"]',
                'input[name*="password" i]',
                'input[name*="senha" i]',
                'input[name*="passwd" i]',
                'input[name*="pwd" i]',
                'input[id*="password" i]',
                'input[id*="senha" i]',
                'input[id*="passwd" i]',
                'input[id*="pwd" i]',
                'input[aria-label*="senha" i]',
                'input[aria-label*="password" i]',
                'input[placeholder*="senha" i]',
                'input[placeholder*="password" i]',
                'input[placeholder*="sua senha" i]'
              ];

              function isVisible(field) {
                if (!field || field.disabled || !field.isConnected) return false;
                var rect = field.getBoundingClientRect();
                var styles = window.getComputedStyle(field);
                return rect.width > 0 && rect.height > 0 && styles.visibility !== 'hidden' && styles.display !== 'none';
              }

              function listSearchRoots(root) {
                var roots = [];
                var seen = [];
                function visit(node) {
                  if (!node || seen.indexOf(node) !== -1) return;
                  seen.push(node);
                  if (typeof node.querySelectorAll === 'function') roots.push(node);
                  var elements = node.children ? Array.prototype.slice.call(node.children) : [];
                  elements.forEach(function(el) {
                    if (el.shadowRoot) visit(el.shadowRoot);
                    if (el.tagName === 'IFRAME') { try { if (el.contentDocument) visit(el.contentDocument); } catch (_) {} }
                  });
                }
                visit(root || document);
                return roots;
              }

              function queryAllDeep(selectors) {
                var matches = [], seen = [];
                listSearchRoots(document).forEach(function(root) {
                  selectors.forEach(function(sel) {
                    try {
                      Array.prototype.slice.call(root.querySelectorAll(sel)).forEach(function(el) {
                        if (seen.indexOf(el) === -1) { seen.push(el); matches.push(el); }
                      });
                    } catch (_) {}
                  });
                });
                return matches;
              }

              function findField(selectors) {
                return queryAllDeep(selectors).find(function(f) { return isVisible(f); }) || null;
              }

              function setNativeValue(field, value, previousValue) {
                var ownerWindow = field && field.ownerDocument && field.ownerDocument.defaultView ? field.ownerDocument.defaultView : window;
                var proto = field.tagName === 'TEXTAREA'
                  ? ownerWindow.HTMLTextAreaElement.prototype
                  : ownerWindow.HTMLInputElement.prototype;
                var desc = Object.getOwnPropertyDescriptor(proto, 'value');
                if (desc && typeof desc.set === 'function') desc.set.call(field, value);
                else field.value = value;
                try { field.setAttribute('value', value); } catch (_) {}
                try {
                  if (field._valueTracker && typeof field._valueTracker.setValue === 'function') {
                    field._valueTracker.setValue(String(previousValue || ''));
                  }
                } catch (_) {}
              }

              function setValue(field, value) {
                if (!field) return false;
                try {
                  field.removeAttribute('readonly');
                  field.removeAttribute('disabled');
                  field.readOnly = false;
                  field.disabled = false;
                } catch (_) {}
                try { field.focus({ preventScroll: true }); } catch (_) { try { field.focus(); } catch (_) {} }
                try { field.select && field.select(); } catch (_) {}
                var previousValue = String(field.value || '');
                setNativeValue(field, value, previousValue);
                try {
                  if (typeof field.setSelectionRange === 'function') {
                    field.setSelectionRange(String(value).length, String(value).length);
                  }
                } catch (_) {}
                try {
                  field.dispatchEvent(new InputEvent('beforeinput', {
                    bubbles: true,
                    cancelable: true,
                    data: String(value),
                    inputType: previousValue ? 'insertReplacementText' : 'insertText',
                  }));
                } catch (_) {}
                try {
                  field.dispatchEvent(new InputEvent('input', {
                    bubbles: true,
                    composed: true,
                    data: String(value),
                    inputType: previousValue ? 'insertReplacementText' : 'insertText',
                  }));
                } catch (_) {
                  field.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                }
                try { field.dispatchEvent(new Event('change', { bubbles: true, composed: true })); } catch (_) {}
                return String(field.value || '').trim() === String(value || '').trim();
              }

              function showAutofillToast() {
                if (window.__cb_autofill_toast_shown) return;
                window.__cb_autofill_toast_shown = true;
                try {
                  var host = document.createElement('div');
                  host.style.cssText = 'position:fixed;top:16px;left:50%;transform:translateX(-50%);z-index:2147483647;pointer-events:none;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;';
                  var t = document.createElement('div');
                  t.style.cssText = 'display:inline-flex;gap:12px;align-items:center;background:linear-gradient(135deg,#062c1d,#0b3a26);color:#fff;padding:10px 18px;border-radius:14px;box-shadow:0 18px 40px rgba(0,0,0,.5),0 0 0 1px rgba(16,185,129,.4);';
                  t.innerHTML = '<span style="width:26px;height:26px;border-radius:8px;background:#10b981;display:inline-flex;align-items:center;justify-content:center;font-size:15px;color:#fff;font-weight:bold;">✓</span><div><div style="font-weight:800;font-size:12px;letter-spacing:0.3px;">E-mail e senha preenchidos automaticamente</div><div style="font-size:11px;color:#34d399;">Tudo pronto — clique em Fazer Login para acessar</div></div>';
                  host.appendChild(t);
                  (document.body || document.documentElement).appendChild(host);
                  setTimeout(function(){ host.remove(); }, 4000);
                } catch (_) {}
              }

              var emailDone = false;
              var passwordDone = false;

              function tryFill() {
                if (EMAIL_VALUE && !emailDone) {
                  var emailField = findField(EMAIL_SELECTORS);
                  if (emailField && (!emailField.value || emailField.value !== EMAIL_VALUE)) {
                    if (setValue(emailField, EMAIL_VALUE)) {
                      emailDone = true;
                    }
                  }
                }

                if (PASSWORD_VALUE && !passwordDone) {
                  var passwordField = findField(PASSWORD_SELECTORS);
                  if (passwordField && (!passwordField.value || passwordField.value !== PASSWORD_VALUE)) {
                    if (setValue(passwordField, PASSWORD_VALUE)) {
                      passwordDone = true;
                      showAutofillToast();
                    }
                  }
                }
              }

              tryFill();
              var fillInterval = setInterval(tryFill, 400);
              setTimeout(function() { clearInterval(fillInterval); }, 45000);
            })();
          `;
          webview.executeJavaScript(autofillScript);
        }
      };

      webview.addEventListener('dom-ready', handleDomReady);
      webview.addEventListener('did-navigate', (e: any) => {
        const navUrl = e.url || '';
        if (navUrl.includes('signin/rejected') || navUrl.includes('rrk=46')) {
          console.warn('[Google Sign-In] Rejeição detectada. Destravando partição automaticamente...');
          window.nebulaAPI?.clearGoogleSession?.("persist:" + profile.id).then(() => {
            webview.loadURL('https://accounts.google.com');
          });
        }
      });
      webview.addEventListener('did-start-loading', () => { if (idx === activeTabIndex) setIsLoading(true); });
      webview.addEventListener('did-stop-loading', () => {
        if (idx === activeTabIndex) {
          setIsLoading(false);
          performCloudSync();
        }
      });
      webview.addEventListener('new-window', (e: any) => {
        e.preventDefault();
        (window as any).nebulaAPI?.openPopup(e.url, "persist:" + profile.id, profile.customCSS, { email: profile.email, password: profile.password });
      });
      webview.addEventListener('page-title-updated', (e: any) => {
        if (e.title && e.title.startsWith('DOWNLOAD_REQUEST_URL:')) {
          const dlUrl = e.title.replace('DOWNLOAD_REQUEST_URL:', '');
          (webview as any).downloadURL(dlUrl);
        }
      });
    });

  }, [profile.id, isReadyToNavigate, autoFillEnabled, blockedUrls, profile.discordToken, profile.automationScript, activeTabIndex]);

  const startDrag = (e: React.MouseEvent) => { if (!isMaximized) { setIsDragging(true); dragStartRef.current = { x: e.clientX, y: e.clientY, winX: position.x, winY: position.y, w: size.width, h: size.height }; } };
  const startResize = (e: React.MouseEvent, d: string) => { if (!isMaximized) { e.stopPropagation(); setIsResizing(true); setResizeDir(d); dragStartRef.current = { x: e.clientX, y: e.clientY, winX: position.x, winY: position.y, w: size.width, h: size.height }; } };

  useEffect(() => {
    const handleMM = (e: MouseEvent) => {
      if (!isVisible) return;
      if (isDragging) setPosition({ x: dragStartRef.current.winX + (e.clientX - dragStartRef.current.x), y: Math.max(0, dragStartRef.current.winY + (e.clientY - dragStartRef.current.y)) });
      else if (isResizing && resizeDir) {
        const deltaX = e.clientX - dragStartRef.current.x, deltaY = e.clientY - dragStartRef.current.y;
        const s = dragStartRef.current;
        let w = s.w, h = s.h;
        if (resizeDir.includes('e')) w = Math.max(400, s.w + deltaX);
        if (resizeDir.includes('s')) h = Math.max(300, s.h + deltaY);
        setSize({ width: w, height: h });
      }
    };
    const handleMU = () => { setIsDragging(false); setIsResizing(false); };
    if (isVisible && (isDragging || isResizing)) { window.addEventListener('mousemove', handleMM); window.addEventListener('mouseup', handleMU); }
    return () => { window.removeEventListener('mousemove', handleMM); window.removeEventListener('mouseup', handleMU); };
  }, [isVisible, isDragging, isResizing, resizeDir]);

  const activeWebview = webviewRefs.current[activeTabIndex];

  return (
    <div
      className={`fixed z-[100] flex-col bg-[#1a1a1a] shadow-2xl border border-gray-700 overflow-hidden ${isMaximized ? '' : 'rounded-xl'}`}
      style={{ display: isVisible ? 'flex' : 'none', top: isMaximized ? 0 : position.y, left: isMaximized ? 0 : position.x, width: isMaximized ? '100%' : size.width, height: isMaximized ? '100%' : size.height }}
    >
      <div onMouseDown={(e) => startResize(e, 'se')} className="absolute bottom-0 right-0 w-4 h-4 z-50 cursor-nwse-resize" />

      <div onMouseDown={startDrag} onDoubleClick={() => setIsMaximized(!isMaximized)} className="bg-[#202020] flex items-center px-4 pt-2 justify-between border-b border-gray-800 cursor-grab active:cursor-grabbing select-none">
        <div className="flex gap-2 pb-2" onMouseDown={e => e.stopPropagation()}>
          <div onClick={onTerminate} className="w-4 h-4 rounded-full bg-red-500 cursor-pointer hover:bg-red-400 flex items-center justify-center" title="Fechar"><X size={10} className="text-red-900" /></div>
          <div onClick={onClose} className="w-4 h-4 rounded-full bg-yellow-500 cursor-pointer hover:bg-yellow-400 flex items-center justify-center" title="Minimizar"><Minus size={10} className="text-yellow-900" /></div>
          <div onClick={() => setIsMaximized(!isMaximized)} className="w-4 h-4 rounded-full bg-green-500 cursor-pointer hover:bg-green-400 flex items-center justify-center" title="Maximizar"><Square size={8} className="text-green-900" /></div>
        </div>

        {/* BARRA DE ABAS - DINÂMICA */}
        <div className="flex-1 flex px-4 overflow-hidden gap-1">
          {tabs.map((url, idx) => (
            <div
              key={idx}
              onClick={() => setActiveTabIndex(idx)}
              className={`px-3 py-1 rounded-t text-[10px] flex items-center gap-2 max-w-[150px] cursor-pointer transition-all ${activeTabIndex === idx ? 'bg-[#333] text-white' : 'bg-black/20 text-gray-500 hover:bg-[#252525]'}`}
            >
              <Globe size={10} className={activeTabIndex === idx ? "text-[#FF6B6B]" : "text-gray-600"} />
              <span className="truncate font-bold">Aba {idx + 1}</span>
            </div>
          ))}
        </div>

        <div className="text-gray-500 text-[10px] font-bold uppercase flex gap-3 items-center pb-2">
          <ShieldCheck size={12} className="text-green-500" /> Multilogin Sidnei - Ferramentas Ilimitadas
        </div>
      </div>

      <div className="h-9 bg-[#333] flex items-center px-3 gap-2 border-b border-gray-700">
        <div className="flex gap-1">
          <button onClick={() => activeWebview?.goBack()} className="text-gray-400 hover:text-white"><ChevronLeft size={16} /></button>
          <button onClick={() => activeWebview?.goForward()} className="text-gray-400 hover:text-white"><ChevronRight size={16} /></button>
          <button onClick={() => activeWebview?.reload()} className="text-gray-400 hover:text-white ml-1"><RefreshCw size={14} className={isLoading ? "animate-spin" : ""} /></button>
        </div>
        <div className="flex-1 bg-[#1a1a1a] rounded h-6 flex items-center px-3 text-xs text-gray-400 border border-gray-700 overflow-hidden select-none">
          <Lock size={10} className="mr-2 text-green-500 flex-shrink-0" />
          <span className="truncate font-black uppercase tracking-tighter text-[9px]">Sessão Criptografada — {profile.name} — Aba {activeTabIndex + 1}</span>
        </div>

        <div className="flex gap-1">
          {/* ∞ BOTÃO FILTRAR ILIMITADO */}
          <button
            onClick={toggleFilterUnlimited}
            className={`p-1.5 rounded text-xs font-black transition-all ${
              filterUnlimitedActive
                ? 'text-yellow-300 bg-yellow-900/30 ring-1 ring-yellow-500'
                : 'text-gray-400 hover:text-yellow-300 hover:bg-yellow-900/20'
            }`}
            title={filterUnlimitedActive ? 'Remover Filtro (mostra tudo)' : 'Mostrar só Ilimitados'}
          >
            ∞
          </button>

          {/* 🔍 BOTÃO DE PESQUISA */}
          <button
            onClick={() => { setShowSearchBar(!showSearchBar); if (!showSearchBar) setTimeout(() => searchInputRef.current?.focus(), 100); }}
            className={`p-1.5 rounded ${showSearchBar ? 'text-cyan-400 bg-cyan-900/20' : 'text-gray-400 hover:text-white'}`}
            title="Pesquisar (Ctrl+F)"
          >
            <Search size={16} />
          </button>
          {profile.discordToken && (
            <button onClick={() => executeDiscordTokenLogin(activeWebview)} className="p-1.5 rounded text-red-400 hover:bg-red-900/20 transition-all" title="Login Discord">
              <MessageCircle size={16} />
            </button>
          )}
          {profile.automationScript && (
            <button onClick={() => runCustomAutomation(activeWebview)} className="p-1.5 rounded text-green-400 hover:bg-green-900/20 transition-all" title="Executar Script">
              <PlayCircle size={16} />
            </button>
          )}
          {profile.videoTutorial && profile.videoTutorial.trim() !== '' && (
            <button
              onClick={() => {
                let url = profile.videoTutorial!.trim();
                if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
                const api = (window as any).nebulaAPI;
                if (api?.openExternalUrl) api.openExternalUrl(url).catch(() => window.open(url, '_blank'));
                else if (api?.openExternal) api.openExternal(url).catch(() => window.open(url, '_blank'));
                else window.open(url, '_blank');
              }}
              className="p-1.5 rounded text-[#a78bfa] hover:text-white hover:bg-purple-900/20 transition-all flex items-center gap-1"
              title="Ver Instruções / Tutorial"
            >
              <HelpCircle size={16} />
            </button>
          )}
          <button onClick={() => performCloudSync(true)} disabled={isSyncing} className={`p-1.5 rounded ${isSyncing ? 'text-[#FF6B6B]' : 'text-gray-400 hover:text-white'}`} title="Sincronizar Nuvem">
            <UploadCloud size={16} className={isSyncing ? 'animate-bounce' : ''} />
          </button>
          
          <button
            onClick={handleClearGoogleSession}
            className="p-1.5 rounded text-amber-400 hover:text-amber-300 hover:bg-amber-900/20 transition-all flex items-center gap-1"
            title="Destravar / Limpar Sessão Google (se travar em 'Navegador não seguro')"
          >
            <ShieldAlert size={16} />
          </button>
          <button onClick={() => setAutoFillEnabled(!autoFillEnabled)} className={`p-1.5 rounded ${autoFillEnabled ? 'text-green-500 bg-green-900/10' : 'text-gray-500'}`} title="Auto-Preenchimento"><Key size={16} /></button>
        </div>
      </div>

      {/* 🔍 BARRA DE PESQUISA */}
      {showSearchBar && (
        <div className="h-10 bg-[#252525] flex items-center px-3 gap-2 border-b border-gray-700 animate-fade-in">
          <Search size={14} className="text-gray-500" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); handleSearch(e.target.value); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.shiftKey ? handleSearchPrev() : handleSearchNext(); } }}
            placeholder="Pesquisar na página..."
            className="flex-1 bg-[#1a1a1a] border border-gray-700 rounded px-3 py-1 text-sm text-white outline-none focus:border-cyan-500"
          />
          <span className="text-[10px] text-gray-500 font-bold min-w-[60px]">
            {searchResults.matches > 0 ? `${searchResults.activeMatchOrdinal}/${searchResults.matches}` : 'Sem resultados'}
          </span>
          <button onClick={handleSearchPrev} className="p-1 text-gray-400 hover:text-white" title="Anterior (Shift+Enter)">
            <ChevronUp size={14} />
          </button>
          <button onClick={handleSearchNext} className="p-1 text-gray-400 hover:text-white" title="Próximo (Enter)">
            <ChevronDown size={14} />
          </button>
          <button onClick={closeSearch} className="p-1 text-gray-400 hover:text-[#FF6B6B]" title="Fechar (Esc)">
            <X size={14} />
          </button>
        </div>
      )}

      {/* BARRA DE PROGRESSO DE DOWNLOAD */}
      {download && (
        <div className="bg-[#252525] border-b border-gray-700 px-4 py-2 flex items-center gap-4 animate-fade-in">
          <div className="p-1.5 bg-blue-600/20 rounded-lg text-blue-400">
            {download.state === 'downloading' ? <Download size={14} className="animate-bounce" /> : download.state === 'success' ? <CheckCircle size={14} className="text-green-500" /> : <AlertCircle size={14} className="text-[#E50914]" />}
          </div>
          <div className="flex-1">
            <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-gray-400 mb-1">
              <span className="truncate max-w-[200px]">{download.fileName}</span>
              <span>{download.state === 'downloading' ? `${download.progress}%` : download.state.toUpperCase()}</span>
            </div>
            <div className="h-1.5 w-full bg-gray-800 rounded-full overflow-hidden">
              <div className={`h-full transition-all duration-300 ${download.state === 'success' ? 'bg-green-500' : download.state === 'error' ? 'bg-[#E50914]' : 'bg-blue-500'}`} style={{ width: `${download.progress}%` }} />
            </div>
          </div>
          <button onClick={() => setDownload(null)} className="text-gray-600 hover:text-white"><X size={14} /></button>
        </div>
      )}

      <div className="flex-1 relative bg-white">
        {isReadyToNavigate && !isRestoringSession && (!window.nebulaAPI || !!webviewPreloadUrl) ? (
          tabs.map((url, idx) => (
            <webview
              key={idx}
              ref={el => { webviewRefs.current[idx] = el; }}
              src={url}
              partition={"persist:" + profile.id}
              // @ts-ignore
              allowpopups="true"
              useragent={COMPATIBLE_USER_AGENT}
              // @ts-ignore
              preload={webviewPreloadUrl || undefined}
              webpreferences="contextIsolation=yes, nodeIntegration=no, webSecurity=yes, spellcheck=yes, plugins=yes, javascript=yes, allowRunningInsecureContent=no, experimentalFeatures=no"
              style={{ width: '100%', height: '100%', display: activeTabIndex === idx ? 'flex' : 'none' }}
            />
          ))
        ) : (
          <div className="absolute inset-0 bg-[#0f0f0f] flex flex-col items-center justify-center gap-6">
            <Database className="w-16 h-16 text-[#E50914] animate-pulse" />
            <h3 className="text-[#FF6B6B] font-black tracking-widest uppercase text-sm">Blindando Navegador...</h3>
          </div>
        )}
        {isLoading && !isRestoringSession && (
          <div className="absolute inset-0 bg-black/10 backdrop-blur-[1px] flex items-center justify-center pointer-events-none z-10">
            <RefreshCw className="w-8 h-8 text-[#E50914] animate-spin" />
          </div>
        )}
      </div>
    </div>
  );
};
