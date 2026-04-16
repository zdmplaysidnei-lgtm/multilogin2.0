const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://fkrijejmvtwwtgirlsey.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZrcmlqZWptdnR3d3RnaXJsc2V5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk1OTgwMTAsImV4cCI6MjA4NTE3NDAxMH0.IOahwdGVSowVMn0FRpz_-EHU8bEv9areX6zY1rM-LdY';
const supabase = createClient(supabaseUrl, supabaseKey);

const usersRow = JSON.parse(fs.readFileSync('recovered_users.json', 'utf8'));

// Filter out duplicate emails locally first
const uniqueUsersMap = new Map();
usersRow.forEach(u => uniqueUsersMap.set(u.email.toLowerCase(), u));
const users = Array.from(uniqueUsersMap.values());

const cleanUser = (u) => JSON.parse(JSON.stringify(u, (k, v) => v === undefined ? null : v));

async function run() {
    const chunkSize = 200;
    let totalSaved = 0;

    for (let i = 0; i < users.length; i += chunkSize) {
        const chunk = users.slice(i, i + chunkSize).map(cleanUser);

        console.log(`Enviando chunk de ${i} até ${i + chunk.length}...`);
        const { data, error } = await supabase.from('users').upsert(chunk, { onConflict: 'email' });

        if (error) {
            console.error('Erro no chunk inteiro, tentando um por um...');
            for (const u of chunk) {
                const { error: err2 } = await supabase.from('users').upsert([u], { onConflict: 'email' });
                if (!err2) totalSaved++;
            }
        } else {
            totalSaved += chunk.length;
        }
    }

    console.log(`\n🎉 CONCLUÍDO! Um total de ${totalSaved} usuários únicos foram sincronizados com a Nuvem de volta!`);
}

run();
