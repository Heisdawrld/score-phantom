import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { Search, X } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { motion, AnimatePresence } from "framer-motion";

interface TeamSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (homeTeamId: string, awayTeamId: string, homeTeamName: string, awayTeamName: string) => void;
}

export function MatchSelectorModal({ isOpen, onClose, onSelect }: TeamSelectorModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [step, setStep] = useState<"HOME" | "AWAY">("HOME");
  const [selectedHome, setSelectedHome] = useState<{ id: string; name: string } | null>(null);

  const { data: teams, isLoading } = useQuery({
    queryKey: ["/api/teams"],
    queryFn: () => fetchApi("/teams"),
    enabled: isOpen,
    staleTime: 1000 * 60 * 60 * 24, // 24 hours
  });

  const filteredTeams = teams?.filter((t: any) => {
    const searchStr = searchQuery.toLowerCase();
    return (
      t.team_name?.toLowerCase().includes(searchStr) ||
      t.league_name?.toLowerCase().includes(searchStr)
    );
  });

  const handleSelectTeam = (team: { team_id: number; team_name: string }) => {
    if (step === "HOME") {
      setSelectedHome({ id: team.team_id.toString(), name: team.team_name });
      setStep("AWAY");
      setSearchQuery("");
    } else {
      if (selectedHome) {
        onSelect(selectedHome.id, team.team_id.toString(), selectedHome.name, team.team_name);
        // Reset state for next time
        setTimeout(() => {
          setStep("HOME");
          setSelectedHome(null);
          setSearchQuery("");
        }, 300);
      }
    }
  };

  const handleClose = () => {
    setStep("HOME");
    setSelectedHome(null);
    setSearchQuery("");
    onClose();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-background/80 backdrop-blur-sm"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            className="w-full max-w-lg bg-[#0a0f16]/95 backdrop-blur-2xl border border-white/10 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[85vh] relative"
          >
            <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-transparent pointer-events-none" />
            
            {/* Header */}
            <div className="p-6 border-b border-white/5 flex items-center justify-between relative z-10">
              <div>
                <h2 className="text-xl font-black text-white font-display tracking-widest drop-shadow-md">
                  SELECT <span className="text-primary">{step}</span> TEAM
                </h2>
                {step === "AWAY" && selectedHome && (
                  <div className="flex items-center gap-2 mt-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10 w-fit">
                    <TeamLogo teamId={selectedHome.id} className="w-4 h-4" />
                    <p className="text-[10px] text-white/70 font-bold uppercase tracking-wider">
                      VS {selectedHome.name}
                    </p>
                  </div>
                )}
              </div>
              <button onClick={handleClose} className="p-2 bg-white/5 rounded-full hover:bg-white/10 hover:rotate-90 transition-all duration-300">
                <X className="w-5 h-5 text-white/50 hover:text-white" />
              </button>
            </div>

            {/* Search */}
            <div className="p-6 border-b border-white/5 bg-black/20 relative z-10">
              <div className="relative group">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30 group-focus-within:text-primary transition-colors" />
                <input
                  type="text"
                  placeholder="Search teams or leagues..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-black/60 border border-white/10 rounded-2xl py-4 pl-12 pr-4 text-white placeholder:text-white/30 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-all shadow-inner"
                  autoFocus
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 relative z-10 space-y-2">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 gap-4">
                  <img src="/images/logo.png" className="w-8 h-8 animate-spin opacity-50" alt="Loading" />
                  <p className="text-white/40 font-display tracking-widest text-sm">LOADING TEAMS...</p>
                </div>
              ) : filteredTeams?.length === 0 ? (
                <div className="py-12 text-center text-white/40 font-display tracking-widest text-sm">NO TEAMS FOUND.</div>
              ) : (
                <div className="space-y-2">
                  {filteredTeams?.map((team: any) => (
                    <button
                      key={team.team_id}
                      onClick={() => handleSelectTeam(team)}
                      className="w-full p-4 rounded-2xl bg-white/5 hover:bg-primary/10 border border-transparent hover:border-primary/30 transition-all duration-300 text-left flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-4">
                        <TeamLogo teamId={team.team_id} className="w-10 h-10 drop-shadow-md group-hover:scale-110 transition-transform duration-300" />
                        <div>
                          <span className="text-base font-bold text-white block group-hover:text-primary transition-colors">{team.team_name}</span>
                          <span className="text-[10px] text-white/40 uppercase tracking-widest font-medium">{team.league_name}</span>
                        </div>
                      </div>
                      <div className="w-8 h-8 rounded-full bg-black/40 border border-white/10 group-hover:border-primary/50 flex items-center justify-center transition-all duration-300 shadow-inner">
                        <div className="w-2.5 h-2.5 rounded-full bg-primary opacity-0 group-hover:opacity-100 transition-opacity duration-300 shadow-[0_0_10px_rgba(16,231,116,0.8)]" />
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}