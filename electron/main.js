const { app, BrowserWindow, ipcMain, session, Menu, shell, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const { spawn } = require('child_process');
const proxyChain = require('proxy-chain');
const AdmZip = require('adm-zip');

const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
// Inicializa o plugin stealth padrão
puppeteer.use(StealthPlugin());

// Aumenta o limite de listeners para evitar avisos em perfis com muitas abas
process.setMaxListeners(0);

// 🔥 CORREÇÃO: Remover AutomationControlled global que causa barra amarela
if (app && app.commandLine) {
    app.commandLine.appendSwitch('no-sandbox');
    // AutomationControlled removido daqui para evitar o alerta do Chrome
}

const SYNC_PORT = 19999;
let mainWindow;
const GLOBAL_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36";


// 🔥 ARMAZENA PROXIES ANÔNIMOS ATIVOS PARA LIMPEZA
const activeProxies = new Map();

// 🔥 ARMAZENA PROCESSOS CHROME NATIVOS ATIVOS
const activeNativeProcesses = new Map();

// 🔥 ARMAZENA JANELAS OVERLAY DE BOTÕES FLUTUANTES
const floatingButtonWindows = new Map();

// 🔥 ARMAZENA INSTÂNCIAS PUPPETEER PARA CONTROLE DOS BOTÕES FLUTUANTES
const activePuppeteerInstances = new Map(); // { profileId: { browser, page } }

// 🔌 CAMINHO DAS EXTENSÕES EMBUTIDAS
function getExtensionsPath() {
    // Tenta encontrar a pasta de extensões em diferentes locais
    const possiblePaths = [
        path.join(app.getAppPath(), 'extensions'),
        path.join(process.cwd(), 'extensions'),
        path.join(path.dirname(app.getPath('exe')), 'extensions'),
        path.join(__dirname, '..', 'extensions')
    ];

    for (const extPath of possiblePaths) {
        if (fs.existsSync(extPath)) {
            console.log(`📦 [EXTENSÕES] Pasta encontrada: ${extPath}`);
            return extPath;
        }
    }
    console.log(`⚠️ [EXTENSÕES] Pasta de extensões não encontrada`);
    return null;
}

// 🔌 FUNÇÃO PARA LISTAR TODAS AS EXTENSÕES A SEREM CARREGADAS
function getExtensionsList() {
    const allExtensions = [];

    // 1. Extensões embutidas (pasta extensions/ do projeto)
    const extensionsDir = getExtensionsPath();
    console.log(`🔌 [EXT-SCAN] Pasta embutida: ${extensionsDir || 'NÃO ENCONTRADA'}`);
    if (extensionsDir) {
        try {
            const subdirs = fs.readdirSync(extensionsDir);
            for (const subdir of subdirs) {
                const extFullPath = path.join(extensionsDir, subdir);
                const manifestPath = path.join(extFullPath, 'manifest.json');
                if (fs.statSync(extFullPath).isDirectory() && fs.existsSync(manifestPath)) {
                    allExtensions.push(extFullPath);
                    console.log(`🔌 [EXTENSÃO EMBUTIDA] Encontrada: ${subdir}`);
                }
            }
        } catch (e) {
            console.error(`❌ [EXTENSÕES] Erro ao listar extensões embutidas:`, e.message);
        }
    }

    // 2. Extensões do usuário (pasta user-extensions/ no userData) — somente as ATIVADAS
    const userExtDir = getUserExtensionsPath();
    const config = getExtensionsConfig();
    console.log(`🔌 [EXT-SCAN] Pasta do usuário: ${userExtDir}`);
    console.log(`🔌 [EXT-SCAN] Config: ${JSON.stringify(config)}`);
    try {
        const subdirs = fs.readdirSync(userExtDir);
        for (const subdir of subdirs) {
            if (subdir === 'extensions-config.json') continue; // pula o config
            const extFullPath = path.join(userExtDir, subdir);
            const manifestPath = path.join(extFullPath, 'manifest.json');
            const isDir = fs.statSync(extFullPath).isDirectory();
            const hasManifest = fs.existsSync(manifestPath);
            console.log(`🔌 [EXT-SCAN] ${subdir}: isDir=${isDir}, hasManifest=${hasManifest}`);
            if (isDir && hasManifest) {
                // Verifica se está ativada (padrão: ativada)
                const isEnabled = config[subdir]?.enabled !== false;
                if (isEnabled) {
                    allExtensions.push(extFullPath);
                    console.log(`🔌 [EXTENSÃO USUÁRIO] Carregando: ${subdir} -> ${extFullPath}`);
                } else {
                    console.log(`⏸️ [EXTENSÃO USUÁRIO] Desativada: ${subdir}`);
                }
            }
        }
    } catch (e) {
        console.log(`⚠️ [EXTENSÕES] Pasta user-extensions não existe ainda: ${e.message}`);
    }

    // 🔍 VERIFICAÇÃO FINAL: Confirma que cada caminho existe de verdade
    const verified = allExtensions.filter(p => {
        const exists = fs.existsSync(p);
        if (!exists) console.error(`❌ [EXT-VERIFY] Caminho NÃO existe: ${p}`);
        return exists;
    });

    console.log(`🔌 [EXT-RESULTADO] Total: ${verified.length} extensão(ões) verificada(s)`);
    verified.forEach(p => console.log(`  ✅ ${p}`));

    // 🛡️ WINDOWS: Cria junctions (symlinks) para caminhos com espaços
    // Chrome no Windows pode falhar com --load-extension quando o caminho tem espaços
    if (process.platform === 'win32') {
        const os = require('os');
        const tempBase = path.join(os.tmpdir(), 'nebula_extensions');
        if (!fs.existsSync(tempBase)) fs.mkdirSync(tempBase, { recursive: true });

        const finalPaths = verified.map((p, idx) => {
            if (!p.includes(' ')) return p; // Caminho sem espaços -> OK

            // Cria um junction sem espaços apontando para a extensão
            const junctionName = `ext_${idx}_${path.basename(p).replace(/[^a-zA-Z0-9_-]/g, '')}`;
            const junctionPath = path.join(tempBase, junctionName);

            try {
                // Remove junction antiga se existir
                if (fs.existsSync(junctionPath)) {
                    try { fs.unlinkSync(junctionPath); } catch (e) {
                        try { fs.rmSync(junctionPath, { recursive: true, force: true }); } catch (e2) { }
                    }
                }
                // Cria junction (não precisa de admin no Windows)
                fs.symlinkSync(p, junctionPath, 'junction');
                console.log(`🔗 [JUNCTION] ${p} -> ${junctionPath}`);
                return junctionPath;
            } catch (e) {
                console.warn(`⚠️ [JUNCTION] Falha ao criar junction: ${e.message}`);
                return p; // fallback ao caminho original
            }
        });
        return finalPaths;
    }

    return verified;
}

// 🔌 CAMINHO DAS EXTENSÕES DO USUÁRIO
function getUserExtensionsPath() {
    const userExtDir = path.join(app.getPath('userData'), 'user-extensions');
    if (!fs.existsSync(userExtDir)) {
        fs.mkdirSync(userExtDir, { recursive: true });
    }
    return userExtDir;
}

// 🔌 LER CONFIGURAÇÃO DE EXTENSÕES (ativado/desativado)
function getExtensionsConfig() {
    const configPath = path.join(getUserExtensionsPath(), 'extensions-config.json');
    try {
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } catch (e) {
        console.error('❌ Erro ao ler config de extensões:', e.message);
    }
    return {};
}

// 🔌 SALVAR CONFIGURAÇÃO DE EXTENSÕES
function saveExtensionsConfig(config) {
    const configPath = path.join(getUserExtensionsPath(), 'extensions-config.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
}

// 🔌 EXTRAIR METADADOS DE UMA EXTENSÃO (manifest.json)
function getExtensionMeta(extDir, folderName, type) {
    const manifestPath = path.join(extDir, 'manifest.json');
    try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        // Tenta pegar o ícone da extensão
        let iconPath = null;
        if (manifest.icons) {
            const sizes = ['128', '64', '48', '32', '16'];
            for (const size of sizes) {
                if (manifest.icons[size]) {
                    const fullIconPath = path.join(extDir, manifest.icons[size]);
                    if (fs.existsSync(fullIconPath)) {
                        // Converte para base64 para enviar ao frontend
                        const iconBuffer = fs.readFileSync(fullIconPath);
                        const ext = path.extname(manifest.icons[size]).substring(1) || 'png';
                        iconPath = `data:image/${ext};base64,${iconBuffer.toString('base64')}`;
                        break;
                    }
                }
            }
        }

        const config = getExtensionsConfig();
        const isEnabled = type === 'builtin' ? true : (config[folderName]?.enabled !== false);

        return {
            id: folderName,
            name: manifest.name || folderName,
            version: manifest.version || '1.0.0',
            description: manifest.description || '',
            icon: iconPath,
            type: type, // 'builtin' ou 'user'
            enabled: isEnabled,
            manifestVersion: manifest.manifest_version || 2
        };
    } catch (e) {
        return {
            id: folderName,
            name: folderName,
            version: '?',
            description: 'Erro ao ler manifest',
            icon: null,
            type: type,
            enabled: false,
            manifestVersion: 2
        };
    }
}

// 🍎🪟🐧 FUNÇÃO PARA ENCONTRAR O CHROME EM QUALQUER SISTEMA OPERACIONAL
function findChromePath(customBrowserPath) {
    // Se foi passado um caminho customizado e ele existe, usa
    if (customBrowserPath && fs.existsSync(customBrowserPath)) {
        console.log(`✅ [CHROME] Usando caminho customizado: ${customBrowserPath}`);
        return customBrowserPath;
    }

    const platform = process.platform;
    let possiblePaths = [];

    if (platform === 'win32') {
        // Windows
        possiblePaths = [
            path.join(process.cwd(), 'browser', 'chrome.exe'),
            path.join(app.getAppPath(), 'browser', 'chrome.exe'),
            path.join(path.dirname(app.getPath('exe')), 'browser', 'chrome.exe'),
            'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
            'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
            process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe') : null,
        ];
    } else if (platform === 'darwin') {
        // macOS
        possiblePaths = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            path.join(process.env.HOME || '', 'Applications', 'Google Chrome.app', 'Contents', 'MacOS', 'Google Chrome'),
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            path.join(process.cwd(), 'browser', 'Google Chrome'),
            path.join(app.getAppPath(), 'browser', 'Google Chrome'),
        ];
    } else {
        // Linux
        possiblePaths = [
            '/usr/bin/google-chrome',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/chromium',
            '/usr/bin/chromium-browser',
            '/snap/bin/chromium',
            path.join(process.cwd(), 'browser', 'chrome'),
        ];
    }

    // Filtra paths nulos e encontra o primeiro que existe
    const validPaths = possiblePaths.filter(Boolean);
    const chromePath = validPaths.find(p => fs.existsSync(p));

    if (chromePath) {
        console.log(`✅ [CHROME] Encontrado em: ${chromePath}`);
        return chromePath;
    }

    console.error(`❌ [CHROME] Chrome não encontrado! Caminhos verificados:`, validPaths);
    return null;
}

