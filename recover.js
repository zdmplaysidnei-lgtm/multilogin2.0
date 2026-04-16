const fs = require('fs');
const path = require('path');
const CryptoJS = require('crypto-js');

const SECRET_KEY = "nebula-vps-super-secret-key-v1";
const APPDATA = process.env.APPDATA || (process.platform === 'darwin' ? process.env.HOME + '/Library/Application Support' : process.env.HOME + '/.config');
const LEVELDB_DIR = path.join(APPDATA, 'Sidnei - Ferramentas Ilimitadas', 'Local Storage', 'leveldb');

console.log('Lendo pasta LevelDB:', LEVELDB_DIR);

if (!fs.existsSync(LEVELDB_DIR)) {
    console.error("Pasta LevelDB não encontrada!");
    process.exit(1);
}

const files = fs.readdirSync(LEVELDB_DIR).filter(f => f.endsWith('.log') || f.endsWith('.ldb'));
let maxUsers = [];

const regex = /U2FsdGVkX1[A-Za-z0-9+/=]{100,}/g;

for (const file of files) {
    const filePath = path.join(LEVELDB_DIR, file);
    try {
        console.log('Copiando temporariamente', file);
        const tempPath = path.join(__dirname, 'temp_' + file);
        fs.copyFileSync(filePath, tempPath);

        console.log('Processando', tempPath);
        const content = fs.readFileSync(tempPath, 'latin1');

        let match;
        while ((match = regex.exec(content)) !== null) {
            const cipherText = match[0];
            try {
                const bytes = CryptoJS.AES.decrypt(cipherText, SECRET_KEY);
                const originalText = bytes.toString(CryptoJS.enc.Utf8);
                if (originalText && originalText.startsWith('[') && originalText.includes('"role"')) {
                    const parsed = JSON.parse(originalText);
                    if (Array.isArray(parsed) && parsed.length > maxUsers.length) {
                        console.log(`🚀 Achei um backup com ${parsed.length} usuários!`);
                        maxUsers = parsed;
                    }
                }
            } catch (e) { }
        }

        fs.unlinkSync(tempPath);
    } catch (err) {
        console.error("Erro no arquivo", file, ":", err.message);
    }
}

if (maxUsers.length > 0) {
    fs.writeFileSync('recovered_users.json', JSON.stringify(maxUsers, null, 2));
    console.log(`✅ Sucesso! O maior backup tinha ${maxUsers.length} usuários salvos em recovered_users.json.`);
} else {
    console.log(`❌ Nenhum usuário recuperado.`);
}
