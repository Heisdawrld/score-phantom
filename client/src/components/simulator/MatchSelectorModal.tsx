import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchApi } from "@/lib/api";
import { Search, X, Calendar } from "lucide-react";
import { TeamLogo } from "@/components/TeamLogo";
import { motion, AnimatePresence } from "framer-motion";

interface MatchSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (fixtureId: string, homeTeamId: string, awayTeamId: string, matchName: string) => void;
}

export function MatchSelectorModal({ isOpen, onClose, onSelect }: MatchSelectorModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const { data: upcomingFixtures, isLoading } = useQuery({
    queryKey: ["/api/fixtures/upcoming"],
    queryFn: () => fetchApi("/fixtures?status=NS&limit=50"),
    enabled: isOpen,
  });

  const filteredFixtures = upcomingFixtures?.filter((f: any) => {
    const searchStr = searchQuery.toLowerCase();
    return (
      f.home_team_name?.toLowerCase().includes(searchStr) ||
      f.away_team_name?.toLowerCase().includes(searchStr) ||
      f.league_name?.toLowerCase().includes(searchStr)
    );
  });

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
              <h2 className="text-lg font-bold text-white font-display tracking-wider">SELECT MATCH</h2>
              <button onClick={onClose} className="p-2 bg-white/5 rounded-full hover:bg-white/10 transition-colors">
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
                />
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-2">
              {isLoading ? (
                <div className="p-8 text-center text-white/50">Loading matches...</div>
              ) : filteredFixtures?.length === 0 ? (
                <div className="p-8 text-center text-white/50">No upcoming matches found.</div>
              ) : (
                <div className="space-y-2">
                  {filteredFixtures?.map((fixture: any) => (
                    <button
                      key={fixture.id}
                      onClick={() => onSelect(
                        fixture.id.toString(), 
                        fixture.home_team_id.toString(), 
                        fixture.away_team_id.toString(),
                        `${fixture.home_team_name} vs ${fixture.away_team_name}`
                      )}
                      className="w-full p-3 rounded-xl hover:bg-white/5 border border-transparent hover:border-white/10 transition-all text-left flex items-center gap-3 group"
                    >
                      <div className="flex-1 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 justify-end">
                          <span className="text-sm font-medium text-white truncate">{fixture.home_team_name}</span>
                          <TeamLogo teamId={fixture.home_team_id} className="w-6 h-6" />
                        </div>
                        <div className="px-2 text-xs font-bold text-white/30">VS</div>
                        <div className="flex items-center gap-2 flex-1 justify-start">
                          <TeamLogo teamId={fixture.away_team_id} className="w-6 h-6" />
                          <span className="text-sm font-medium text-white truncate">{fixture.away_team_name}</span>
                        </div>
                      </div>
                      <div className="w-8 flex justify-end">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronRight className="w-4 h-4 text-primary" />
                        </div>
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
// Placeholder to fix missing import in the main component
import { ChevronRight } from "lucide-react";