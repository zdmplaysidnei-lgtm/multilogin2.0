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

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`group flex flex-col bg-[#1a1a1a] rounded-xl overflow-hidden border border-gray-800 hover:border-[#E50914]/50 transition-all duration-300 hover:shadow-[0_0_30px_rgba(229,9,20,0.15)] h-[340px] relative
        ${isDragging ? 'opacity-20 scale-95 border-dashed border-[#E50914]' : 'opacity-100'} 
        ${draggable ? 'cursor-grab active:cursor-grabbing' : ''}`}
    >

      {/* Topo: Imagem */}
      <div className="relative h-[140px] w-full shrink-0 overflow-hidden bg-gray-900 border-b border-gray-800">
        <img
          src={profile.coverImage}
          alt={profile.name}
          className={`w-full h-full object-cover transition-transform duration-700 group-hover:scale-110 ${isMaintenance ? 'grayscale opacity-50' : 'opacity-100'}`}
        />

        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(profile); }}
          className="absolute top-2 right-2 z-30 p-1.5 rounded-full bg-black/40 hover:bg-black/60 backdrop-blur-sm border border-white/10 transition-colors cursor-pointer hover:scale-110"
        >
          <Star className={`w-3.5 h-3.5 ${profile.isFavorite ? 'text-yellow-400 fill-yellow-400' : 'text-gray-400'}`} />
        </button>

        {draggable && (
          <div className="absolute top-2 left-2 z-30 p-1 rounded bg-black/40 backdrop-blur-sm border border-white/10 text-gray-400">
            <GripVertical size={14} />
          </div>
        )}

        <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] to-transparent opacity-60"></div>
      </div>

      {/* Info & Ações */}
      <div className="flex-1 flex flex-col p-4 bg-[#1a1a1a] relative">

        {/* Título */}
        <div className="mb-3">
          <h3 className="font-bold text-base text-gray-100 truncate group-hover:text-[#FECACA] transition-colors" title={profile.name}>
            {profile.name}
          </h3>
          {profile.orderIndex !== undefined && (
            <span className="text-[8px] font-black text-gray-600 uppercase tracking-tighter">ORDEM: #{profile.orderIndex}</span>
          )}
        </div>

        {/* Status & Instruções (Mesma linha) */}
        <div className="flex items-center justify-between mb-4">
          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border flex items-center gap-1 ${isMaintenance ? 'bg-[#E50914]/20 text-[#FECACA] border-red-900/30' : 'bg-green-900/20 text-green-400 border-green-500/30'}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${isMaintenance ? 'bg-[#E50914]' : 'bg-green-500 animate-pulse'}`}></span>
            {isMaintenance ? 'Manutenção' : 'Ativo'}
          </span>

          {/* BOTÃO INSTRUÇÕES (POSICIONADO À DIREITA) */}
          {profile.videoTutorial && (
            <a
              href={profile.videoTutorial}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1.5 px-3 py-1 bg-blue-600/10 border border-blue-500/20 rounded-lg text-blue-400 hover:bg-blue-600 hover:text-white transition-all text-[9px] font-black uppercase whitespace-nowrap shadow-lg shadow-blue-900/10"
              onClick={(e) => e.stopPropagation()}
            >
              <PlayCircle size={12} /> Instruções
            </a>
          )}
        </div>

        {/* Botão INICIAR — Estilo pill roxo com borda interna fina e efeitos de glow */}
        <button
          onClick={() => onOpen(profile)}
          disabled={isMaintenance}
          className={`relative w-full py-3 rounded-full font-bold text-sm tracking-wider flex items-center justify-center gap-2 transition-all duration-300 transform active:scale-95 group/btn mb-3 overflow-hidden
            ${isMaintenance
              ? 'bg-gray-800 text-gray-500 cursor-not-allowed border border-gray-700'
              : 'bg-gradient-to-r from-[#E50914] via-[#E50914] to-[#B20710] text-white shadow-[0_0_25px_rgba(229,9,20,0.5)] hover:shadow-[0_0_40px_rgba(229,9,20,0.7)] hover:scale-[1.03] hover:brightness-110'
            }`}
        >
          {/* Borda interna fina com efeito de glow ao hover */}
          {!isMaintenance && (
            <span className="absolute inset-[2px] rounded-full border border-white/30 transition-all duration-300 group-hover/btn:border-white/60 group-hover/btn:shadow-[inset_0_0_12px_rgba(255,255,255,0.2)]" />
          )}
          <span className="relative z-10 flex items-center gap-2">
            {isMaintenance ? 'Indisponível' : <><Rocket className="w-4 h-4" /> INICIAR</>}
          </span>
        </button>

        {/* Controles Admin */}
        {(onEdit || onDelete || onSyncSession) && (
          <div className="flex items-center gap-2 pt-3 border-t border-gray-800/50 mt-auto">
            {onSyncSession && profile.useNativeBrowser && (
              <button
                onClick={(e) => { e.stopPropagation(); onSyncSession(profile); }}
                title="Sincronizar sessão do Chrome nativo para a Cloud"
                className="px-3 py-1.5 rounded bg-cyan-900/10 hover:bg-cyan-600 text-cyan-400 hover:text-white text-[9px] font-bold transition-colors flex items-center justify-center gap-1.5 border border-cyan-500/20"
              >
                <Cloud className="w-3 h-3" /> SYNC
              </button>
            )}
            {onEdit && (
              <button
                onClick={(e) => { e.stopPropagation(); onEdit(profile); }}
                className="flex-1 py-1.5 rounded bg-[#252525] hover:bg-[#333] text-gray-400 hover:text-white text-[10px] font-bold transition-colors flex items-center justify-center gap-1.5 border border-white/5"
              >
                <Edit2 className="w-3 h-3" /> CONFIGURAR
              </button>
            )}
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(profile); }}
                className="px-3 py-1.5 rounded bg-red-900/10 hover:bg-red-900/30 text-[#E50914] hover:text-[#FECACA] transition-colors border border-red-900/20"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};