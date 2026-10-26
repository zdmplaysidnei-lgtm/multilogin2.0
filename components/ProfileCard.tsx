import React from 'react';
import { Play, Star, Edit2, Trash2, FileText, Rocket, GripVertical, HelpCircle, ExternalLink, PlayCircle, Cloud } from 'lucide-react';
import { Profile } from '../types';

interface ProfileCardProps {
  profile: Profile;
  onOpen: (profile: Profile) => void;
  onEdit?: (profile: Profile) => void;
  onDelete?: (profile: Profile) => void;
  onToggleFavorite: (profile: Profile) => void;
  onSyncSession?: (profile: Profile) => void; // Admin: Sincronizar sessão para Cloud

  // DRAG & DROP PROPS
  draggable?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  isDragging?: boolean;
}

export const ProfileCard: React.FC<ProfileCardProps> = ({
  profile,
  onOpen,
  onEdit,
  onDelete,
  onToggleFavorite,
  onSyncSession,
  draggable,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging
}) => {
  const isMaintenance = profile.status === 'maintenance';
  const cats = (profile.categories || []).filter(c => !c.startsWith('__flag_')).slice(0, 3);
  const launchModeText = profile.launchMode ? profile.launchMode.split(' ')[0] : (profile.useNativeBrowser ? 'Native' : 'Internal');

  const openTutorial = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!profile.videoTutorial) return;
    let url = profile.videoTutorial.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://' + url;
    }
    const api = (window as any).nebulaAPI;
    if (api?.openExternalUrl) {
      api.openExternalUrl(url).catch(() => window.open(url, '_blank'));
    } else if (api?.openExternal) {
      api.openExternal(url).catch(() => window.open(url, '_blank'));
    } else {
      window.open(url, '_blank');
    }
  };

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`group flex flex-col bg-[#13132a]/90 border border-[#7c3aed]/15 rounded-[16px] p-[18px] gap-3 backdrop-blur-[10px] relative overflow-hidden transition-all duration-200 hover:border-[#7c3aed]/40 hover:-translate-y-[2px] hover:shadow-[0_0_40px_rgba(124,58,237,0.12)]
        ${isDragging ? 'opacity-20 scale-95 border-dashed' : 'opacity-100'} 
        ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
      style={{ fontFamily: "'Inter', sans-serif" }}
    >
      {/* BACKGROUND GLOW */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#7c3aed]/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />

      {/* DRAG AND FAVORITE */}
      {draggable && (
         <div className="absolute top-2 left-2 z-30 p-1 rounded bg-black/60 backdrop-blur-sm border border-white/10 text-gray-400">
           <GripVertical size={14} />
         </div>
      )}
      {/* We keep the favorite button just in case, but subtle */}
      <button
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(profile); }}
        className="absolute top-3 right-3 z-30 p-1.5 rounded-full bg-black/60 hover:bg-black/80 backdrop-blur-sm border border-white/10 transition-colors cursor-pointer hover:scale-110 opacity-0 group-hover:opacity-100"
      >
        <Star className={`w-3 h-3 ${profile.isFavorite ? 'text-yellow-400 fill-yellow-400' : 'text-gray-400'}`} />
      </button>

      {/* COVER */}
      <div className="relative w-full h-[110px] rounded-[10px] flex items-center justify-center text-[36px] overflow-hidden shrink-0" style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.2), rgba(6,6,18,0.8))' }}>
         {profile.coverImage ? (
            <img
               src={profile.coverImage}
               alt={profile.name}
               className={`w-full h-full object-cover rounded-[10px] ${isMaintenance ? 'grayscale opacity-50' : ''}`}
            />
         ) : (
            <span>🌐</span>
         )}
         {profile.videoTutorial && profile.videoTutorial.trim() !== '' && (
            <button
               onClick={openTutorial}
               className="absolute bottom-2 right-2 z-20 flex items-center gap-1 px-2.5 py-1 rounded-full bg-black/80 hover:bg-[#7c3aed] backdrop-blur-md border border-purple-500/40 text-[#c4b5fd] hover:text-white transition-all cursor-pointer hover:scale-105 text-[9px] font-bold shadow-md"
               title="Ver Vídeo Tutorial"
            >
               <PlayCircle size={11} className="text-[#a78bfa]" />
               <span>Tutorial</span>
            </button>
         )}
      </div>

      {/* BODY */}
      <div className="flex flex-col gap-1.5 flex-1 z-10">
         <div className="text-[13px] font-bold text-[#f1f1ff] leading-[1.3] line-clamp-2" title={profile.name}>
            {profile.name || 'Sem nome'}
         </div>
         
         {cats.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1">
               {cats.map(c => (
                  <span key={c} className="text-[9px] font-bold px-[7px] py-[2px] rounded-[8px] bg-[#7c3aed]/15 text-[#a78bfa] border border-[#7c3aed]/20 uppercase">
                     {c}
                  </span>
               ))}
            </div>
         )}

         <div className="flex items-center gap-1.5 text-[11px] mt-auto">
            <div className={`w-[7px] h-[7px] rounded-full shrink-0 ${isMaintenance ? 'bg-[#ef4444]' : 'bg-[#22c55e] shadow-[0_0_6px_rgba(34,197,94,0.4)]'}`}></div>
            <span className="text-[#9090b0]">{isMaintenance ? 'Manutencao' : 'Ativo'}</span>
            <span className="ml-auto text-[9px] text-[#9090b0]">{launchModeText}</span>
         </div>
      </div>

      {/* FOOTER (ABRIR BUTTON + INSTRUÇÕES) */}
      <div className="flex gap-2 mt-1 z-10 items-center">
         <button
            onClick={() => onOpen(profile)}
            disabled={isMaintenance}
            className="flex-1 p-2 text-white border-none rounded-[8px] text-[11px] font-bold cursor-pointer transition-all hover:opacity-85 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center shadow-md active:scale-95"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', fontFamily: "'Inter', sans-serif" }}
         >
            {isMaintenance ? 'Indisponível' : 'Abrir'}
         </button>

         {profile.videoTutorial && profile.videoTutorial.trim() !== '' && (
            <button
               onClick={openTutorial}
               title="Ver Instruções / Vídeo Tutorial"
               className="px-2.5 py-2 rounded-[8px] text-[11px] font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer bg-[#7c3aed]/15 hover:bg-[#7c3aed]/30 text-[#c4b5fd] hover:text-white border border-[#7c3aed]/40 hover:border-[#7c3aed]/70 shadow-sm active:scale-95 shrink-0"
               style={{ fontFamily: "'Inter', sans-serif" }}
            >
               <PlayCircle size={14} className="text-[#a78bfa]" />
               <span>Instruções</span>
            </button>
         )}
      </div>

      {/* ADMIN CONTROLS (ONLY SHOWS FOR ADMIN - Hidden in typical UI, but useful if they ever hover and hold admin rights) */}
      {(onEdit || onDelete || onSyncSession) && (
        <div className="flex items-center gap-2 pt-3 border-t border-gray-800/50 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onSyncSession && (
            <button
              onClick={(e) => { e.stopPropagation(); onSyncSession(profile); }}
              className="flex-1 py-1.5 rounded bg-emerald-950/60 hover:bg-emerald-800 text-emerald-400 hover:text-white text-[9px] font-bold transition-all flex items-center justify-center gap-1 border border-emerald-500/30 cursor-pointer"
              title="Abrir ferramenta para logar e salvar sessão no Supabase"
            >
              <Cloud size={11} />
              GRAVAR SESSÃO
            </button>
          )}
          {onEdit && (
            <button
              onClick={(e) => { e.stopPropagation(); onEdit(profile); }}
              className="flex-1 py-1.5 rounded bg-[#252525] hover:bg-[#333] text-gray-400 hover:text-white text-[9px] font-bold transition-colors flex items-center justify-center border border-white/5 cursor-pointer"
            >
              EDITAR
            </button>
          )}
        </div>
      )}
    </div>
  );
};