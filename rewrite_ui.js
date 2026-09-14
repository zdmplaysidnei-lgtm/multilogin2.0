const fs = require('fs');
const path = require('path');

const appTsxPath = path.join(__dirname, 'App.tsx');
let content = fs.readFileSync(appTsxPath, 'utf8');

let actualStartIndex = content.indexOf('   return (', content.indexOf('if (isAppLoading && !profiles.length) return') + 50);

const endIndex = content.indexOf(`            {activeTab === 'users' && (`, actualStartIndex);

if (actualStartIndex === -1 || endIndex === -1) {
  console.log("Could not find bounds");
  process.exit(1);
}

const newUI = `   return (
      <div className="min-h-screen bg-[#060612] text-[#f1f1ff] flex flex-col font-sans overflow-y-auto custom-scrollbar relative" style={{ backgroundImage: "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(124,58,237,0.15) 0%, transparent 60%), radial-gradient(ellipse 40% 30% at 100% 100%, rgba(59,130,246,0.08) 0%, transparent 50%)" }}>
         <ParticleBackground effect={settings?.seasonalEffect} />

         <div id="header" className="flex items-center justify-between p-4 px-7 bg-[#0d0d1f]/95 border-b border-[#7c3aed]/15 backdrop-blur-xl sticky top-0 z-[100]">
            <div className="flex items-center gap-3">
               <div className="w-10 h-10 bg-gradient-to-br from-[#7c3aed] to-[#4f46e5] rounded-[10px] flex items-center justify-center text-xl shadow-[0_0_20px_rgba(124,58,237,0.4)] overflow-hidden shrink-0">
                  <img src="/mascot.png" alt="Mascote" className="w-full h-full object-cover" />
               </div>
               <div>
                  <div className="text-[18px] font-black bg-gradient-to-br from-[#a78bfa] to-[#7c3aed] bg-clip-text text-transparent">
                     Sidnei Ferramentas Ilimitadas
                  </div>
                  <div className="text-[10px] text-[#9090b0] font-medium flex items-center gap-2">
                     Admin Blindado — Powered by Supabase
                     {isAdmin && (
                        <div className="flex gap-2 ml-2 border-l border-white/10 pl-2">
                           <button onClick={() => setActiveTab('profiles')} className={activeTab === 'profiles' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}>Perfis</button>
                           <button onClick={() => setActiveTab('users')} className={activeTab === 'users' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}>Membros</button>
                           <button onClick={() => setActiveTab('settings')} className={activeTab === 'settings' ? 'text-white' : 'text-gray-500 hover:text-gray-300'}>Sistema</button>
                        </div>
                     )}
                  </div>
               </div>
            </div>
            
            <div className="flex items-center gap-4">
               <div className={\`flex items-center gap-2 px-4 py-1.5 rounded-full text-[11px] font-bold border \${vpsStatus.connected ? 'border-green-500/30 bg-green-500/10 text-green-500' : 'border-red-500/30 bg-red-500/10 text-red-500'}\`}>
                  <div className={\`w-2 h-2 rounded-full \${vpsStatus.connected ? 'bg-green-500 shadow-[0_0_8px_#22c55e]' : 'bg-red-500 animate-pulse'}\`}></div>
                  {vpsStatus.connected ? 'SUPABASE CLOUD ON' : 'OFFLINE MODE'}
               </div>
               
               <div className="flex items-center gap-3 bg-white/5 px-3 py-1.5 rounded-xl border border-white/10">
                  <div className="flex flex-col text-right">
                     <span className="font-bold text-[11px] truncate max-w-[120px]">{currentUser?.email}</span>
                     <span className="text-[#a78bfa] text-[9px] font-black uppercase">{currentUser?.role}</span>
                  </div>
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#7c3aed] to-[#6d28d9] flex items-center justify-center font-black text-[12px]">{currentUser?.email?.[0].toUpperCase()}</div>
               </div>
               <button onClick={handleLogout} className="p-2 bg-red-900/20 text-red-400 rounded-lg border border-red-500/20 hover:bg-red-600 hover:text-white transition-all">
                  <LogOut size={16} />
               </button>
            </div>
         </div>

         <main className="flex-1 w-full relative z-10">
            {activeTab === 'profiles' && (
               <div className="w-full flex flex-col">
                  <div id="toolbar" className="flex items-center gap-3 py-3.5 px-7 bg-[#0d0d1f]/70 border-b border-[#7c3aed]/15 flex-wrap">
                     <div className="relative flex-1 min-w-[200px] max-w-[420px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9090b0]" size={14} />
                        <input 
                           className="w-full bg-[#13132a] border border-[#7c3aed]/15 rounded-[10px] py-2 px-3 pl-9 text-[#f1f1ff] text-[13px] outline-none transition-colors focus:border-[#7c3aed] font-sans"
                           placeholder="Buscar ferramenta..." 
                           value={searchTerm}
                           onChange={e => setSearchTerm(e.target.value)}
                        />
                     </div>
                     <div className="flex gap-1.5 flex-wrap items-center">
                        <button onClick={() => setSelectedCategory('all')} className={\`px-3.5 py-1.5 rounded-[20px] text-[11px] font-bold border transition-colors \${selectedCategory === 'all' ? 'bg-[#7c3aed] border-[#7c3aed] text-white' : 'bg-transparent border-[#7c3aed]/15 text-[#9090b0] hover:bg-[#7c3aed]/20 hover:border-[#7c3aed]/50'}\`}>Todos</button>
                        <button onClick={() => setSelectedCategory('active')} className={\`px-3.5 py-1.5 rounded-[20px] text-[11px] font-bold border transition-colors \${selectedCategory === 'active' ? 'bg-[#7c3aed] border-[#7c3aed] text-white' : 'bg-transparent border-[#7c3aed]/15 text-[#9090b0] hover:bg-[#7c3aed]/20 hover:border-[#7c3aed]/50'}\`}>Ativos</button>
                        <button onClick={() => setSelectedCategory('maintenance')} className={\`px-3.5 py-1.5 rounded-[20px] text-[11px] font-bold border transition-colors \${selectedCategory === 'maintenance' ? 'bg-[#7c3aed] border-[#7c3aed] text-white' : 'bg-transparent border-[#7c3aed]/15 text-[#9090b0] hover:bg-[#7c3aed]/20 hover:border-[#7c3aed]/50'}\`}>Manutencao</button>
                        
                        {(settings?.categories || []).map(cat => (
                           <button key={cat} onClick={() => setSelectedCategory(cat)} className={\`px-3.5 py-1.5 rounded-[20px] text-[11px] font-bold border transition-colors \${selectedCategory === cat ? 'bg-[#7c3aed] border-[#7c3aed] text-white' : 'bg-transparent border-[#7c3aed]/15 text-[#9090b0] hover:bg-[#7c3aed]/20 hover:border-[#7c3aed]/50'}\`}>{cat}</button>
                        ))}
                     </div>
                     
                     <div className="ml-auto flex gap-2 items-center">
                        <button onClick={() => setFilterType(filterType === 'favorites' ? 'all' : 'favorites')} className={\`relative flex items-center justify-center p-2 rounded-[10px] border transition-colors \${filterType === 'favorites' ? 'bg-[#7c3aed] text-white border-[#7c3aed]' : 'bg-[#7c3aed]/15 text-[#a78bfa] border-[#7c3aed]/30 hover:bg-[#7c3aed]/25'}\`}>
                           <Star size={14} className={filterType === 'favorites' ? "fill-current" : ""} />
                           {currentUser?.favorites?.length > 0 && (
                              <span className="absolute -top-1.5 -right-1.5 bg-yellow-500 text-black text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center">
                                 {currentUser.favorites.length}
                              </span>
                           )}
                        </button>
                        <a href={currentSupportLink} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 px-3 py-2 bg-[#7c3aed]/15 text-[#a78bfa] rounded-[10px] border border-[#7c3aed]/30 text-[12px] font-bold hover:bg-[#7c3aed]/25 transition-colors">
                           <HelpCircle size={14} /> Suporte
                        </a>
                        <button onClick={handleManualSync} className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-br from-[#7c3aed] to-[#6d28d9] text-white rounded-[10px] border-none text-[12px] font-bold hover:opacity-85 transition-opacity">
                           <RefreshCw size={14} className={isAppLoading ? "animate-spin" : ""} /> Atualizar
                        </button>
                        {isAdmin && (
                           <button onClick={() => { setEditingProfile(null); setModalSelectedCategories([]); setShowProfileModal(true); }} className="flex items-center gap-1.5 px-3 py-2 bg-gradient-to-br from-green-500 to-green-600 text-white rounded-[10px] border-none text-[12px] font-bold hover:opacity-85 transition-opacity">
                              <Plus size={14} /> Nova Ferramenta
                           </button>
                        )}
                     </div>
                  </div>

                  <div id="statsbar" className="flex gap-5 py-2.5 px-7 border-b border-[#7c3aed]/15 bg-[#0d0d1f]/50 flex-wrap">
                     <div className="flex items-center gap-1.5 text-[11px] text-[#9090b0]">Total: <b className="text-[#f1f1ff] text-[14px] font-bold">{profiles.length}</b></div>
                     <div className="flex items-center gap-1.5 text-[11px] text-[#9090b0]">Ativos: <b className="text-[#22c55e] text-[14px] font-bold">{profiles.filter(p=>p.status!=='maintenance').length}</b></div>
                     <div className="flex items-center gap-1.5 text-[11px] text-[#9090b0]">Manutencao: <b className="text-[#ef4444] text-[14px] font-bold">{profiles.filter(p=>p.status==='maintenance').length}</b></div>
                     <div className="flex items-center gap-1.5 text-[11px] text-[#9090b0]">Exibindo: <b className="text-[#f1f1ff] text-[14px] font-bold">{filteredProfiles.length}</b></div>
                  </div>

                  <div className="p-7 pb-32">
                     <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-[14px]">
                        {filteredProfiles.slice(0, visibleProfilesCount).map((p, idx) => (
                           <ProfileCard
                              key={p.id}
                              profile={{ ...p, isFavorite: currentUser?.favorites?.includes(p.id) || false }}
                              onOpen={handleLaunchProfile}
                              onEdit={isAdmin ? (async (prof) => {
                                 setToast({ msg: 'Carregando dados completos do perfil...', type: 'info' });
                                 try {
                                    const { data: fullData, error } = await supabase.from('profiles').select('cookies, localStorage, automationScript').eq('id', prof.id).single();
                                    if (!error && fullData) { prof = { ...prof, ...fullData }; }
                                 } catch (e) { console.warn('Erro ao carregar dados extras:', e); }
                                 setToast(null);
                                 setEditingProfile(prof);
                                 setModalSelectedCategories(prof.categories || []);
                                 if (prof.proxy) {
                                    const protoMatch = prof.proxy.match(/^(https?|socks5?):\\/\\//i);
                                    const proto = protoMatch ? protoMatch[1].toLowerCase() : 'http';
                                    setProxyProtocol(proto);
                                    const withoutProto = prof.proxy.replace(/^(https?|socks5?):\\/\\//i, '');
                                    const authMatch = withoutProto.match(/^([^:]+):([^@]+)@(.+)$/);
                                    if (authMatch) {
                                       const [, user, pass, hostPort] = authMatch;
                                       const [ip, port] = hostPort.split(':');
                                       setProxyInput(\`\${ip}:\${port}:\${user}:\${pass}\`);
                                    } else {
                                       setProxyInput(withoutProto);
                                    }
                                 } else {
                                    setProxyInput('');
                                 }
                                 setShowProfileModal(true);
                              }) : undefined}
                              onDelete={isAdmin ? (prof => handleDeleteProfile(prof.id)) : undefined}
                              onSyncSession={isAdmin ? handleCaptureNativeSession : undefined}
                              onToggleFavorite={prof => { const favs = currentUser?.favorites?.includes(prof.id) ? currentUser.favorites.filter(id => id !== prof.id) : [...(currentUser?.favorites || []), prof.id]; const up = { ...currentUser!, favorites: favs }; setCurrentUser(up); DataService.updateSingleUser(up); }}
                              draggable={isAdmin}
                              onDragStart={() => onDragStart(idx)}
                              onDragOver={(e) => onDragOver(e, idx)}
                              onDrop={() => onDrop(idx)}
                              isDragging={draggedItemIndex === idx}
                           />
                        ))}
                     </div>

                     {filteredProfiles.length > visibleProfilesCount && (
                        <div className="flex justify-center mt-10">
                           <button onClick={() => setVisibleProfilesCount(prev => prev + 20)} className="px-8 py-3 bg-[#13132a] border border-[#7c3aed]/30 rounded-xl text-[#a78bfa] font-bold hover:bg-[#7c3aed]/20 transition-all flex items-center gap-2 shadow-[0_0_20px_rgba(124,58,237,0.1)]">
                              <ChevronDown size={18} /> Carregar Mais Perfis
                           </button>
                        </div>
                     )}
                  </div>
                  
                  {runningProfiles.length > 0 && (
                     <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-[#0d0d1f]/90 backdrop-blur-xl border border-[#7c3aed]/30 p-2 rounded-2xl shadow-[0_0_30px_rgba(124,58,237,0.2)] z-[200] flex items-center gap-3">
                        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar max-w-[400px] px-2">
                           {runningProfiles.map(p => (
                              <div key={p.id} onClick={() => setActiveProfileId(p.id)} className={\`relative w-12 h-12 rounded-xl overflow-hidden cursor-pointer transition-all border-2 flex-shrink-0 \${activeProfileId === p.id ? 'border-[#7c3aed] shadow-[0_0_15px_rgba(124,58,237,0.5)]' : 'border-transparent opacity-60'}\`}>
                                 <img src={p.coverImage} className="w-full h-full object-cover" />
                                 <button onClick={e => { e.stopPropagation(); setRunningProfiles(prev => prev.filter(x => x.id !== p.id)); if (activeProfileId === p.id) setActiveProfileId(null); }} className="absolute top-1 right-1 bg-red-600/90 text-white rounded p-0.5"><X size={10} /></button>
                              </div>
                           ))}
                        </div>
                        <button onClick={() => setRunningProfiles([])} className="p-3 bg-red-900/40 text-red-400 hover:bg-red-600 hover:text-white transition-all rounded-xl shadow-xl"><Power size={18} /></button>
                     </div>
                  )}
               </div>
            )}

`;

const newContent = content.substring(0, actualStartIndex) + newUI + content.substring(endIndex);

fs.writeFileSync(appTsxPath, newContent);
console.log("Successfully rewritten App.tsx dashboard UI!");
