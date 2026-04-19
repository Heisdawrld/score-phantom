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
            className="w-full max-w-lg bg-[#0a0f16] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white font-display tracking-wider">
                  SELECT {step} TEAM
                </h2>
                {step === "AWAY" && selectedHome && (
                  <p className="text-xs text-primary mt-1">
                    Home Team: {selectedHome.name}
                  </p>
                )}
              </div>
              <button onClick={handleClose} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors">
                <X className="w-5 h-5 text-white/50 hover:text-white" />
              </button>
            </div>

            {/* Search */}
            <div className="p-4 border-b border-white/10 bg-white/[0.02]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                <input
                  type="text"
                  placeholder="Search teams or leagues..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl py-3 pl-10 pr-4 text-white placeholder:text-white/30 focus:outline-none focus:border-primary/50 transition-colors"
                  autoFocus
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2">
              {isLoading ? (
                <div className="p-8 text-center text-white/50">Loading teams...</div>
              ) : filteredTeams?.length === 0 ? (
                <div className="p-8 text-center text-white/50">No teams found.</div>
              ) : (
                <div className="space-y-1">
                  {filteredTeams?.map((team: any) => (
                    <button
                      key={team.team_id}
                      onClick={() => handleSelectTeam(team)}
                      className="w-full p-3 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-all text-left flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-3">
                        <TeamLogo teamId={team.team_id} className="w-8 h-8" />
                        <div>
                          <span className="text-sm font-medium text-white block">{team.team_name}</span>
                          <span className="text-[10px] text-white/40 uppercase tracking-wider">{team.league_name}</span>
                        </div>
                      </div>
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-2 h-2 rounded-full bg-primary" />
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