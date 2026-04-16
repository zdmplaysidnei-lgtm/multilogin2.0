const fs = require('fs');
const path = require('path');

const dir = 'C:\\Users\\USER\\Desktop\\FINALZÃO MULTILOGIN';

function getAllFiles(dirPath, arrayOfFiles) {
    const files = fs.readdirSync(dirPath);

    arrayOfFiles = arrayOfFiles || [];

    files.forEach(function (file) {
        if (fs.statSync(dirPath + "/" + file).isDirectory()) {
            if (!['node_modules', '.git', 'release', 'dist', 'build'].includes(file)) {
                arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
            }
        } else {
            if (['.tsx', '.ts', '.html', '.json', '.js'].some(ext => file.endsWith(ext))) {
                arrayOfFiles.push(path.join(dirPath, "/", file));
            }
        }
    });

    return arrayOfFiles;
}

const allFiles = getAllFiles(dir);

let replacementsMade = 0;

for (const filePath of allFiles) {
    // Prevent replacing its own script
    if (filePath.includes('replace-brand.js')) continue;

    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    // General Replacements
    content = content.split('Rateio Flix - Ferramentas Premium').join('Sidnei - Ferramentas Ilimitadas');
    content = content.split('Rateio Flix Premium').join('Sidnei Ferramentas Ilimitadas');
    content = content.split('Rateio Flix').join('Sidnei - Ferramentas Ilimitadas');

    if (filePath.endsWith('package.json')) {
        content = content.split('"name": "rateio-flix"').join('"name": "sidnei-ferramentas-ilimitadas"');
    }

    // App.tsx Color Replacement
    if (filePath.endsWith('App.tsx')) {
        const preserveKeywords = [
            "vpsStatus.connected ? 'text-green-500' : 'text-red-500'",
            "bg-red-500 animate-pulse",
            "stats.onlineMembers, color: 'text-red-500'",
            "u.blocked ? 'bg-red-600 text-white'",
            "u.blocked ? 'bg-red-900/20 text-red-500 border-red-500/30'",
            "bg-red-900/20 hover:bg-red-600 rounded-xl text-red-400 hover:text-white",
            "text-red-500 border-red-500/20 bg-red-500/10",
            "bg-red-600/20 border-red-500 text-red-400 shadow-[0_0_15px_rgba(239,68,68,0.2)]",
            "bg-red-500\"",
            "bg-red-600/10 border border-red-500/20 p-4 rounded-xl flex items-start gap-4",
            "Shield className=\"text-red-500 shrink-0\"",
            "style={{ borderTopColor: '#E50914' }}",
            "Chrome className=\"w-6 h-6 text-red-400\"",
            "border-b-red-500/40",
            "border border-red-500/30 shadow-2xl shadow-red-500/20"
        ];

        let encoded = content;
        preserveKeywords.forEach((kw, i) => {
            encoded = encoded.split(kw).join(`__PRESERVE_${i}__`);
        });

        encoded = encoded.replace(/red-400/g, 'purple-400');
        encoded = encoded.replace(/red-500/g, 'purple-500');
        encoded = encoded.replace(/red-600/g, 'purple-600');
        encoded = encoded.replace(/red-700/g, 'purple-700');
        encoded = encoded.replace(/red-900/g, 'purple-900');

        preserveKeywords.forEach((kw, i) => {
            encoded = encoded.split(`__PRESERVE_${i}__`).join(kw);
        });

        content = encoded;
    }

    // ProfileCard Color Replacements just in case
    if (filePath.endsWith('ProfileCard.tsx')) {
        content = content.replace(/#E50914/g, '#9333EA');
        content = content.replace(/#FECACA/g, '#D8B4FE');
        content = content.replace(/#B20710/g, '#7E22CE');
    }

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        replacementsMade++;
        console.log(`Updated ${path.basename(filePath)}`);
    }
}

console.log(`Done. Updated ${replacementsMade} files.`);