// 🔥 FUNÇÃO PARA CRIAR BOTÕES FLUTUANTES SOBRE O CHROME PUPPETEER
function createFloatingButtons(profileId) {
    // Se já existe uma janela para este perfil, fecha
    if (floatingButtonWindows.has(profileId)) {
        try {
            floatingButtonWindows.get(profileId).close();
        } catch (e) { }
    }

    const floatingWin = new BrowserWindow({
        width: 220,
        height: 60,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        x: Math.floor((require('electron').screen.getPrimaryDisplay().workAreaSize.width - 220) / 2),
        y: require('electron').screen.getPrimaryDisplay().workAreaSize.height - 100,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    // HTML inline para os botões flutuantes
    const buttonsHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body {
                background: transparent;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                overflow: hidden;
            }
            .container {
                display: flex;
                align-items: center;
                gap: 8px;
                padding: 10px 16px;
                background: rgba(30, 30, 40, 0.95);
                border-radius: 30px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
                border: 1px solid rgba(255, 255, 255, 0.1);
                -webkit-app-region: drag; /* TODA A BARRA É ARRASTÁVEL */
                cursor: grab;
            }
            .container:active { cursor: grabbing; }
            .drag-handle {
                color: rgba(255, 255, 255, 0.3);
                margin-right: 4px;
                font-size: 14px;
                user-select: none;
            }
            button {
                width: 40px;
                height: 40px;
                border: none;
                border-radius: 50%;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 18px;
                transition: all 0.2s;
                color: white;
                -webkit-app-region: no-drag; /* BOTÕES PRECISAM DE NO-DRAG PARA SEREM CLICÁVEIS */
            }
            button:hover { transform: scale(1.1); filter: brightness(1.2); }
            .back { background: linear-gradient(135deg, #6366f1, #8b5cf6); }
            .forward { background: linear-gradient(135deg, #6366f1, #8b5cf6); }
            .reload { background: linear-gradient(135deg, #10b981, #059669); }
            .close { background: linear-gradient(135deg, #ef4444, #dc2626); }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="drag-handle">⠿</div>
            <button class="back" onclick="sendAction('back')" title="Voltar">←</button>
            <button class="forward" onclick="sendAction('forward')" title="Avançar">→</button>
            <button class="reload" onclick="sendAction('reload')" title="Recarregar">↻</button>
            <button class="close" onclick="sendAction('close')" title="Fechar">✕</button>
        </div>
        <script>
            const { ipcRenderer } = require('electron');
            function sendAction(action) {
                ipcRenderer.send('floating-button-action', { action, profileId: '${profileId}' });
            }
        </script>
    </body>
    </html>`;

    floatingWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(buttonsHtml)}`);

    floatingButtonWindows.set(profileId, floatingWin);

    // Monitora o browser Puppeteer - fecha overlay quando browser fechar
    const checkBrowserInterval = setInterval(async () => {
        const instance = activePuppeteerInstances.get(profileId);
        if (!instance || !instance.browser) {
            clearInterval(checkBrowserInterval);
            if (floatingButtonWindows.has(profileId)) {
                try {
                    floatingButtonWindows.get(profileId).close();
                } catch (closeErr) { }
                floatingButtonWindows.delete(profileId);
            }
            return;
        }

        // Verifica se o browser ainda está conectado
        if (!instance.browser.isConnected()) {
            clearInterval(checkBrowserInterval);
            activePuppeteerInstances.delete(profileId);
            if (floatingButtonWindows.has(profileId)) {
                try {
                    floatingButtonWindows.get(profileId).close();
                } catch (closeErr) { }
                floatingButtonWindows.delete(profileId);
            }
        }
    }, 1000);

    floatingWin.on('closed', () => {
        clearInterval(checkBrowserInterval);
        floatingButtonWindows.delete(profileId);
    });

    console.log(`🎛️ [OVERLAY] Botões flutuantes criados para perfil: ${profileId}`);
}

// 🔥 FUNÇÃO DE PROTEÇÃO PARA SER INJETADA NO NAVEGADOR
async function injectProtection(targetPage) {
    try {
        // 1. Injeta script que roda ANTES de qualquer outro script da página
        await targetPage.evaluateOnNewDocument(() => {
            // 🔒 BLOQUEIA ATALHOS DE DEVTOOLS
            window.addEventListener('keydown', function (e) {
                if (e.key === 'F12' ||
                    (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'J' || e.key === 'C')) ||
                    (e.ctrlKey && e.key === 'U') ||
                    (e.metaKey && e.altKey && e.key === 'i')) {
                    e.preventDefault(); e.stopPropagation(); return false;
                }
            }, true);

            // 🖱️ MENU DE CONTEXTO PERSONALIZADO (sem "Inspecionar")
            window.addEventListener('contextmenu', function (e) {
                e.preventDefault(); e.stopPropagation();
                // Salva texto selecionado ANTES do menu (clicar no menu deseleciona)
                var savedSel = getSelection().toString();
                var savedEl = document.activeElement;
                var old = document.getElementById('__cctx'); if (old) old.remove();
                var m = document.createElement('div'); m.id = '__cctx';
                m.style.cssText = 'position:fixed;z-index:2147483647;background:#2d2d2d;border:1px solid #555;border-radius:8px;padding:4px 0;min-width:200px;box-shadow:0 8px 32px rgba(0,0,0,.5);font:13px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;color:#e0e0e0;left:' + Math.min(e.clientX, innerWidth - 220) + 'px;top:' + Math.min(e.clientY, innerHeight - 280) + 'px';
                var items = [{ l: '← Voltar', f: function () { history.back() } }, { l: '→ Avançar', f: function () { history.forward() } }, { l: '↻ Recarregar', f: function () { location.reload() }, k: 'Ctrl+R' }, { s: 1 }, { l: '📋 Copiar', f: function () { if (savedSel) navigator.clipboard.writeText(savedSel).catch(function () { }) }, k: 'Ctrl+C' }, { l: '📌 Colar', f: function () { navigator.clipboard.readText().then(function (t) { if (savedEl && (savedEl.tagName === 'INPUT' || savedEl.tagName === 'TEXTAREA' || savedEl.isContentEditable)) { savedEl.focus(); document.execCommand('insertText', false, t) } }).catch(function () { }) }, k: 'Ctrl+V' }, { l: '✂ Recortar', f: function () { if (savedSel) { navigator.clipboard.writeText(savedSel).catch(function () { }); if (savedEl) document.execCommand('delete') } }, k: 'Ctrl+X' }, { s: 1 }, { l: '🔍 Pesquisar no Google', f: function () { if (savedSel) location.href = 'https://google.com/search?q=' + encodeURIComponent(savedSel) } }, { l: '🖨 Imprimir...', f: function () { print() }, k: 'Ctrl+P' }];
                items.forEach(function (it) {
                    if (it.s) { var s = document.createElement('div'); s.style.cssText = 'height:1px;background:#444;margin:4px 0'; m.appendChild(s); return }
                    var r = document.createElement('div'); r.style.cssText = 'padding:6px 16px;cursor:pointer;display:flex;justify-content:space-between;align-items:center';
                    r.innerHTML = '<span>' + it.l + '</span>' + (it.k ? '<span style="color:#888;font-size:11px;margin-left:24px">' + it.k + '</span>' : '');
                    r.onmouseenter = function () { this.style.background = '#3a3a3a' }; r.onmouseleave = function () { this.style.background = 'transparent' };
                    r.onclick = function () { m.remove(); it.f() }; m.appendChild(r);
                });
                document.body.appendChild(m);
                var cl = function (ev) { if (!m.contains(ev.target)) { m.remove(); document.removeEventListener('click', cl, true) } };
                setTimeout(function () { document.addEventListener('click', cl, true) }, 10);
            }, true);

            // 🔒 INTERCEPTA POPUPS: Navega na mesma janela
            var _wo = window.open;
            window.open = function (u, t, f) {
                if (u && u !== 'about:blank' && u !== '' && !u.startsWith('javascript:')) { location.href = u; return window; }
                return _wo.call(window, u, t, f);
            };
            document.addEventListener('click', function (e) {
                var a = e.target.closest ? e.target.closest('a[target="_blank"]') : null;
                if (a && a.href && !a.href.startsWith('javascript:')) { e.preventDefault(); e.stopPropagation(); location.href = a.href; }
            }, true);

            // Esconde botões de revelar senha em sites de login
            var st = document.createElement('style');
            st.innerHTML = '[class*="toggle-password"],[class*="show-password"],[class*="password-toggle"],[class*="reveal-password"],[class*="pwd-toggle"],[type="password"]+button,[type="password"]+span,[type="password"]+div>button,[class*="eye"]:not(input){display:none!important;visibility:hidden!important;pointer-events:none!important}';
            if (document.head) document.head.appendChild(st); else document.addEventListener('DOMContentLoaded', function () { document.head.appendChild(st); });

            // Anti-Debugger
            setInterval(function () { (function () { (function a() { try { (function b(i) { if (('' + i / i).length !== 1 || i % 20 === 0) (function () { }).constructor('debugger')(); else debugger; b(++i) })(0) } catch (e) { setTimeout(a, 50) } })() })() }, 1000);
        });
    } catch (e) {
        console.error("Erro ao injetar proteção:", e.message);
    }
}

function registerIPCHandlers() {
    // ========== MODO NATIVO COM PRÉ-LOGIN SILENCIOSO (DRM + OCULTA SENHA) ==========
    // 1. Puppeteer HEADLESS faz login automático (invisível)
    // 2. Salva cookies no perfil
    // 3. Chrome NATIVO abre já logado (com DRM funcionando!)
    ipcMain.handle('launch-profile-native', async (event, profile, customBrowserPath) => {
        try {
            const userDataDir = path.join(app.getPath('userData'), 'profiles', profile.id);
            if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

            // 🔒 DESABILITA O GERENCIADOR DE SENHAS NO PERFIL
            const defaultDir = path.join(userDataDir, 'Default');
            if (!fs.existsSync(defaultDir)) fs.mkdirSync(defaultDir, { recursive: true });

            const prefsPath = path.join(defaultDir, 'Preferences');
            let prefs = {};
            if (fs.existsSync(prefsPath)) {
                try { prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8')); } catch (e) { }
            }

            prefs.credentials_enable_service = false;
            prefs.credentials_enable_autosignin = false;
            if (!prefs.profile) prefs.profile = {};
            prefs.profile.password_manager_enabled = false;
            prefs.profile.password_manager_leak_detection = false;
            if (!prefs.password_manager) prefs.password_manager = {};
            prefs.password_manager.credentials_enable_service = false;
            prefs.password_manager.save_password_bubble_opt_in = false;
            prefs.password_manager.saving_passwords_enabled = false;
            prefs.password_manager.profile_store_date_last_used_for_filling = 0;
            // Desabilita autofill também
            if (!prefs.autofill) prefs.autofill = {};
            prefs.autofill.credit_card_enabled = false;
            prefs.autofill.profile_enabled = false;

            // 🧩 HABILITA DEVELOPER MODE para que --load-extension funcione
            // Chrome moderno ignora silenciosamente extensões sem isso
            if (profile.enableExtensions) {
                if (!prefs.extensions) prefs.extensions = {};
                if (!prefs.extensions.ui) prefs.extensions.ui = {};
                prefs.extensions.ui.developer_mode = true;
                console.log(`🧩 [PREFS] Developer Mode habilitado no perfil para extensões`);
            }

            fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));

            // 🔐 SEMPRE deleta Secure Preferences para forçar Chrome a aceitar nossas mudanças
            // Chrome valida prefs com hash no Secure Preferences - se não bater, REVERTE tudo!
            const securePrefsPath = path.join(defaultDir, 'Secure Preferences');
            if (fs.existsSync(securePrefsPath)) {
                try { fs.unlinkSync(securePrefsPath); console.log(`🗑️ [PREFS] Secure Preferences removido para forçar aceitação`); } catch (e) { }
            }

            // 🔒 WINDOWS REGISTRY: Desabilita Password Manager via Policy
            // IMPORTANTE: NÃO usar DeveloperToolsAvailability aqui! Ele desabilita o DevTools Protocol
            // que o Puppeteer precisa para controlar o Chrome, quebrando TUDO.
            if (process.platform === 'win32') {
                try {
                    const { execSync } = require('child_process');
                    const regPath = 'HKCU\\Software\\Policies\\Google\\Chrome';
                    execSync(`reg add "${regPath}" /v PasswordManagerEnabled /t REG_DWORD /d 0 /f`, { stdio: 'ignore' });
                    execSync(`reg add "${regPath}" /v AutofillCreditCardEnabled /t REG_DWORD /d 0 /f`, { stdio: 'ignore' });
                    execSync(`reg add "${regPath}" /v AutofillAddressEnabled /t REG_DWORD /d 0 /f`, { stdio: 'ignore' });
                    // 🔧 CLEANUP: Remove DeveloperToolsAvailability que pode ter sido criado antes
                    execSync(`reg delete "${regPath}" /v DeveloperToolsAvailability /f`, { stdio: 'ignore' });
                    console.log(`🔒 [REGISTRY] Policies do Chrome aplicadas via Registro do Windows`);
                } catch (regErr) {
                    console.warn(`⚠️ [REGISTRY] Erro ao definir policies:`, regErr.message);
                }
            }

            // 🔒 CHROME ENTERPRISE POLICY (LINUX/MAC): Desabilita DevTools completamente
            // Isso remove "Inspecionar" do menu de contexto, bloqueia F12, e Ctrl+Shift+I
            // DeveloperToolsAvailability: 0 = permitido, 1 = permitido em extensões, 2 = desabilitado
            if (!profile.enableExtensions) {
                try {
                    // Método 1: Via Managed Preferences (funciona no Chromium)
                    const policiesDir = path.join(userDataDir, 'policies');
                    if (!fs.existsSync(policiesDir)) fs.mkdirSync(policiesDir, { recursive: true });
                    const managedDir = path.join(policiesDir, 'managed');
                    if (!fs.existsSync(managedDir)) fs.mkdirSync(managedDir, { recursive: true });
                    fs.writeFileSync(path.join(managedDir, 'policy.json'), JSON.stringify({
                        DeveloperToolsAvailability: 2,
                        PasswordManagerEnabled: false,
                        AutofillCreditCardEnabled: false,
                        AutofillAddressEnabled: false
                    }, null, 2));

                    // Método 2: Via Master Preferences
                    const masterPrefsPath = path.join(userDataDir, 'master_preferences');
                    fs.writeFileSync(masterPrefsPath, JSON.stringify({
                        policies: { DeveloperToolsAvailability: 2 }
                    }, null, 2));

                    // Método 3: Direto no Preferences do perfil
                    prefs.devtools = { disabled: true };
                    fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));

                    console.log(`🔒 [POLICY] DevTools desabilitado via Chrome Enterprise Policy`);
                } catch (policyErr) {
                    console.warn(`⚠️ [POLICY] Erro ao definir policy:`, policyErr.message);
                }
            }

            // 🍎🪟🐧 Encontra o Chrome usando função multiplataforma
            const executablePath = findChromePath(customBrowserPath);
            if (!executablePath) {
                throw new Error('Chrome não encontrado! Instale o Google Chrome ou configure o caminho nas configurações.');
            }

            const targetUrls = (profile.urls && profile.urls.length > 0) ? profile.urls : ['https://google.com'];

            // 🔥 PROXY-CHAIN: Cria proxy local anônimo para proxies autenticados
            let proxyUrl = null;
            if (profile.proxy) {
                try {
                    if (activeProxies.has(profile.id)) {
                        await proxyChain.closeAnonymizedProxy(activeProxies.get(profile.id), true);
                    }
                    console.log(`🔄 [NATIVO] Criando proxy anônimo para: ${profile.proxy}`);
                    const anonymizedProxy = await proxyChain.anonymizeProxy(profile.proxy);
                    proxyUrl = anonymizedProxy;
                    activeProxies.set(profile.id, anonymizedProxy);
                    console.log(`✅ [NATIVO] Proxy anônimo criado: ${anonymizedProxy}`);
                } catch (proxyErr) {
                    console.error(`❌ Erro ao criar proxy anônimo:`, proxyErr);
                    proxyUrl = profile.proxy;
                }
            }

            // 🔐 PRÉ-LOGIN SILENCIOSO: Se tiver email e senha, faz login headless primeiro
            // 🚫 SITES QUE USAM APENAS OAUTH (não tem campo de email/senha)
            const oauthOnlySites = [
                'suno.com', 'suno.ai',           // Suno - só OAuth
                'reddit.com',                     // Reddit - só OAuth
                'spotify.com',                    // Spotify - OAuth ou app
                'github.com',                     // GitHub - OAuth disponível
                'discord.com',                    // Discord - token/OAuth
                'twitch.tv',                      // Twitch - OAuth
                'google.com', 'youtube.com',      // Google - OAuth nativo
                'accounts.google.com',            // Google OAuth
                'microsoft.com', 'live.com',      // Microsoft - OAuth
                'apple.com',                      // Apple - OAuth
                'twitter.com', 'x.com',           // Twitter/X - OAuth
                'facebook.com',                   // Facebook - OAuth
                'instagram.com',                  // Instagram - OAuth
                'tiktok.com',                     // TikTok - OAuth
                'linkedin.com',                   // LinkedIn - OAuth
                'pinterest.com',                  // Pinterest - OAuth
                'notion.so',                      // Notion - OAuth
                'figma.com',                      // Figma - OAuth
                'canva.com',                      // Canva - OAuth
                'openai.com', 'chat.openai.com',  // OpenAI/ChatGPT - OAuth
                'claude.ai', 'anthropic.com',     // Claude - OAuth
                'midjourney.com',                 // Midjourney - Discord OAuth
                'heygen.com', 'app.heygen.com',   // HeyGen - OAuth (Google/Apple/SSO/Email)
                // 🔥 SITES COM PROTEÇÃO ANTI-BOT AVANÇADA (pulam pré-login)
                'dankicode.com', 'cursos.dankicode.com',  // DankiCode - Anti-bot
            ];

            const targetUrlLower = targetUrls[0].toLowerCase();
            const isOAuthOnlySite = oauthOnlySites.some(site => targetUrlLower.includes(site));

            if (isOAuthOnlySite) {
                console.log(`🔓 [NATIVO] Site OAuth detectado (${targetUrls[0]})`);
                console.log(`⚠️ [OAUTH] Google bloqueia automação. Abrindo Chrome nativo para login manual...`);
                console.log(`💡 [OAUTH] O usuário faz login UMA VEZ e os cookies são salvos para as próximas vezes.`);

                // Para sites OAuth, pula direto para o Chrome nativo
                // O usuário faz login manualmente UMA VEZ e os cookies são salvos
            }


            if (profile.email && profile.password && !isOAuthOnlySite) {
                console.log(`🔐 [PRÉ-LOGIN] Iniciando login silencioso para: ${profile.email}`);

                let headlessBrowser = null; // Declarado fora do try para poder fechar no catch
                try {
                    headlessBrowser = await puppeteer.launch({
                        executablePath,
                        headless: 'new', // Modo INVISÍVEL
                        userDataDir,
                        defaultViewport: { width: 1280, height: 720 },
                        args: [
                            '--no-first-run',
                            '--disable-infobars',
                            '--disable-notifications',
                            `--user-agent=${GLOBAL_UA}`,
                            // 🔥 PROTEÇÕES ANTI-DETECÇÃO
                            '--disable-blink-features=AutomationControlled',
                            '--disable-features=IsolateOrigins,site-per-process',
                            '--disable-dev-shm-usage',
                            '--disable-accelerated-2d-canvas',
                            '--disable-gpu',
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--disable-web-security',
                            '--allow-running-insecure-content',
                            '--disable-features=TranslateUI',
                            '--lang=pt-BR,pt',
                            proxyUrl ? `--proxy-server=${proxyUrl}` : ''
                        ].filter(Boolean),
                        // 🔥 IGNORA FLAGS DE AUTOMAÇÃO
                        ignoreDefaultArgs: ['--enable-automation']
                    });

                    const page = await headlessBrowser.newPage();

                    // 🔥 SCRIPTS ANTI-DETECÇÃO - executados ANTES de qualquer navegação
                    await page.evaluateOnNewDocument(() => {
                        // Remove webdriver
                        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });

                        // Chrome API falsa
                        window.chrome = {
                            runtime: {},
                            loadTimes: () => ({}),
                            csi: () => ({})
                        };

                        // Remove propriedades de automação
                        delete navigator.__proto__.webdriver;

                        // Plugins falsos
                        Object.defineProperty(navigator, 'plugins', {
                            get: () => [1, 2, 3, 4, 5].map(() => ({
                                name: 'Chrome PDF Plugin',
                                description: 'Portable Document Format',
                                filename: 'internal-pdf-viewer',
                                length: 1
                            }))
                        });

                        // Languages
                        Object.defineProperty(navigator, 'languages', {
                            get: () => ['pt-BR', 'pt', 'en-US', 'en']
                        });

                        // Permissions
                        const originalQuery = window.navigator.permissions.query;
                        window.navigator.permissions.query = (parameters) =>
                            parameters.name === 'notifications'
                                ? Promise.resolve({ state: Notification.permission })
                                : originalQuery(parameters);
                    });

                    // 🎬 DETECTA URLs DE LOGIN PARA STREAMING SERVICES
                    let loginUrl = targetUrls[0];
                    const urlLower = loginUrl.toLowerCase();
                    let isHboMax = false;
                    let isEnvato = false;

                    // HBO Max / Max
                    if (urlLower.includes('max.com') || urlLower.includes('hbomax.com')) {
                        loginUrl = 'https://auth.max.com/login';
                        isHboMax = true;
                        console.log(`🎬 [PRÉ-LOGIN] Detectado HBO Max, usando URL: ${loginUrl}`);
                    }
                    // Netflix
                    else if (urlLower.includes('netflix.com')) {
                        loginUrl = 'https://www.netflix.com/login';
                        console.log(`🎬 [PRÉ-LOGIN] Detectado Netflix, usando URL: ${loginUrl}`);
                    }
                    // Disney+
                    else if (urlLower.includes('disneyplus.com')) {
                        loginUrl = 'https://www.disneyplus.com/login';
                        console.log(`🎬 [PRÉ-LOGIN] Detectado Disney+, usando URL: ${loginUrl}`);
                    }
                    // Amazon Prime
                    else if (urlLower.includes('primevideo.com') || urlLower.includes('amazon.com/gp/video')) {
                        loginUrl = 'https://www.amazon.com/ap/signin?openid.pape.max_auth_age=0&openid.return_to=https%3A%2F%2Fwww.primevideo.com';
                        console.log(`🎬 [PRÉ-LOGIN] Detectado Prime Video, usando URL: ${loginUrl}`);
                    }
                    // 🎨 Envato Elements
                    else if (urlLower.includes('envato.com') || urlLower.includes('elements.envato')) {
                        loginUrl = 'https://account.envato.com/sign_in?to=elements';
                        isEnvato = true;
                        console.log(`🎨 [PRÉ-LOGIN] Detectado Envato Elements, usando URL: ${loginUrl}`);
                    }

                    // Navega para a URL de login
                    await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                    console.log(`📄 [PRÉ-LOGIN] Página carregada: ${loginUrl}`);

                    // Aguarda carregamento inicial
                    await new Promise(r => setTimeout(r, 2000));

                    const email = profile.email;
                    const pass = profile.password;

                    // ========== LÓGICA ESPECIAL PARA HBO MAX (LOGIN EM 2 ETAPAS) ==========
                    if (isHboMax) {
                        console.log(`🎬 [PRÉ-LOGIN] Executando fluxo HBO Max em 2 etapas...`);

                        // ETAPA 1: Preenche o email
                        console.log(`📧 [PRÉ-LOGIN] ETAPA 1: Preenchendo email...`);

                        try {
                            // Aguarda qualquer input aparecer na página (HBO Max usa input type="text")
                            await page.waitForSelector('input', { timeout: 10000 });

                            // Tenta múltiplos seletores em ordem de prioridade
                            const emailSelectors = [
                                'input[type="email"]',
                                'input[name="email"]',
                                'input[id*="email"]',
                                'input[autocomplete="email"]',
                                'input[autocomplete="username"]',
                                'input[type="text"]',
                                'input:not([type="hidden"]):not([type="password"])'
                            ];

                            let emailInput = null;
                            for (const selector of emailSelectors) {
                                emailInput = await page.$(selector);
                                if (emailInput) {
                                    console.log(`✅ [PRÉ-LOGIN] Campo encontrado com seletor: ${selector}`);
                                    break;
                                }
                            }

                            if (emailInput) {
                                await emailInput.click();
                                await new Promise(r => setTimeout(r, 300));
                                await emailInput.type(email, { delay: 50 });
                                console.log(`✅ [PRÉ-LOGIN] Email digitado: ${email}`);
                            } else {
                                console.log(`⚠️ [PRÉ-LOGIN] Nenhum campo de input encontrado, tentando via evaluate...`);
                                // Fallback: usa evaluate para encontrar e preencher
                                await page.evaluate((emailValue) => {
                                    const inputs = document.querySelectorAll('input:not([type="hidden"]):not([type="password"])');
                                    if (inputs.length > 0) {
                                        const input = inputs[0];
                                        input.focus();
                                        input.value = emailValue;
                                        input.dispatchEvent(new Event('input', { bubbles: true }));
                                        input.dispatchEvent(new Event('change', { bubbles: true }));
                                    }
                                }, email);
                                console.log(`✅ [PRÉ-LOGIN] Email preenchido via evaluate`);
                            }
                        } catch (e) {
                            console.log(`⚠️ [PRÉ-LOGIN] Erro ao preencher email: ${e.message}`);
                        }

                        await new Promise(r => setTimeout(r, 500));

                        // Clica no botão Continue
                        console.log(`▶️ [PRÉ-LOGIN] Clicando botão Continue...`);

                        try {
                            // Tenta encontrar o botão Continue do HBO Max
                            const continueClicked = await page.evaluate(() => {
                                // Procura por botões com texto Continue
                                const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
                                for (const btn of buttons) {
                                    const text = (btn.textContent || '').toLowerCase().trim();
                                    if (text === 'continue' || text === 'continuar') {
                                        btn.click();
                                        return true;
                                    }
                                }
                                // Fallback: procura submit do form
                                const form = document.querySelector('form');
                                if (form) {
                                    const submitBtn = form.querySelector('button[type="submit"], button');
                                    if (submitBtn) {
                                        submitBtn.click();
                                        return true;
                                    }
                                }
                                return false;
                            });

                            if (continueClicked) {
                                console.log(`✅ [PRÉ-LOGIN] Botão Continue clicado!`);
                            }
                        } catch (e) {
                            console.log(`⚠️ [PRÉ-LOGIN] Erro ao clicar Continue: ${e.message}`);
                        }

                        // Aguarda a transição para a página de senha (crítico!)
                        console.log(`⏳ [PRÉ-LOGIN] Aguardando página de senha carregar...`);
                        await new Promise(r => setTimeout(r, 3000));

                        // Aguarda o campo de senha aparecer
                        try {
                            await page.waitForSelector('input[type="password"]', { timeout: 15000 });
                            console.log(`✅ [PRÉ-LOGIN] Campo de senha detectado!`);
                        } catch (e) {
                            console.log(`⚠️ [PRÉ-LOGIN] Campo de senha não apareceu, tentando continuar...`);
                        }

                        // ETAPA 2: Preenche a senha
                        console.log(`🔑 [PRÉ-LOGIN] ETAPA 2: Preenchendo senha...`);

                        try {
                            const passwordInput = await page.$('input[type="password"]');
                            if (passwordInput) {
                                await passwordInput.click();
                                await passwordInput.type(pass, { delay: 30 });
                                console.log(`✅ [PRÉ-LOGIN] Senha digitada!`);
                            }
                        } catch (e) {
                            console.log(`⚠️ [PRÉ-LOGIN] Erro ao preencher senha: ${e.message}`);
                        }

                        await new Promise(r => setTimeout(r, 500));

                        // Clica no botão Sign In
                        console.log(`🚪 [PRÉ-LOGIN] Clicando botão Sign In...`);

                        try {
                            const signInClicked = await page.evaluate(() => {
                                const buttons = Array.from(document.querySelectorAll('button, [role="button"]'));
                                for (const btn of buttons) {
                                    const text = (btn.textContent || '').toLowerCase().trim();
                                    if (text === 'sign in' || text === 'entrar' || text === 'log in' || text === 'login') {
                                        btn.click();
                                        return true;
                                    }
                                }
                                // Fallback: submit do form
                                const form = document.querySelector('form');
                                if (form) {
                                    const submitBtn = form.querySelector('button[type="submit"], button');
                                    if (submitBtn) {
                                        submitBtn.click();
                                        return true;
                                    }
                                }
                                return false;
                            });

                            if (signInClicked) {
                                console.log(`✅ [PRÉ-LOGIN] Botão Sign In clicado!`);
                            }
                        } catch (e) {
                            console.log(`⚠️ [PRÉ-LOGIN] Erro ao clicar Sign In: ${e.message}`);
                        }

                        // Aguarda o login completar
                        console.log(`⏳ [PRÉ-LOGIN] Aguardando login completar...`);
                        await new Promise(r => setTimeout(r, 8000));

                    } else if (isEnvato) {
                        // ========== LÓGICA ESPECIAL PARA ENVATO ELEMENTS ==========
                        console.log(`🎨 [PRÉ-LOGIN] Executando fluxo Envato Elements...`);

                        // Envato tem email e senha na mesma página
                        try {
                            // Aguarda o formulário carregar
                            await page.waitForSelector('input[type="text"], input[type="email"], input[name="user[login]"]', { timeout: 10000 });
                            console.log(`✅ [PRÉ-LOGIN] Formulário Envato carregado!`);

                            // Preenche o email/username
                            console.log(`📧 [PRÉ-LOGIN] Preenchendo email...`);

                            const emailSelectors = [
                                'input[name="user[login]"]',
                                'input[id="user_login"]',
                                'input[type="email"]',
                                'input[type="text"]'
                            ];

                            let emailInput = null;
                            for (const selector of emailSelectors) {
                                emailInput = await page.$(selector);
                                if (emailInput) {
                                    console.log(`✅ [PRÉ-LOGIN] Campo email encontrado: ${selector}`);
                                    break;
                                }
                            }

                            if (emailInput) {
                                await emailInput.click();
                                await new Promise(r => setTimeout(r, 200));
                                await emailInput.type(email, { delay: 30 });
                                console.log(`✅ [PRÉ-LOGIN] Email digitado`);
                            }

                            await new Promise(r => setTimeout(r, 500));

                            // Preenche a senha
                            console.log(`🔑 [PRÉ-LOGIN] Preenchendo senha...`);

                            const passwordSelectors = [
                                'input[name="user[password]"]',
                                'input[id="user_password"]',
                                'input[type="password"]'
                            ];

                            let passwordInput = null;
                            for (const selector of passwordSelectors) {
                                passwordInput = await page.$(selector);
                                if (passwordInput) {
                                    console.log(`✅ [PRÉ-LOGIN] Campo senha encontrado: ${selector}`);
                                    break;
                                }
                            }

                            if (passwordInput) {
                                await passwordInput.click();
                                await new Promise(r => setTimeout(r, 200));
                                await passwordInput.type(pass, { delay: 30 });
                                console.log(`✅ [PRÉ-LOGIN] Senha digitada`);
                            }

                            await new Promise(r => setTimeout(r, 500));

                            // Clica no botão de login
                            console.log(`🚪 [PRÉ-LOGIN] Clicando botão de login...`);

                            const loginClicked = await page.evaluate(() => {
                                // Tenta encontrar o botão de submit do Envato
                                const submitSelectors = [
                                    'input[type="submit"]',
                                    'button[type="submit"]',
                                    'button[name="commit"]',
                                    'input[name="commit"]'
                                ];

                                for (const selector of submitSelectors) {
                                    const btn = document.querySelector(selector);
                                    if (btn) {
                                        btn.click();
                                        return selector;
                                    }
                                }

                                // Fallback: procura por botões com texto de login
                                const buttons = Array.from(document.querySelectorAll('button, input[type="submit"]'));
                                for (const btn of buttons) {
                                    const text = (btn.textContent || btn.value || '').toLowerCase();
                                    if (text.includes('sign in') || text.includes('log in') ||
                                        text.includes('inicie') || text.includes('entrar') ||
                                        text.includes('sessão')) {
                                        btn.click();
                                        return 'text-match';
                                    }
                                }

                                // Último fallback: submete o form
                                const form = document.querySelector('form');
                                if (form) {
                                    form.submit();
                                    return 'form-submit';
                                }

                                return null;
                            });

                            if (loginClicked) {
                                console.log(`✅ [PRÉ-LOGIN] Botão de login clicado: ${loginClicked}`);
                            } else {
                                console.log(`⚠️ [PRÉ-LOGIN] Botão de login não encontrado, tentando Enter...`);
                                await page.keyboard.press('Enter');
                            }

                            // Aguarda o login processar
                            console.log(`⏳ [PRÉ-LOGIN] Aguardando login completar...`);
                            await new Promise(r => setTimeout(r, 8000));

                        } catch (e) {
                            console.log(`⚠️ [PRÉ-LOGIN] Erro no login Envato: ${e.message}`);
                        }

                    } else {
                        // ========== LÓGICA GENÉRICA PARA OUTROS SITES ==========
                        console.log(`📧 [PRÉ-LOGIN] Preenchendo email...`);

                        const emailSelector = await page.evaluate(() => {
                            const inputs = document.querySelectorAll('input');
                            for (const input of inputs) {
                                const attr = (
                                    (input.name || '') +
                                    (input.id || '') +
                                    (input.placeholder || '') +
                                    (input.getAttribute('aria-label') || '') +
                                    (input.getAttribute('autocomplete') || '') +
                                    (input.type || '')
                                ).toLowerCase();

                                if (attr.includes('email') || attr.includes('user') || attr.includes('login') ||
                                    input.type === 'email' || attr.includes('username')) {
                                    if (input.id) return `#${input.id}`;
                                    if (input.name) return `input[name="${input.name}"]`;
                                    return 'input[type="email"], input[type="text"]';
                                }
                            }
                            return 'input[type="email"], input[type="text"]';
                        });

                        try {
                            await page.waitForSelector(emailSelector, { timeout: 5000 });
                            await page.click(emailSelector);
                            await page.type(emailSelector, email, { delay: 50 });
                            console.log(`✅ [PRÉ-LOGIN] Email digitado`);
                        } catch (e) {
                            console.log(`⚠️ [PRÉ-LOGIN] Não encontrou campo de email, tentando alternativo...`);
                            await page.type('input:first-of-type', email, { delay: 50 });
                        }

                        await new Promise(r => setTimeout(r, 1000));

                        // Tenta preencher senha (se estiver na mesma página)
                        console.log(`🔑 [PRÉ-LOGIN] Preenchendo senha...`);
                        try {
                            const passField = await page.$('input[type="password"]');
                            if (passField) {
                                await passField.click();
                                await passField.type(pass, { delay: 50 });
                                console.log(`✅ [PRÉ-LOGIN] Senha digitada`);
                            }
                        } catch (e) {
                            console.log(`⚠️ [PRÉ-LOGIN] Campo de senha não encontrado`);
                        }

                        await new Promise(r => setTimeout(r, 1000));

                        // Clica no botão de login
                        console.log(`🚪 [PRÉ-LOGIN] Clicando Sign In/Entrar...`);

                        await page.evaluate(() => {
                            const buttons = document.querySelectorAll('button, input[type="submit"], a, span[role="button"]');
                            for (const btn of buttons) {
                                const text = (btn.textContent || btn.value || btn.getAttribute('aria-label') || '').toLowerCase();
                                if (text.includes('sign in') || text.includes('entrar') ||
                                    text.includes('login') || text.includes('acessar') ||
                                    text.includes('submit') || text.includes('iniciar') ||
                                    text.includes('continue') || text.includes('continuar')) {
                                    btn.click();
                                    return;
                                }
                            }
                            const form = document.querySelector('form');
                            if (form) form.submit();
                        });

                        await new Promise(r => setTimeout(r, 5000));
                    }

                    // Verifica se login foi bem sucedido
                    const currentUrl = page.url();
                    console.log(`📍 [PRÉ-LOGIN] URL atual: ${currentUrl}`);

                    if (!currentUrl.includes('login') && !currentUrl.includes('sign-in') && !currentUrl.includes('signin') && !currentUrl.includes('sign_in') && !currentUrl.includes('auth.max.com') && !currentUrl.includes('account.envato.com')) {
                        console.log(`🎉 [PRÉ-LOGIN] Login parece ter sido bem sucedido!`);
                    } else {
                        console.log(`⚠️ [PRÉ-LOGIN] Ainda na página de login, cookies serão salvos mesmo assim`);
                    }

                    console.log(`✅ [PRÉ-LOGIN] Login silencioso concluído! Fechando headless...`);

                    // Fecha o browser headless (cookies já estão salvos no userDataDir)
                    await headlessBrowser.close();

                } catch (loginErr) {
                    console.warn(`⚠️ [PRÉ-LOGIN] Erro no login silencioso (continuando mesmo assim):`, loginErr.message);
                    // 🔥 IMPORTANTE: Garante que o browser headless seja fechado mesmo em caso de erro
                    try {
                        if (headlessBrowser && headlessBrowser.isConnected()) {
                            await headlessBrowser.close();
                            console.log(`🔒 [PRÉ-LOGIN] Browser headless fechado após erro`);
                        }
                    } catch (closeErr) {
                        console.warn(`⚠️ [PRÉ-LOGIN] Erro ao fechar browser:`, closeErr.message);
                    }
                }

                // Aguarda um pouco para garantir que o userDataDir foi liberado
                await new Promise(r => setTimeout(r, 1000));
            }

            // ========== AGORA ABRE O CHROME NATIVO (JÁ LOGADO!) ==========
            const chromeArgs = [
                `--user-data-dir=${userDataDir}`,
                '--no-first-run',
                '--no-default-browser-check',
                '--disable-infobars',
                '--disable-save-password-bubble',
                '--disable-notifications',
                '--disable-translate',
                '--autoplay-policy=no-user-gesture-required',
                `--user-agent=${GLOBAL_UA}`,
                // 🔒 FLAGS DE PROTEÇÃO
                '--disable-dev-tools',                    // Desabilita DevTools (F12)
                '--disable-client-side-phishing-detection',
                '--disable-default-apps',
                '--disable-features=TranslateUI,PasswordManagerOnboarding,PasswordManagerBubble,PasswordLeakDetection,PasswordCheck,PasswordReuse,PasswordSaving,IsolateOrigins,site-per-process',
                // 🔒 BLOQUEIA GERENCIADOR DE SENHAS
                '--disable-password-generation',
                '--disable-save-password-bubble',
                '--no-pings',
                // 🔥 ANTI-DETECÇÃO
                '--disable-blink-features=AutomationControlled',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
            ];

            // 🧩 CARREGA EXTENSÕES SOMENTE SE O PERFIL TIVER enableExtensions ATIVADO
            const shouldLoadExtensions = profile.enableExtensions === true;
            let extensionsList = [];
            if (shouldLoadExtensions) {
                extensionsList = getExtensionsList();
                if (extensionsList.length > 0) {
                    // Caminhos já estão no formato curto (sem espaços) graças ao getExtensionsList()
                    const extensionsArg = `--load-extension=${extensionsList.join(',')}`;

                    chromeArgs.push(extensionsArg);
                    console.log(`🔌 [NATIVO] Preparando ${extensionsList.length} extensão(ões) para carregar`);
                    console.log(`🧩 [DEBUG-RAW] extensionsArg: |${extensionsArg}|`);
                }
            }

            if (proxyUrl) {
                chromeArgs.push(`--proxy-server=${proxyUrl}`);
            }

            // 🔥 SMART URLs: Se tem cookies E a URL é de login, usa a URL base (dashboard)
            const loginPaths = ['/login', '/signin', '/sign-in', '/sign_in', '/auth', '/authenticate', '/sso'];
            let smartUrls = targetUrls.map(url => {
                const hasProfileCookies = profile.cookies && profile.cookies.trim();
                if (hasProfileCookies && loginPaths.some(lp => url.toLowerCase().includes(lp))) {
                    try {
                        const urlObj = new URL(url);
                        const homeUrl = `${urlObj.protocol}//${urlObj.hostname}`;
                        console.log(`🏠 [SMART-URL] Login detectado, redirecionando: ${url} → ${homeUrl}`);
                        return homeUrl;
                    } catch (e) { return url; }
                }
                return url;
            });

            // 🧩 Se tem extensões ativas, NÃO usa --app (mostra toolbar com ícones)
            if (shouldLoadExtensions && extensionsList.length > 0) {
                chromeArgs.push(...smartUrls);
                console.log(`🧩 [NATIVO] Modo toolbar ativado (extensões visíveis)`);
            } else if (smartUrls.length === 1) {
                chromeArgs.push(`--app=${smartUrls[0]}`);
            } else if (smartUrls.length > 1) {
                chromeArgs.push(...smartUrls);
            }

            let browser;
            if (shouldLoadExtensions && extensionsList.length > 0) {
                // 🚀 PUPPETEER.LAUNCH COM EXTENSÕES (método oficial)
                // Usa ignoreDefaultArgs para impedir que o Puppeteer adicione --disable-extensions
                const extPathsJoined = extensionsList.join(',');
                console.log(`🚀 [NATIVO] Lançando via puppeteer.launch() COM suporte a extensões...`);
                console.log(`🔌 [NATIVO] Extensões: ${extPathsJoined}`);

                browser = await puppeteer.launch({
                    executablePath,
                    headless: false,
                    userDataDir,
                    defaultViewport: null,
                    ignoreHTTPSErrors: true,
                    // 🔑 CRUCIAL: Remove bloqueios e flags que causam barra amarela
                    ignoreDefaultArgs: ['--disable-extensions', '--enable-automation', '--enable-blink-features=IdleDetection'],
                    args: [
                        ...chromeArgs,
                        `--disable-extensions-except=${extPathsJoined}`,
                        '--enable-features=ExtensionsToolbarMenu',
                    ]
                });
                console.log(`✅ [NATIVO] Chrome com extensões lançado com sucesso!`);

                // 🔓 HABILITA DEVELOPER MODE via UI (Obrigatório para extensões CMD aparecerem)
                try {
                    console.log(`🔓 [NATIVO] Ativando Developer Mode via UI...`);
                    const extPage = await browser.newPage();
                    await extPage.goto('chrome://extensions', { waitUntil: 'load', timeout: 20000 });

                    const result = await extPage.evaluate(async () => {
                        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
                        for (let i = 0; i < 15; i++) {
                            try {
                                const manager = document.querySelector('extensions-manager');
                                const toolbar = manager?.shadowRoot?.querySelector('extensions-toolbar');
                                const toggle = toolbar?.shadowRoot?.querySelector('#devMode');

                                if (toggle) {
                                    if (!toggle.checked) {
                                        toggle.click();
                                        await sleep(1000);
                                        return 'clicked';
                                    }
                                    return 'already_on';
                                }
                            } catch (e) { }
                            await sleep(1000);
                        }
                        return 'timeout_no_elements';
                    });

                    console.log(`🔓 [NATIVO] Developer Mode Status: ${result}`);
                    if (result === 'clicked') {
                        await new Promise(r => setTimeout(r, 2000)); // Espera aplicar
                    }
                    await extPage.close();
                } catch (extErr) {
                    console.warn(`⚠️ [NATIVO] Falha na automação de extensões:`, extErr.message);
                }
            } else {
                // Lançamento padrão via Puppeteer para perfis sem extensões
                console.log(`🚀 [NATIVO] Lançando via Puppeteer padrão (sem extensões)`);
                browser = await puppeteer.launch({
                    executablePath,
                    headless: false,
                    userDataDir,
                    defaultViewport: null,
                    ignoreHTTPSErrors: true,
                    ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=IdleDetection'],
                    args: chromeArgs
                });
            }


            // Captura a página
            const pages = await browser.pages();
            const page = pages.length > 0 ? pages[0] : await browser.newPage();

            // 🔥 ANTI-DETECÇÃO: Injeta scripts que escondem automação Puppeteer de TODOS os sites
            await page.evaluateOnNewDocument(() => {
                // Remove navigator.webdriver (principal flag de detecção)
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                delete navigator.__proto__.webdriver;

                // Chrome API falsa (sites verificam isso)
                if (!window.chrome) {
                    window.chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };
                }

                // Plugins falsos (sites verificam lista vazia)
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5].map(() => ({
                        name: 'Chrome PDF Plugin',
                        description: 'Portable Document Format',
                        filename: 'internal-pdf-viewer',
                        length: 1
                    }))
                });

                // Languages reais
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['pt-BR', 'pt', 'en-US', 'en']
                });

                // Permissions API
                const originalQuery = window.navigator.permissions?.query;
                if (originalQuery) {
                    window.navigator.permissions.query = (parameters) =>
                        parameters.name === 'notifications'
                            ? Promise.resolve({ state: Notification.permission })
                            : originalQuery(parameters);
                }
            });
            console.log(`🛡️ [ANTI-DETECT] Scripts anti-detecção injetados na página principal`);

            // 🔒 AUTO-DISMISS: Fecha popup "Salvar Senha" via CDP (só no primeiro login)
            const cdpSession = await page.target().createCDPSession();
            let passwordDismissed = false;

            // Detecta quando a página principal navega (login concluído)
            page.on('framenavigated', (frame) => {
                // Só age no frame principal e apenas UMA VEZ
                if (frame !== page.mainFrame() || passwordDismissed) return;
                passwordDismissed = true;

                // Envia Escape 3 vezes com delays específicos (1s, 2s, 3s após navegação)
                [1000, 2000, 3000].forEach(delay => {
                    setTimeout(async () => {
                        try {
                            await cdpSession.send('Input.dispatchKeyEvent', {
                                type: 'rawKeyDown', windowsVirtualKeyCode: 27,
                                nativeVirtualKeyCode: 27, key: 'Escape', code: 'Escape'
                            });
                            await cdpSession.send('Input.dispatchKeyEvent', {
                                type: 'keyUp', windowsVirtualKeyCode: 27,
                                nativeVirtualKeyCode: 27, key: 'Escape', code: 'Escape'
                            });
                        } catch (e) { }
                    }, delay);
                });
            });

            // 🔒 INTERCEPTA CredentialManager para impedir Chrome de detectar login
            await page.evaluateOnNewDocument(() => {
                // Impede Chrome de capturar credenciais via CredentialManager API
                if (navigator.credentials && navigator.credentials.store) {
                    navigator.credentials.store = function () { return Promise.resolve(); };
                }
                if (navigator.credentials && navigator.credentials.create) {
                    var origCreate = navigator.credentials.create.bind(navigator.credentials);
                    navigator.credentials.create = function (opts) {
                        if (opts && opts.password) return Promise.resolve(null);
                        return origCreate(opts);
                    };
                }

                // Intercepta submissão de forms para remover autocomplete
                document.addEventListener('DOMContentLoaded', function () {
                    // Marca todos os forms como autocomplete=off
                    var forms = document.querySelectorAll('form');
                    forms.forEach(function (f) { f.setAttribute('autocomplete', 'off'); });
                    // Marca campos de senha
                    var pwds = document.querySelectorAll('input[type="password"]');
                    pwds.forEach(function (p) {
                        p.setAttribute('autocomplete', 'new-password');
                        p.setAttribute('data-lpignore', 'true');
                    });

                    // MutationObserver para novos forms
                    new MutationObserver(function () {
                        document.querySelectorAll('form').forEach(function (f) { f.setAttribute('autocomplete', 'off'); });
                        document.querySelectorAll('input[type="password"]').forEach(function (p) {
                            p.setAttribute('autocomplete', 'new-password');
                            p.setAttribute('data-lpignore', 'true');
                        });
                    }).observe(document.body, { childList: true, subtree: true });
                });
            });


            // 📝 AUTO-FILL: Preenche email e senha automaticamente nos campos de login
            if (profile.email && profile.password) {
                const autoFillEmail = profile.email;
                const autoFillPass = profile.password;
                await page.evaluateOnNewDocument((email, pass) => {
                    // Aguarda a página carregar e tenta preencher
                    function tryAutoFill() {
                        // Procura campo de email
                        const emailSelectors = [
                            'input[type="email"]', 'input[name="email"]', 'input[name="username"]',
                            'input[name="user[login]"]', 'input[name="log"]', 'input[name="user_login"]',
                            'input[id*="email"]', 'input[id*="user"]', 'input[id*="login"]',
                            'input[autocomplete="email"]', 'input[autocomplete="username"]',
                            'input[placeholder*="email" i]', 'input[placeholder*="usuario" i]',
                            'input[placeholder*="user" i]', 'input[placeholder*="login" i]'
                        ];

                        let emailInput = null;
                        for (const sel of emailSelectors) {
                            emailInput = document.querySelector(sel);
                            if (emailInput && emailInput.offsetParent !== null) break;
                            emailInput = null;
                        }

                        // Fallback: primeiro input text que esteja visível
                        if (!emailInput) {
                            const textInputs = document.querySelectorAll('input[type="text"]:not([type="hidden"])');
                            for (const inp of textInputs) {
                                if (inp.offsetParent !== null && !inp.value) {
                                    emailInput = inp;
                                    break;
                                }
                            }
                        }

                        // Procura campo de senha
                        const passInput = document.querySelector('input[type="password"]');

                        if (emailInput || passInput) {
                            // Função para simular digitação real (React-compatible)
                            function setNativeValue(el, value) {
                                const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                                valueSetter.call(el, value);
                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                el.dispatchEvent(new Event('change', { bubbles: true }));
                                el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
                            }

                            if (emailInput && !emailInput.value) {
                                emailInput.focus();
                                setNativeValue(emailInput, email);
                                console.log('📝 [AUTO-FILL] Email preenchido automaticamente!');
                            }

                            if (passInput && !passInput.value) {
                                passInput.focus();
                                setNativeValue(passInput, pass);
                                console.log('📝 [AUTO-FILL] Senha preenchida automaticamente!');
                            }

                            return true;
                        }
                        return false;
                    }

                    // Tenta múltiplas vezes (SPAs carregam campos com delay)
                    let filled = false;
                    const attempts = [500, 1500, 3000, 5000, 8000];
                    attempts.forEach(delay => {
                        setTimeout(() => {
                            if (!filled) {
                                filled = tryAutoFill();
                            }
                        }, delay);
                    });

                    // MutationObserver para detectar campos de login que aparecem dinamicamente
                    const observer = new MutationObserver(() => {
                        if (!filled) {
                            filled = tryAutoFill();
                            if (filled) observer.disconnect();
                        }
                    });
                    setTimeout(() => {
                        observer.observe(document.body || document.documentElement, { childList: true, subtree: true });
                    }, 200);
                    // Para o observer após 15 segundos
                    setTimeout(() => observer.disconnect(), 15000);
                }, autoFillEmail, autoFillPass);
                console.log(`📝 [AUTO-FILL] Script de auto-preenchimento injetado para: ${profile.email}`);
            }

            // 🔥 ANTI-DETECÇÃO: Aplica em novas abas também
            browser.on('targetcreated', async (target) => {
                if (target.type() === 'page') {
                    try {
                        const newPage = await target.page();
                        if (newPage) {
                            await newPage.evaluateOnNewDocument(() => {
                                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                                delete navigator.__proto__.webdriver;
                                if (!window.chrome) window.chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };
                            });
                        }
                    } catch (e) { }
                }
            });

            // 🍪 INJETAR COOKIES DO PERFIL (cadastrados no campo cookies do perfil)
            if (profile.cookies && profile.cookies.trim()) {
                try {
                    console.log(`🍪 [COOKIES] Perfil tem cookies cadastrados, injetando...`);

                    // Parse dos cookies (pode ser JSON array ou string separada por linha)
                    let cookiesToInject = [];
                    const cookieStr = profile.cookies.trim();

                    if (cookieStr.startsWith('[')) {
                        // JSON array
                        cookiesToInject = JSON.parse(cookieStr);
                    } else if (cookieStr.startsWith('{')) {
                        // JSON object único
                        cookiesToInject = [JSON.parse(cookieStr)];
                    } else {
                        // Formato Netscape ou texto simples
                        console.log(`⚠️ [COOKIES] Formato não reconhecido, tentando parse linha por linha`);
                        const lines = cookieStr.split('\n').filter(l => l.trim());
                        for (const line of lines) {
                            // Tenta múltiplos formatos
                            if (line.includes('\t')) {
                                // Formato Netscape: domain\tTRUE\t/\tFALSE\texpiry\tname\tvalue
                                const parts = line.split('\t');
                                if (parts.length >= 7) {
                                    cookiesToInject.push({
                                        domain: parts[0],
                                        path: parts[2],
                                        secure: parts[3] === 'TRUE',
                                        expires: parseInt(parts[4]) || -1,
                                        name: parts[5],
                                        value: parts[6]
                                    });
                                }
                            } else if (line.includes('=')) {
                                // Formato simples: name=value
                                const [name, ...valueParts] = line.split('=');
                                if (name && valueParts.length > 0) {
                                    cookiesToInject.push({
                                        name: name.trim(),
                                        value: valueParts.join('=').trim(),
                                        domain: new URL(targetUrls[0]).hostname
                                    });
                                }
                            }
                        }
                    }

                    if (cookiesToInject.length > 0) {
                        // Usa CDP para injetar cookies (mais robusto)
                        const client = await page.target().createCDPSession();

                        // Prepara cookies para CDP
                        const cdpCookies = cookiesToInject.map(c => ({
                            name: c.name,
                            value: c.value,
                            domain: c.domain || new URL(targetUrls[0]).hostname,
                            path: c.path || '/',
                            secure: c.secure !== false,
                            httpOnly: c.httpOnly || false,
                            sameSite: c.sameSite || 'Lax',
                            expires: c.expires || c.expirationDate || (Date.now() / 1000 + 31536000) // 1 ano
                        }));

                        // Injeta via CDP
                        await client.send('Network.setCookies', { cookies: cdpCookies });
                        console.log(`✅ [COOKIES] ${cdpCookies.length} cookies do perfil injetados via CDP!`);

                        // Log dos domínios
                        const domains = [...new Set(cdpCookies.map(c => c.domain))];
                        console.log(`📂 [COOKIES] Domínios: ${domains.join(', ')}`);
                    }
                } catch (cookieErr) {
                    console.error(`❌ [COOKIES] Erro ao injetar cookies do perfil:`, cookieErr.message);
                }
            }

            // 🔥 INJETAR COOKIES PENDENTES DA CLOUD (se existirem)
            const pendingCookiesFile = path.join(userDataDir, 'pending_cookies.json');
            if (fs.existsSync(pendingCookiesFile)) {
                try {
                    const pendingCookies = JSON.parse(fs.readFileSync(pendingCookiesFile, 'utf8'));
                    if (pendingCookies && pendingCookies.length > 0) {
                        console.log(`☁️ [SESSION] Injetando ${pendingCookies.length} cookies da Cloud...`);
                        const client = await page.target().createCDPSession();
                        await client.send('Network.setCookies', { cookies: pendingCookies });
                        console.log(`✅ [SESSION] Cookies da Cloud injetados com sucesso!`);
                    }
                    // Remove o arquivo após injetar
                    fs.unlinkSync(pendingCookiesFile);
                } catch (cookieErr) {
                    console.warn(`⚠️ [SESSION] Erro ao injetar cookies pendentes:`, cookieErr.message);
                }
            }

            // 🛡️ APLICA PROTEÇÃO (F12, Botão Direito, etc) via função global
            await injectProtection(page);

            // PROTEÇÃO GLOBAL: Novas abas recebem proteção + auto-fill
            browser.on('targetcreated', async (target) => {
                if (target.type() === 'page') {
                    try {
                        const newPage = await target.page();
                        if (newPage) {
                            await injectProtection(newPage);
                            // Auto-fill nas novas abas também
                            if (profile.email && profile.password) {
                                await newPage.evaluateOnNewDocument((email, pass) => {
                                    function tryAutoFill() {
                                        const emailSelectors = [
                                            'input[type="email"]', 'input[name="email"]', 'input[name="username"]',
                                            'input[name="log"]', 'input[name="user_login"]',
                                            'input[id*="email"]', 'input[id*="user"]', 'input[id*="login"]',
                                            'input[autocomplete="email"]', 'input[autocomplete="username"]',
                                            'input[placeholder*="email" i]', 'input[placeholder*="user" i]'
                                        ];
                                        let emailInput = null;
                                        for (const sel of emailSelectors) {
                                            emailInput = document.querySelector(sel);
                                            if (emailInput && emailInput.offsetParent !== null) break;
                                            emailInput = null;
                                        }
                                        if (!emailInput) {
                                            const textInputs = document.querySelectorAll('input[type="text"]:not([type="hidden"])');
                                            for (const inp of textInputs) {
                                                if (inp.offsetParent !== null && !inp.value) { emailInput = inp; break; }
                                            }
                                        }
                                        const passInput = document.querySelector('input[type="password"]');
                                        if (emailInput || passInput) {
                                            function setNativeValue(el, value) {
                                                const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                                                valueSetter.call(el, value);
                                                el.dispatchEvent(new Event('input', { bubbles: true }));
                                                el.dispatchEvent(new Event('change', { bubbles: true }));
                                            }
                                            if (emailInput && !emailInput.value) { emailInput.focus(); setNativeValue(emailInput, email); }
                                            if (passInput && !passInput.value) { passInput.focus(); setNativeValue(passInput, pass); }
                                            return true;
                                        }
                                        return false;
                                    }
                                    let filled = false;
                                    [500, 1500, 3000, 5000].forEach(d => setTimeout(() => { if (!filled) filled = tryAutoFill(); }, d));
                                }, profile.email, profile.password);
                            }
                        }
                    } catch (e) { }
                }
            });

            // 🍪 Se tem cookies do perfil, recarrega/redireciona para aplicar
            const hasCookies = profile.cookies && profile.cookies.trim();
            if (hasCookies && targetUrls.length > 0) {
                // Aguarda a página carregar inicialmente
                await new Promise(r => setTimeout(r, 2000));

                // 🔥 DETECTA se a URL é uma página de login e redireciona para a home
                const currentUrl = targetUrls[0].toLowerCase();
                const loginPaths = ['/login', '/signin', '/sign-in', '/sign_in', '/auth', '/authenticate', '/sso'];
                const isLoginPage = loginPaths.some(lp => currentUrl.includes(lp));

                if (isLoginPage) {
                    // Navega para a raiz do site (dashboard) em vez de recarregar a página de login
                    try {
                        const urlObj = new URL(targetUrls[0]);
                        const homeUrl = `${urlObj.protocol}//${urlObj.hostname}`;
                        console.log(`🏠 [COOKIES] URL de login detectada! Redirecionando para: ${homeUrl}`);
                        await page.goto(homeUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                        console.log(`✅ [COOKIES] Redirecionado para home com cookies aplicados!`);
                    } catch (navErr) {
                        console.warn(`⚠️ [COOKIES] Erro ao redirecionar, tentando reload:`, navErr.message);
                        await page.reload({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => { });
                    }
                } else {
                    // URL normal: apenas recarrega para aplicar os cookies
                    console.log(`🔄 [COOKIES] Recarregando página para aplicar cookies...`);
                    await page.reload({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => { });
                    console.log(`✅ [COOKIES] Página recarregada com cookies aplicados!`);
                }
            } else if (targetUrls.length > 0 && page.url() === 'about:blank') {
                // Fallback: navega se estiver em branco
                await page.goto(targetUrls[0], { waitUntil: 'networkidle2', timeout: 30000 })
                    .catch(e => console.error("Erro navegação:", e.message));
            }

            // 🔥 AUTO-DISMISS: Fecha modais de login que aparecem por cima do dashboard
            // HeyGen e outros SPAs mostram modais de re-auth mesmo com sessão válida
            const pageUrl = page.url().toLowerCase();
            const sitesWithLoginModals = ['heygen.com', 'app.heygen.com'];
            const hasLoginModal = sitesWithLoginModals.some(s => pageUrl.includes(s));

            if (hasLoginModal) {
                console.log(`🔥 [AUTO-DISMISS] Monitorando modais de login para fechar automaticamente...`);

                // Injeta script que roda APÓS a página carregar e monitora modais
                await page.evaluate(() => {
                    // Função para fechar modais de login
                    function dismissLoginModal() {
                        // Procura por overlays/backdrops de modal
                        const overlays = document.querySelectorAll(
                            '[class*="overlay"], [class*="backdrop"], [class*="modal-bg"], ' +
                            '[class*="dialog-overlay"], [class*="mask"], [role="dialog"], ' +
                            '[class*="ReactModal"], [class*="ant-modal"], [class*="MuiDialog"], ' +
                            '[class*="chakra-modal"]'
                        );

                        for (const overlay of overlays) {
                            const text = overlay.textContent || '';
                            // Detecta se é um modal de login OAuth
                            if ((text.includes('Continue with Google') || text.includes('Continue with Apple') ||
                                text.includes('Continue with SSO') || text.includes('Continue with email') ||
                                text.includes('Sign in') || text.includes('Log in')) &&
                                (text.includes('Google') && text.includes('Apple'))) {

                                console.log('🔥 [AUTO-DISMISS] Modal de login detectado! Fechando...');

                                // Tenta encontrar botão de fechar (X)
                                const closeBtn = overlay.querySelector(
                                    'button[aria-label="close"], button[aria-label="Close"], ' +
                                    '[class*="close"], [class*="dismiss"], .close-button, ' +
                                    'button:has(svg path[d*="M6"]), button:has(svg path[d*="M19"])'
                                );
                                if (closeBtn) {
                                    closeBtn.click();
                                    console.log('✅ [AUTO-DISMISS] Fechado via botão close!');
                                    return true;
                                }

                                // Tenta clicar no backdrop (área escura atrás do modal)
                                const backdrop = overlay.querySelector('[class*="backdrop"], [class*="overlay-bg"]');
                                if (backdrop) {
                                    backdrop.click();
                                    console.log('✅ [AUTO-DISMISS] Fechado via backdrop click!');
                                    return true;
                                }

                                // Último recurso: esconde o modal via CSS
                                overlay.style.display = 'none';
                                overlay.style.visibility = 'hidden';
                                overlay.style.opacity = '0';
                                overlay.style.pointerEvents = 'none';
                                // Também remove possíveis overlays/scroll locks do body
                                document.body.style.overflow = 'auto';
                                document.body.classList.remove('overflow-hidden', 'modal-open', 'no-scroll');
                                console.log('✅ [AUTO-DISMISS] Modal escondido via CSS!');
                                return true;
                            }
                        }

                        // Fallback: procura qualquer elemento fixo/absolute com texto de login
                        const allElements = document.querySelectorAll('div[style*="position: fixed"], div[style*="position:fixed"], div[style*="z-index"]');
                        for (const el of allElements) {
                            const text = el.textContent || '';
                            if (text.includes('Continue with Google') && text.includes('Continue with Apple') && el.offsetHeight > 200) {
                                el.style.display = 'none';
                                document.body.style.overflow = 'auto';
                                console.log('✅ [AUTO-DISMISS] Modal fixo escondido!');
                                return true;
                            }
                        }

                        return false;
                    }

                    // Executa múltiplas vezes para pegar modais que aparecem com delay
                    let attempts = 0;
                    const maxAttempts = 30; // 30 tentativas x 1s = 30 segundos de monitoramento
                    const checkInterval = setInterval(() => {
                        attempts++;
                        if (dismissLoginModal() || attempts >= maxAttempts) {
                            clearInterval(checkInterval);
                        }
                    }, 1000);

                    // Também usa MutationObserver para detecção instantânea
                    const observer = new MutationObserver((mutations) => {
                        for (const mutation of mutations) {
                            for (const node of mutation.addedNodes) {
                                if (node.nodeType === 1 && node.textContent &&
                                    node.textContent.includes('Continue with Google') &&
                                    node.textContent.includes('Continue with Apple')) {
                                    setTimeout(dismissLoginModal, 500); // Pequeno delay para o modal renderizar completamente
                                }
                            }
                        }
                    });
                    observer.observe(document.body, { childList: true, subtree: true });

                    // Para o observer após 60 segundos
                    setTimeout(() => observer.disconnect(), 60000);
                });

                console.log(`✅ [AUTO-DISMISS] Script de monitoramento injetado!`);
            }

            // Armazena instâncias para controle
            activePuppeteerInstances.set(profile.id, { browser, page });

            // 🔥 CRIA JANELA OVERLAY COM BOTÕES FLUTUANTES
            createFloatingButtons(profile.id);

            // Pega o PID de forma segura (connect não tem process())
            const bProc = browser.process();
            const browserPid = bProc ? bProc.pid : 0;

            return { status: 'success', mode: 'native', pid: browserPid };
        } catch (e) {
            console.error("Erro ao iniciar perfil nativo:", e);
            return { status: 'error', message: e.message };
        }
    });

    // ========== MODO PUPPETEER (ANTIGO - SEM DRM) ==========
    ipcMain.handle('launch-profile', async (event, profile, customBrowserPath) => {
        try {
            const userDataDir = path.join(app.getPath('userData'), 'profiles', profile.id);
            if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

            // 🔒 DESABILITA O GERENCIADOR DE SENHAS NO PERFIL
            const defaultDir = path.join(userDataDir, 'Default');
            if (!fs.existsSync(defaultDir)) fs.mkdirSync(defaultDir, { recursive: true });

            const prefsPath = path.join(defaultDir, 'Preferences');
            let prefs = {};
            if (fs.existsSync(prefsPath)) {
                try { prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8')); } catch (e) { }
            }

            // Desabilita todas as opções de senha
            prefs.credentials_enable_service = false;
            prefs.credentials_enable_autosignin = false;
            if (!prefs.profile) prefs.profile = {};
            prefs.profile.password_manager_enabled = false;
            if (!prefs.password_manager) prefs.password_manager = {};
            prefs.password_manager.credentials_enable_service = false;
            prefs.password_manager.save_password_bubble_opt_in = false;

            // 🧩 HABILITA DEVELOPER MODE para que --load-extension funcione
            if (profile.enableExtensions) {
                if (!prefs.extensions) prefs.extensions = {};
                if (!prefs.extensions.ui) prefs.extensions.ui = {};
                prefs.extensions.ui.developer_mode = true;
                console.log(`🧩 [PREFS] Developer Mode habilitado no perfil para extensões`);

                // 🔐 DELETA Secure Preferences para impedir hash validation
                const securePrefsPath = path.join(defaultDir, 'Secure Preferences');
                if (fs.existsSync(securePrefsPath)) {
                    try { fs.unlinkSync(securePrefsPath); console.log(`🗑️ [PREFS] Secure Preferences removido para aceitar developer_mode`); } catch (e) { }
                }
            }

            fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));

            // 🍎🪟🐧 Encontra o Chrome usando função multiplataforma
            const executablePath = findChromePath(customBrowserPath);
            if (!executablePath) {
                throw new Error('Chrome não encontrado! Instale o Google Chrome ou configure o caminho nas configurações.');
            }

            const targetUrls = (profile.urls && profile.urls.length > 0) ? profile.urls : ['https://google.com'];

            // 🔥 PROXY-CHAIN: Cria proxy local anônimo para proxies autenticados
            let proxyUrl = null;
            if (profile.proxy) {
                try {
                    // Fecha proxy anterior deste perfil se existir
                    if (activeProxies.has(profile.id)) {
                        await proxyChain.closeAnonymizedProxy(activeProxies.get(profile.id), true);
                    }

                    // Cria URL de proxy no formato correto para proxy-chain
                    // proxy-chain aceita: http://user:pass@ip:port ou socks5://user:pass@ip:port
                    console.log(`🔄 Criando proxy anônimo para: ${profile.proxy}`);
                    const anonymizedProxy = await proxyChain.anonymizeProxy(profile.proxy);
                    proxyUrl = anonymizedProxy;
                    activeProxies.set(profile.id, anonymizedProxy);
                    console.log(`✅ Proxy anônimo criado: ${anonymizedProxy}`);
                } catch (proxyErr) {
                    console.error(`❌ Erro ao criar proxy anônimo:`, proxyErr);
                    // Fallback: usa proxy direto
                    proxyUrl = profile.proxy;
                }
            }

            // Configurações de inicialização
            const launchArgs = [
                '--no-first-run',
                '--no-default-browser-check',
                `--user-agent=${GLOBAL_UA}`,
                '--disable-infobars',
                // 🔒 Desabilita COMPLETAMENTE o gerenciador de senhas do Chrome
                '--disable-save-password-bubble',
                '--disable-component-update',
                '--disable-default-apps',
                '--disable-sync',
                // Autoplay para vídeos
                '--autoplay-policy=no-user-gesture-required',
                // Desabilita avisos e notificações
                '--disable-notifications',
                '--disable-popup-blocking',
                '--disable-translate',
                '--disable-dev-tools', // 🔒 Proteção F12
                // 🔥 ANTI-DETECÇÃO: Impede sites de detectar automação Puppeteer
                '--disable-blink-features=AutomationControlled',
                '--disable-features=IsolateOrigins,site-per-process',
                '--disable-dev-shm-usage',
                '--no-sandbox',
                '--disable-setuid-sandbox',
                // Proxy se configurado
                proxyUrl ? `--proxy-server=${proxyUrl}` : ''
            ].filter(Boolean);

            // 🧩 CARREGA EXTENSÕES SOMENTE SE O PERFIL TIVER enableExtensions ATIVADO
            const shouldLoadExtensions = profile.enableExtensions === true;
            let extensionsList = [];
            if (shouldLoadExtensions) {
                extensionsList = getExtensionsList();
                if (extensionsList.length > 0) {
                    // Caminhos já estão no formato curto (sem espaços) graças ao getExtensionsList()
                    const extensionsArg = `--load-extension=${extensionsList.join(',')}`;

                    launchArgs.push(extensionsArg);
                    console.log(`🔌 [PUPPETEER] Preparando ${extensionsList.length} extensão(ões) para carregar`);
                    console.log(`🧩 [DEBUG-RAW] extensionsArg: |${extensionsArg}|`);
                }
            }

            // 🧩 Se tem extensões ativas, NÃO usa --app (mostra toolbar com ícones)
            if (shouldLoadExtensions && extensionsList.length > 0) {
                if (targetUrls.length > 0) {
                    launchArgs.push(...targetUrls);
                }
                console.log(`🧩 [PUPPETEER] Modo toolbar ativado (extensões visíveis)`);
            } else if (targetUrls.length === 1) {
                launchArgs.push(`--app=${targetUrls[0]}`);
            }

            let browser;
            if (shouldLoadExtensions && extensionsList.length > 0) {
                // 🚀 ABORDAGEM PUPPETEER.LAUNCH COM EXTENSÕES (Melhorada)
                const extPathsJoined = extensionsList.join(',');
                console.log(`🚀 [PUPPETEER] Lançando via puppeteer.launch() COM suporte a extensões...`);
                console.log(`🔌 [PUPPETEER] Extensões: ${extPathsJoined}`);

                browser = await puppeteer.launch({
                    executablePath,
                    headless: false,
                    userDataDir,
                    defaultViewport: null,
                    ignoreHTTPSErrors: true,
                    // 🔑 CRUCIAL: Remove bloqueios e flags que causam barra amarela
                    ignoreDefaultArgs: ['--disable-extensions', '--enable-automation', '--enable-blink-features=IdleDetection'],
                    args: [
                        ...launchArgs,
                        `--disable-extensions-except=${extPathsJoined}`,
                        '--enable-features=ExtensionsToolbarMenu'
                    ]
                });
                console.log(`✅ [PUPPETEER] Chrome com extensões lançado com sucesso!`);

                // 🔓 HABILITA DEVELOPER MODE via UI (Opcional mas recomendado para unpacked)
                try {
                    console.log(`🔓 [PUPPETEER] Ativando Developer Mode via UI...`);
                    const extPage = await browser.newPage();
                    await extPage.goto('chrome://extensions', { waitUntil: 'load', timeout: 20000 });

                    const result = await extPage.evaluate(async () => {
                        const sleep = (ms) => new Promise(r => setTimeout(r, ms));
                        for (let i = 0; i < 15; i++) {
                            try {
                                const manager = document.querySelector('extensions-manager');
                                const toolbar = manager?.shadowRoot?.querySelector('extensions-toolbar');
                                const toggle = toolbar?.shadowRoot?.querySelector('#devMode');
                                if (toggle) {
                                    if (!toggle.checked) {
                                        toggle.click();
                                        await sleep(1000);
                                        return 'clicked';
                                    }
                                    return 'already_on';
                                }
                            } catch (e) { }
                            await sleep(1000);
                        }
                        return 'timeout_no_elements';
                    });

                    console.log(`🔓 [PUPPETEER] Status: ${result}`);
                    if (result === 'clicked') await new Promise(r => setTimeout(r, 2000));
                    await extPage.close();
                } catch (extErr) {
                    console.warn(`⚠️ [PUPPETEER] Falha na ativação via UI:`, extErr.message);
                }

            } else {
                // Lançamento padrão via Puppeteer para perfis sem extensões
                console.log(`🚀 [PUPPETEER] Lançando via Puppeteer padrão (sem extensões)`);
                browser = await puppeteer.launch({
                    executablePath,
                    headless: false,
                    userDataDir,
                    defaultViewport: null,
                    ignoreHTTPSErrors: true,
                    ignoreDefaultArgs: ['--enable-automation', '--enable-blink-features=IdleDetection'],
                    args: launchArgs
                });
            }

            // Captura as páginas iniciais
            const pages = await browser.pages();
            const page = pages.length > 0 ? pages[0] : await browser.newPage();

            // 🔥 ANTI-DETECÇÃO: Injeta scripts que escondem automação Puppeteer
            await page.evaluateOnNewDocument(() => {
                Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
                delete navigator.__proto__.webdriver;
                if (!window.chrome) window.chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5].map(() => ({ name: 'Chrome PDF Plugin', description: 'Portable Document Format', filename: 'internal-pdf-viewer', length: 1 }))
                });
                Object.defineProperty(navigator, 'languages', { get: () => ['pt-BR', 'pt', 'en-US', 'en'] });
            });
            console.log(`🛡️ [ANTI-DETECT] Scripts anti-detecção injetados (modo Puppeteer)`);

            // 🛡️ APLICA PROTEÇÃO (F12, Botão Direito, etc) via função global
            await injectProtection(page);

            // PROTEÇÃO GLOBAL: Novas abas
            browser.on('targetcreated', async (target) => {
                if (target.type() === 'page') {
                    const newPage = await target.page();
                    if (newPage) await injectProtection(newPage);
                }
            });

            // Loop para abrir todas as URLs cadastradas
            for (let i = 0; i < targetUrls.length; i++) {
                if (i === 0 && page.url() !== 'about:blank') continue; // Primeira já carregada pelo --app

                const p = (i === 0) ? page : await browser.newPage();
                if (i > 0) await injectProtection(p); // Protege novas páginas criadas aqui

                // 🔥 INJEÇÃO DE COOKIES para perfis com sessão por cookies
                if (profile.cookies && profile.cookies.trim()) {
                    try {
                        let cookiesToSet = [];
                        const cookiesRaw = profile.cookies.trim();

                        // Tenta parsear como JSON (formato Export Cookie)
                        if (cookiesRaw.startsWith('[')) {
                            const parsedCookies = JSON.parse(cookiesRaw);
                            cookiesToSet = parsedCookies.map(c => ({
                                name: c.name,
                                value: c.value,
                                domain: c.domain || c.host,
                                path: c.path || '/',
                                httpOnly: c.httpOnly || false,
                                secure: c.secure || false,
                                sameSite: c.sameSite || 'Lax',
                                expires: c.expirationDate || c.expires || -1
                            }));
                        } else {
                            // Formato Netscape (tab-separated)
                            const lines = cookiesRaw.split('\n').filter(l => l && !l.startsWith('#'));
                            cookiesToSet = lines.map(line => {
                                const parts = line.split('\t');
                                if (parts.length >= 7) {
                                    return {
                                        domain: parts[0],
                                        path: parts[2],
                                        secure: parts[3].toLowerCase() === 'true',
                                        expires: parseInt(parts[4]) || -1,
                                        name: parts[5],
                                        value: parts[6]
                                    };
                                }
                                return null;
                            }).filter(Boolean);
                        }

                        // Injeta os cookies na página
                        if (cookiesToSet.length > 0) {
                            await page.setCookie(...cookiesToSet);
                            console.log(`🍪 ${cookiesToSet.length} cookies injetados para perfil ${profile.name}`);
                        }
                    } catch (cookieErr) {
                        console.error('❌ Erro ao injetar cookies:', cookieErr.message);
                    }
                }

                // proxy-chain já cuida da autenticação, não precisa de page.authenticate()

                // Aplica o "Sidnei Shield" em cada aba individualmente
                await page.evaluateOnNewDocument((email, pass, customCSS) => {
                    // ========== EVASÃO ANTI-DETECÇÃO ==========
                    // Remove webdriver property
                    Object.defineProperty(navigator, 'webdriver', {
                        get: () => undefined,
                    });

                    // Fake plugins
                    Object.defineProperty(navigator, 'plugins', {
                        get: () => [
                            { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
                            { name: 'Chrome PDF Viewer', filename: 'mhjfbmdgcfjbbpaeojofohoefgiehjai', description: '' },
                            { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
                        ],
                    });

                    // Fake languages
                    Object.defineProperty(navigator, 'languages', {
                        get: () => ['pt-BR', 'pt', 'en-US', 'en'],
                    });

                    // Fake chrome runtime
                    window.chrome = {
                        runtime: {
                            id: undefined,
                            connect: () => { },
                            sendMessage: () => { },
                        },
                        loadTimes: () => ({}),
                        csi: () => ({}),
                        app: { isInstalled: false, InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' }, RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' } },
                    };

                    // Override permissions query
                    const originalQuery = window.navigator.permissions.query;
                    window.navigator.permissions.query = (parameters) => (
                        parameters.name === 'notifications' ?
                            Promise.resolve({ state: Notification.permission }) :
                            originalQuery(parameters)
                    );

                    // Hide automation indicators
                    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
                    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
                    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;

                    // ========== FIM EVASÃO ==========

                    // ========== BARRA DE NAVEGAÇÃO FLUTUANTE ==========
                    window.addEventListener('DOMContentLoaded', () => {
                        if (document.getElementById('sidnei-nav-bar')) return;

                        // CSS para esconder a barra de aviso do Chrome e popup de senha
                        const hideInfobar = document.createElement('style');
                        hideInfobar.textContent = `
                            /* Esconde a barra de aviso do Chrome */
                            [role="alert"], 
                            .infobar, 
                            *[class*="infobar"],
                            *[id*="infobar"],
                            div[style*="background-color: rgb(255, 255, 224)"],
                            div[style*="background: rgb(255, 255, 224)"] {
                                display: none !important;
                                height: 0 !important;
                                visibility: hidden !important;
                            }
                            /* Esconde o popup de salvar senha do Chrome */
                            [data-testid*="password"],
                            [class*="password-bubble"],
                            [class*="save-password"],
                            [class*="credential"],
                            div[class*="PasswordSave"],
                            div[aria-label*="senha"],
                            div[aria-label*="password"],
                            form[class*="password"] {
                                display: none !important;
                                visibility: hidden !important;
                            }
                        `;
                        document.head.appendChild(hideInfobar);

                        const navBar = document.createElement('div');
                        navBar.id = 'sidnei-nav-bar';
                        navBar.innerHTML = `
                            <style>
                                #sidnei-nav-bar {
                                    position: fixed;
                                    top: 10px;
                                    left: 50%;
                                    transform: translateX(-50%);
                                    z-index: 2147483647;
                                    display: flex;
                                    gap: 8px;
                                    background: linear-gradient(135deg, rgba(20, 20, 35, 0.97) 0%, rgba(30, 25, 50, 0.97) 100%);
                                    padding: 8px 16px;
                                    border-radius: 30px;
                                    box-shadow: 0 8px 32px rgba(0,0,0,0.5), 0 0 20px rgba(138, 43, 226, 0.3);
                                    backdrop-filter: blur(20px);
                                    cursor: move;
                                    user-select: none;
                                    border: 1px solid rgba(138, 43, 226, 0.3);
                                }
                                #sidnei-nav-bar button {
                                    width: 40px;
                                    height: 40px;
                                    border: none;
                                    cursor: pointer;
                                    border-radius: 12px;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    transition: all 0.3s ease;
                                    position: relative;
                                    overflow: hidden;
                                }
                                #sidnei-nav-bar button::before {
                                    content: '';
                                    position: absolute;
                                    inset: 0;
                                    opacity: 0;
                                    transition: opacity 0.3s;
                                }
                                #sidnei-nav-bar button:hover::before {
                                    opacity: 1;
                                }
                                #sidnei-nav-bar button:hover {
                                    transform: translateY(-2px);
                                    box-shadow: 0 6px 20px rgba(0,0,0,0.4);
                                }
                                #sidnei-nav-bar button:active {
                                    transform: scale(0.95) translateY(0);
                                }
                                #sidnei-nav-bar svg {
                                    width: 20px;
                                    height: 20px;
                                    fill: white;
                                    position: relative;
                                    z-index: 1;
                                    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
                                }
                                /* Botão Voltar - Roxo */
                                #snb-back {
                                    background: linear-gradient(135deg, #8B5CF6 0%, #7C3AED 100%);
                                    box-shadow: 0 4px 15px rgba(139, 92, 246, 0.4);
                                }
                                #snb-back:hover {
                                    box-shadow: 0 6px 25px rgba(139, 92, 246, 0.6);
                                }
                                /* Botão Avançar - Azul */
                                #snb-forward {
                                    background: linear-gradient(135deg, #3B82F6 0%, #2563EB 100%);
                                    box-shadow: 0 4px 15px rgba(59, 130, 246, 0.4);
                                }
                                #snb-forward:hover {
                                    box-shadow: 0 6px 25px rgba(59, 130, 246, 0.6);
                                }
                                /* Botão Atualizar - Verde/Cyan */
                                #snb-refresh {
                                    background: linear-gradient(135deg, #10B981 0%, #059669 100%);
                                    box-shadow: 0 4px 15px rgba(16, 185, 129, 0.4);
                                }
                                #snb-refresh:hover {
                                    box-shadow: 0 6px 25px rgba(16, 185, 129, 0.6);
                                }
                                /* Botão Fechar - Discreto */
                                #snb-close {
                                    background: rgba(255,255,255,0.1);
                                    width: 28px;
                                    height: 28px;
                                    font-size: 12px;
                                    color: rgba(255,255,255,0.5);
                                    margin-left: 4px;
                                    align-self: center;
                                }
                                #snb-close:hover {
                                    background: rgba(239, 68, 68, 0.8);
                                    color: white;
                                    box-shadow: 0 4px 15px rgba(239, 68, 68, 0.4);
                                }
                            </style>
                            <button id="snb-back" title="Voltar">
                                <svg viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
                            </button>
                            <button id="snb-forward" title="Avançar">
                                <svg viewBox="0 0 24 24"><path d="M12 4l-1.41 1.41L16.17 11H4v2h12.17l-5.58 5.59L12 20l8-8z"/></svg>
                            </button>
                            <button id="snb-refresh" title="Atualizar">
                                <svg viewBox="0 0 24 24"><path d="M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>
                            </button>
                            <button id="snb-close" title="Fechar barra">✕</button>
                        `;
                        document.body.appendChild(navBar);

                        // Funções dos botões
                        document.getElementById('snb-back').onclick = () => history.back();
                        document.getElementById('snb-forward').onclick = () => history.forward();
                        document.getElementById('snb-refresh').onclick = () => location.reload();
                        document.getElementById('snb-close').onclick = () => navBar.style.display = 'none';

                        // Drag para mover a barra
                        let isDragging = false, offsetX, offsetY;
                        navBar.onmousedown = (e) => {
                            if (e.target.tagName === 'BUTTON') return;
                            isDragging = true;
                            offsetX = e.clientX - navBar.offsetLeft;
                            offsetY = e.clientY - navBar.offsetTop;
                            navBar.style.transform = 'none'; // Remove translateX ao arrastar
                        };
                        document.onmousemove = (e) => {
                            if (isDragging) {
                                navBar.style.left = (e.clientX - offsetX) + 'px';
                                navBar.style.top = (e.clientY - offsetY) + 'px';
                            }
                        };
                        document.onmouseup = () => isDragging = false;
                    });
                    // ========== FIM BARRA DE NAVEGAÇÃO ==========

                    // Bloqueio de inspeção
                    window.addEventListener('keydown', (e) => {
                        if (e.keyCode === 123 || (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74)) || (e.ctrlKey && e.keyCode === 85)) {
                            e.preventDefault();
                        }
                    }, true);

                    // Bloqueio de menu de contexto
                    window.addEventListener('contextmenu', (e) => e.preventDefault(), true);

                    // Auto-fill e Injeção de Estilos
                    setInterval(() => {
                        if (!document.getElementById('sidnei-shield-style')) {
                            const style = document.createElement('style');
                            style.id = 'sidnei-shield-style';
                            style.textContent = `
                        input:: -ms - reveal, input:: -ms - clear { display: none!important; }
                                .password - toggle, .show - password, [class*= "eye"], [id *= "eye"], svg[class*= "eye"] {
                            display: none!important;
                            visibility: hidden!important;
                            pointer - events: none!important;
                        }
                                ${customCSS || ''}
                        `;
                            document.head.appendChild(style);
                        }

                        // Localiza campos de login e senha (melhorado para HBO Max)
                        const inputs = document.querySelectorAll('input:not([type="hidden"])');
                        inputs.forEach(i => {
                            const attr = (
                                (i.name || '') +
                                (i.id || '') +
                                (i.placeholder || '') +
                                (i.getAttribute('aria-label') || '') +
                                (i.getAttribute('data-testid') || '') +
                                (i.getAttribute('autocomplete') || '')
                            ).toLowerCase();

                            // Detecta campo de email/usuário (incluindo HBO Max)
                            const isEmail = email && (
                                i.type === 'email' ||
                                i.type === 'text' ||
                                attr.includes('user') ||
                                attr.includes('login') ||
                                attr.includes('email') ||
                                attr.includes('e-mail') ||
                                attr.includes('endereço') ||
                                attr.includes('username')
                            );

                            // Detecta campo de senha
                            const isPass = pass && (
                                i.type === 'password' ||
                                attr.includes('pass') ||
                                attr.includes('senha') ||
                                attr.includes('pwd')
                            );

                            const target = isEmail ? email : (isPass ? pass : null);

                            if (target && i.value !== target && !i.matches(':focus')) {
                                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
                                nativeSetter.call(i, target);
                                i.dispatchEvent(new Event('input', { bubbles: true }));
                                i.dispatchEvent(new Event('change', { bubbles: true }));
                            }
                        });
                    }, 3000);
                }, profile.email, profile.password, profile.customCSS);

                // Navega para a URL correspondente
                // Se i === 0 e targetUrls.length === 1, o --app já cuidou da navegação
                if (i > 0 || targetUrls.length > 1) {
                    await page.goto(targetUrls[i], { waitUntil: 'domcontentloaded' }).catch(err => {
                        console.error(`Erro ao navegar para ${targetUrls[i]}: `, err.message);
                    });
                }
            }

            return { status: 'success' };
        } catch (e) {
            console.error("Erro ao iniciar perfil externo:", e);
            return { status: 'error', message: e.message };
        }
    });

    ipcMain.handle('set-proxy', async (e, { proxy, partition }) => {
        const ses = session.fromPartition(partition);

        if (!proxy) {
            // Limpa o proxy
            await ses.setProxy({ proxyRules: '' });
            return { status: 'success' };
        }

        try {
            // 🔥 PARSE PROXY COM AUTENTICAÇÃO: protocol://user:pass@ip:port
            let proxyRule = '';
            let proxyAuth = null;

            // Regex para extrair: protocol://user:pass@ip:port
            const authMatch = proxy.match(/^(socks5|socks4|socks|http|https):\/\/([^:]+):([^@]+)@([^:]+):(\d+)$/);

            if (authMatch) {
                const [, protocol, user, pass, ip, port] = authMatch;
                // Formato para Electron: protocol://ip:port (sem auth na URL)
                proxyRule = `${protocol}://${ip}:${port}`;
                proxyAuth = { username: user, password: pass };
                console.log(`🔒 Proxy configurado: ${proxyRule} (com autenticação para ${user})`);
            } else {
                // Formato simples sem autenticação ou já formatado
                proxyRule = proxy;
                console.log(`🔒 Proxy configurado: ${proxyRule} (sem autenticação)`);
            }

            // Configura o proxy
            await ses.setProxy({ proxyRules: proxyRule });

            // Remove listeners anteriores para evitar duplicação
            ses.removeAllListeners('login');

            // Se tem autenticação, usa o evento 'login' que funciona para proxies
            if (proxyAuth) {
                ses.on('login', (event, webContents, details, authInfo, callback) => {
                    if (authInfo.isProxy) {
                        console.log(`🔑 Autenticando proxy: ${authInfo.host}`);
                        event.preventDefault();
                        callback(proxyAuth.username, proxyAuth.password);
                    } else {
                        callback();
                    }
                });
            }

            return { status: 'success' };
        } catch (err) {
            console.error('❌ Erro ao configurar proxy:', err);
            return { status: 'error', message: err.message };
        }
    });

    ipcMain.handle('get-cookies', async (e, { partition }) => {
        const ses = session.fromPartition(partition);
        const cookies = await ses.cookies.get({});
        return { status: 'success', cookies };
    });

    ipcMain.handle('set-cookies', async (e, { cookies, partition }) => {
        const ses = session.fromPartition(partition);
        try {
            const list = typeof cookies === 'string' ? JSON.parse(cookies) : cookies;
            for (let c of list) {
                const domain = c.domain.startsWith('.') ? c.domain.substring(1) : c.domain;
                await ses.cookies.set({
                    url: `https://${domain}${c.path || '/'}`,
                    name: c.name, value: c.value, domain: c.domain, path: c.path || '/',
                    secure: true, httpOnly: !!c.httpOnly
                }).catch(() => { });
            }
            return { status: 'success' };
        } catch (err) { return { status: 'error' }; }
    });

    // ========== SINCRONIZAÇÃO DE SESSÃO VIA CLOUD ==========

    // Captura cookies + localStorage do Chrome nativo (para o admin salvar sessão)
    ipcMain.handle('capture-session', async (event, { profileId, targetUrl }) => {
        console.log(`📸 [SESSION] Capturando sessão para perfil: ${profileId}`);

        try {
            const userDataDir = path.join(app.getPath('userData'), 'profiles', profileId);

            // 🍎🪟🐧 Encontra o Chrome usando função multiplataforma
            const executablePath = findChromePath();
            if (!executablePath) {
                return { status: 'error', message: 'Chrome não encontrado. Verifique a instalação.' };
            }

            console.log(`🌐 [SESSION] Usando Chrome em: ${executablePath}`);

            // 🔥 USA CHROME COM INTERFACE para garantir melhor compatibilidade
            const browser = await puppeteer.launch({
                executablePath,
                headless: false, // Não headless para melhor captura de cookies
                userDataDir,
                defaultViewport: null,
                args: [
                    '--no-first-run',
                    '--disable-notifications',
                    '--no-sandbox',
                    '--disable-blink-features=AutomationControlled',
                    '--window-position=-2000,-2000', // Esconde a janela
                    '--window-size=1,1'
                ]
            });

            const page = await browser.newPage();

            // Navega para o site alvo
            console.log(`🌐 [SESSION] Navegando para: ${targetUrl}`);
            try {
                await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            } catch (e) {
                console.warn(`⚠️ [SESSION] Navegação parcial:`, e.message);
            }

            await new Promise(r => setTimeout(r, 3000)); // Espera mais tempo para cookies serem setados

            // 🔥 USA CDP PARA CAPTURAR TODOS OS COOKIES (incluindo outros domínios como Clerk)
            const client = await page.target().createCDPSession();
            const { cookies: allCookies } = await client.send('Network.getAllCookies');
            console.log(`🍪 [SESSION] ${allCookies.length} cookies capturados (todos os domínios)`);

            // Log dos domínios para debug
            const domains = [...new Set(allCookies.map(c => c.domain))];
            console.log(`📂 [SESSION] Domínios capturados: ${domains.join(', ')}`);

            // Captura localStorage
            const localStorageData = await page.evaluate(() => {
                const data = {};
                for (let i = 0; i < localStorage.length; i++) {
                    const key = localStorage.key(i);
                    data[key] = localStorage.getItem(key);
                }
                return data;
            });
            console.log(`💾 [SESSION] ${Object.keys(localStorageData).length} itens localStorage capturados`);

            // Captura sessionStorage também
            const sessionStorageData = await page.evaluate(() => {
                const data = {};
                for (let i = 0; i < sessionStorage.length; i++) {
                    const key = sessionStorage.key(i);
                    data[key] = sessionStorage.getItem(key);
                }
                return data;
            });
            console.log(`📦 [SESSION] ${Object.keys(sessionStorageData).length} itens sessionStorage capturados`);

            await page.close();
            await browser.close();

            const sessionData = {
                cookies: allCookies, // Usa todos os cookies capturados via CDP
                localStorage: localStorageData,
                sessionStorage: sessionStorageData,
                capturedAt: new Date().toISOString(),
                capturedFrom: targetUrl,
                domains: domains // Salva os domínios para referência
            };

            console.log(`✅ [SESSION] Sessão capturada com sucesso!`);

            return { status: 'success', sessionData };

        } catch (err) {
            console.error(`❌ [SESSION] Erro ao capturar sessão:`, err.message);
            return { status: 'error', message: err.message };
        }
    });

    // Injeta cookies + localStorage antes de abrir o Chrome nativo
    ipcMain.handle('inject-session', async (event, { profileId, sessionData, targetUrl }) => {
        console.log(`💉 [SESSION] Injetando sessão para perfil: ${profileId}`);

        let sessionBrowser = null;

        try {
            // ⏱️ TIMEOUT: Máximo 15 segundos para não travar a UI
            const result = await Promise.race([
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout: sessão demorou demais (15s)')), 15000)),
                (async () => {
                    if (!sessionData || !sessionData.cookies) {
                        console.log(`⚠️ [SESSION] Nenhuma sessão para injetar`);
                        return { status: 'success', message: 'No session to inject' };
                    }

                    const userDataDir = path.join(app.getPath('userData'), 'profiles', profileId);
                    if (!fs.existsSync(userDataDir)) fs.mkdirSync(userDataDir, { recursive: true });

                    const executablePath = findChromePath();
                    if (!executablePath) {
                        return { status: 'error', message: 'Chrome não encontrado.' };
                    }

                    console.log(`🌐 [SESSION] Usando Chrome em: ${executablePath}`);

                    sessionBrowser = await puppeteer.launch({
                        executablePath,
                        headless: 'new',
                        userDataDir,
                        defaultViewport: null,
                        timeout: 10000, // Timeout do launch
                        args: [
                            '--no-first-run',
                            '--disable-notifications',
                            '--no-sandbox',
                            '--disable-blink-features=AutomationControlled',
                        ]
                    });

                    const page = await sessionBrowser.newPage();

                    if (sessionData.cookies && sessionData.cookies.length > 0) {
                        console.log(`🍪 [SESSION] Injetando ${sessionData.cookies.length} cookies via CDP...`);
                        const client = await page.target().createCDPSession();
                        await client.send('Network.clearBrowserCookies');

                        const cleanCookies = sessionData.cookies.map(cookie => {
                            const clean = { ...cookie };
                            delete clean.session;
                            delete clean.storeId;
                            delete clean.hostOnly;
                            if (clean.expires && typeof clean.expires === 'number' && clean.expires > 0) {
                                clean.expires = clean.expires;
                            } else {
                                delete clean.expires;
                            }
                            return clean;
                        });

                        try {
                            await client.send('Network.setCookies', { cookies: cleanCookies });
                            console.log(`🍪 [SESSION] ${cleanCookies.length} cookies injetados via CDP!`);
                            const domains = [...new Set(cleanCookies.map(c => c.domain))];
                            console.log(`📂 [SESSION] Domínios injetados: ${domains.join(', ')}`);
                        } catch (cdpErr) {
                            console.error(`⚠️ [SESSION] Erro CDP fallback:`, cdpErr.message);
                            let injectedCount = 0;
                            for (const cookie of cleanCookies) {
                                try { await page.setCookie(cookie); injectedCount++; } catch (e) { }
                            }
                            console.log(`🍪 [SESSION] ${injectedCount} cookies injetados (fallback)`);
                        }
                    }

                    console.log(`🌐 [SESSION] Navegando para: ${targetUrl}`);
                    try {
                        await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 10000 });
                    } catch (navErr) {
                        console.warn(`⚠️ [SESSION] Navegação parcial:`, navErr.message);
                    }

                    if (sessionData.localStorage && Object.keys(sessionData.localStorage).length > 0) {
                        console.log(`💾 [SESSION] Injetando ${Object.keys(sessionData.localStorage).length} itens localStorage...`);
                        await page.evaluate((data) => {
                            for (const [key, value] of Object.entries(data)) {
                                try { localStorage.setItem(key, value); } catch (e) { }
                            }
                        }, sessionData.localStorage);
                    }

                    console.log(`⏳ [SESSION] Aguardando persistência...`);
                    await new Promise(r => setTimeout(r, 1000));

                    await page.close().catch(() => { });
                    await sessionBrowser.close().catch(() => { });
                    sessionBrowser = null;

                    console.log(`✅ [SESSION] Sessão injetada com sucesso!`);
                    return { status: 'success' };
                })()
            ]);

            return result;
        } catch (err) {
            console.error(`❌ [SESSION] Erro/timeout ao injetar sessão:`, err.message);
            // Garante cleanup do browser
            if (sessionBrowser) {
                try { await sessionBrowser.close(); } catch (e) { }
            }
            return { status: 'error', message: err.message };
        }
    });

    ipcMain.handle('open-popup', async (e, { url, partition }) => {
        let win = new BrowserWindow({
            width: 1000, height: 700,
            backgroundColor: '#050505',
            webPreferences: { partition, contextIsolation: true, nodeIntegration: false }
        });
        win.setMenu(null);
        win.loadURL(url);
        return { status: 'success' };
    });

    // 🔥 HANDLER PARA AÇÕES DOS BOTÕES FLUTUANTES
    ipcMain.on('floating-button-action', async (event, { action, profileId }) => {
        console.log(`🎛️ [OVERLAY] Ação: ${action} para perfil ${profileId}`);

        const instance = activePuppeteerInstances.get(profileId);
        if (!instance) {
            console.log(`⚠️ [OVERLAY] Instância não encontrada para ${profileId}`);
            return;
        }

        const { browser, page } = instance;

        try {
            switch (action) {
                case 'close':
                    await browser.close().catch(() => { });
                    activePuppeteerInstances.delete(profileId);
                    console.log(`✅ [OVERLAY] Browser fechado via botão flutuante`);
                    break;
                case 'back':
                    if (page) await page.goBack().catch(() => { });
                    break;
                case 'forward':
                    if (page) await page.goForward().catch(() => { });
                    break;
                case 'reload':
                    if (page) await page.reload().catch(() => { });
                    break;
            }
        } catch (err) {
            console.error(`❌ [OVERLAY] Erro na ação ${action}:`, err.message);
        }
    });

    // ========== 🧩 SISTEMA DE GERENCIAMENTO DE EXTENSÕES ==========

    // 📋 LISTAR TODAS AS EXTENSÕES INSTALADAS (embutidas + do usuário)
    ipcMain.handle('get-installed-extensions', async () => {
        try {
            const extensions = [];

            // 1. Extensões embutidas
            const builtinDir = getExtensionsPath();
            if (builtinDir) {
                const subdirs = fs.readdirSync(builtinDir);
                for (const subdir of subdirs) {
                    const extFullPath = path.join(builtinDir, subdir);
                    const manifestPath = path.join(extFullPath, 'manifest.json');
                    if (fs.statSync(extFullPath).isDirectory() && fs.existsSync(manifestPath)) {
                        extensions.push(getExtensionMeta(extFullPath, subdir, 'builtin'));
                    }
                }
            }

            // 2. Extensões do usuário
            const userExtDir = getUserExtensionsPath();
            const subdirs = fs.readdirSync(userExtDir);
            for (const subdir of subdirs) {
                if (subdir === 'extensions-config.json') continue;
                const extFullPath = path.join(userExtDir, subdir);
                const manifestPath = path.join(extFullPath, 'manifest.json');
                if (fs.statSync(extFullPath).isDirectory() && fs.existsSync(manifestPath)) {
                    extensions.push(getExtensionMeta(extFullPath, subdir, 'user'));
                }
            }

            console.log(`🧩 [EXTENSÕES] Total listadas: ${extensions.length}`);
            return { status: 'success', extensions };
        } catch (err) {
            console.error('❌ [EXTENSÕES] Erro ao listar:', err.message);
            return { status: 'error', message: err.message, extensions: [] };
        }
    });

    // 📦 INSTALAR EXTENSÃO (abre dialog para selecionar .zip ou .crx)
    ipcMain.handle('install-extension', async () => {
        try {
            // Abre o dialog para selecionar arquivo
            const result = await dialog.showOpenDialog(mainWindow, {
                title: 'Selecionar Extensão do Chrome',
                filters: [
                    { name: 'Extensões Chrome', extensions: ['zip', 'crx'] },
                    { name: 'Todos os arquivos', extensions: ['*'] }
                ],
                properties: ['openFile']
            });

            if (result.canceled || !result.filePaths[0]) {
                return { status: 'cancelled' };
            }

            const filePath = result.filePaths[0];
            const fileName = path.basename(filePath);
            console.log(`📦 [EXTENSÕES] Instalando: ${fileName}`);

            const userExtDir = getUserExtensionsPath();

            // Descompacta o arquivo
            const zip = new AdmZip(filePath);
            const entries = zip.getEntries();

            // Detecta se o manifest.json está na raiz ou dentro de uma subpasta
            let manifestEntry = entries.find(e => e.entryName === 'manifest.json');
            let rootPrefix = '';

            if (!manifestEntry) {
                // Procura manifest.json dentro de uma subpasta (ex: extension-folder/manifest.json)
                manifestEntry = entries.find(e => e.entryName.endsWith('/manifest.json') && e.entryName.split('/').length === 2);
                if (manifestEntry) {
                    rootPrefix = manifestEntry.entryName.replace('manifest.json', '');
                }
            }

            if (!manifestEntry) {
                return { status: 'error', message: 'Arquivo inválido! Não contém manifest.json' };
            }

            // Lê o manifest para extrair o nome
            const manifestContent = JSON.parse(manifestEntry.getData().toString('utf8'));
            const extName = (manifestContent.name || fileName.replace(/\.(zip|crx)$/i, ''))
                .replace(/[^a-zA-Z0-9_\-\s]/g, '')
                .trim()
                .replace(/\s+/g, '-');

            const targetDir = path.join(userExtDir, extName);

            // Se já existe, remove antes de reinstalar
            if (fs.existsSync(targetDir)) {
                fs.rmSync(targetDir, { recursive: true, force: true });
            }

            fs.mkdirSync(targetDir, { recursive: true });

            // Extrai os arquivos
            if (rootPrefix) {
                // Arquivos estão dentro de subpasta, extrai com ajuste de caminho
                for (const entry of entries) {
                    if (entry.isDirectory) continue;
                    if (!entry.entryName.startsWith(rootPrefix)) continue;
                    const relativePath = entry.entryName.substring(rootPrefix.length);
                    const destPath = path.join(targetDir, relativePath);
                    const destDir = path.dirname(destPath);
                    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
                    fs.writeFileSync(destPath, entry.getData());
                }
            } else {
                // Tudo na raiz, extrai direto
                zip.extractAllTo(targetDir, true);
            }

            // Ativa a extensão por padrão
            const config = getExtensionsConfig();
            config[extName] = { enabled: true, installedAt: Date.now() };
            saveExtensionsConfig(config);

            const meta = getExtensionMeta(targetDir, extName, 'user');
            console.log(`✅ [EXTENSÕES] Instalada com sucesso: ${meta.name} v${meta.version}`);

            return { status: 'success', extension: meta };
        } catch (err) {
            console.error('❌ [EXTENSÕES] Erro ao instalar:', err.message);
            return { status: 'error', message: err.message };
        }
    });

    // 🗑️ REMOVER EXTENSÃO DO USUÁRIO
    ipcMain.handle('remove-extension', async (event, extensionId) => {
        try {
            const userExtDir = getUserExtensionsPath();
            const extPath = path.join(userExtDir, extensionId);

            if (!fs.existsSync(extPath)) {
                return { status: 'error', message: 'Extensão não encontrada' };
            }

            // Remove o diretório
            fs.rmSync(extPath, { recursive: true, force: true });

            // Remove do config
            const config = getExtensionsConfig();
            delete config[extensionId];
            saveExtensionsConfig(config);

            console.log(`🗑️ [EXTENSÕES] Removida: ${extensionId}`);
            return { status: 'success' };
        } catch (err) {
            console.error('❌ [EXTENSÕES] Erro ao remover:', err.message);
            return { status: 'error', message: err.message };
        }
    });

    // 🔄 ATIVAR/DESATIVAR EXTENSÃO
    ipcMain.handle('toggle-extension', async (event, extensionId, enabled) => {
        try {
            const config = getExtensionsConfig();
            if (!config[extensionId]) {
                config[extensionId] = {};
            }
            config[extensionId].enabled = enabled;
            saveExtensionsConfig(config);

            console.log(`🔄 [EXTENSÕES] ${extensionId}: ${enabled ? 'ATIVADA' : 'DESATIVADA'}`);
            return { status: 'success', enabled };
        } catch (err) {
            console.error('❌ [EXTENSÕES] Erro ao alternar:', err.message);
            return { status: 'error', message: err.message };
        }
    });

    // 🔽 MINIMIZAR JANELA
    ipcMain.handle('minimize-window', async (event) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (win) win.minimize();
    });
}

function createMainWindow() {
    Menu.setApplicationMenu(null);
    mainWindow = new BrowserWindow({
        width: 1400, height: 900, backgroundColor: '#050505',
        webPreferences: {
            nodeIntegration: false, contextIsolation: true,
            preload: path.join(__dirname, 'preload.js'),
            webviewTag: true, webSecurity: false
        },
    });
    if (app.isPackaged) mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
    else mainWindow.loadURL('http://localhost:5173');
}

registerIPCHandlers();
app.whenReady().then(() => {
    // 🔥 CORREÇÃO: Só configura o app depois que ele estiver pronto
    app.setMaxListeners(0);
    createMainWindow();
});

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });