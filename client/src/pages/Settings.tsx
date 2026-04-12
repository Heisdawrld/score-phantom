import { useAuth, useLogout } from '@/hooks/use-auth';
import { useLocation } from 'wouter';
import { Header } from '@/components/layout/Header';
import { ChevronLeft, User, Bell, Shield, Moon, LogOut, Smartphone, AlertTriangle, Check, X, Edit2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { fetchApi } from '@/lib/api';

export default function Settings() {
  const [, setLocation] = useLocation();
  const { data: user, isLoading } = useAuth();
  const logout = useLogout();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  if (isLoading) return <div className="min-h-screen bg-background" />;

  const email = (user as any)?.email || "";
  const username = (user as any)?.username || "";
  const displayUsername = username || (email ? email.split("@")[0] : "User");
  const initial = displayUsername.charAt(0).toUpperCase();

  const handleSaveUsername = async () => {
    if (!newUsername.trim()) return setIsEditingUsername(false);
    if (newUsername.trim() === username) return setIsEditingUsername(false);
    
    setIsSaving(true);
    try {
      await fetchApi('/auth/profile', {
        method: 'PUT',
        body: JSON.stringify({ username: newUsername.trim() }),
      });
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      toast({ title: "Username updated", description: "Your username has been saved." });
      setIsEditingUsername(false);
    } catch (err: any) {
      toast({ 
        title: "Update failed", 
        description: err.message || "Could not update username", 
        variant: "destructive" 
      });
    } finally {
      setIsSaving(false);
    }
  };


  return (
    <div className='min-h-screen bg-background pb-20'>
      <Header />
      <div className='max-w-2xl mx-auto px-4 pt-6'>
        
        {/* ── Header ── */}
        <div className='flex items-center gap-3 mb-8'>
          <button onClick={() => setLocation('/profile')} className='p-2 hover:bg-white/5 rounded-xl transition'>
            <ChevronLeft className='w-5 h-5' />
          </button>
          <div className='flex-1'>
            <h1 className='text-2xl font-black flex items-center gap-2'>
              Account Settings
            </h1>
            <p className='text-[11px] font-black text-white/25 uppercase tracking-widest mt-0.5'>Preferences & Security</p>
          </div>
        </div>

        {/* ── Profile Info Summary ── */}
        <motion.div 
          initial={{ opacity: 0, y: 16 }} 
          animate={{ opacity: 1, y: 0 }} 
          className="flex flex-col gap-4 p-5 rounded-[2rem] glass-card mb-8"
        >
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/10 border border-primary/20 flex items-center justify-center text-xl font-black text-primary shrink-0">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white mb-0.5">Primary Email</p>
              <p className="text-xs text-white/50 truncate font-mono">{email}</p>
            </div>
          </div>

          <div className="h-px w-full bg-white/[0.05]" />

          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white mb-1">Username</p>
              {isEditingUsername ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    placeholder="Enter new username"
                    className="flex-1 bg-black/50 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-primary/50"
                    autoFocus
                    disabled={isSaving}
                  />
                  <button 
                    onClick={handleSaveUsername} 
                    disabled={isSaving}
                    className="p-1.5 bg-primary/20 hover:bg-primary/30 text-primary rounded-lg transition"
                  >
                    <Check size={16} />
                  </button>
                  <button 
                    onClick={() => setIsEditingUsername(false)} 
                    disabled={isSaving}
                    className="p-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded-lg transition"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <p className="text-sm text-white/70 font-medium">@{displayUsername}</p>
                  <button 
                    onClick={() => {
                      setNewUsername(displayUsername);
                      setIsEditingUsername(true);
                    }}
                    className="flex items-center gap-1.5 text-xs font-bold text-primary hover:text-primary/80 transition px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20"
                  >
                    <Edit2 size={12} /> Edit
                  </button>
                </div>
              )}
            </div>
          </div>
        </motion.div>

        {/* ── Settings Groups ── */}
        <motion.div 
          initial={{ opacity: 0, y: 16 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.1 }}
          className="space-y-6"
        >
           {/* Section 1: Preferences */}
           <div>
              <h3 className="text-[11px] font-black text-white/30 uppercase tracking-[0.2em] ml-2 mb-3">App Preferences</h3>
              <div className="glass-card rounded-3xl overflow-hidden divide-y divide-white/[0.05]">
                 <div className="p-4 sm:p-5 flex items-center justify-between opacity-60">
                    <div className="flex items-center gap-3">
                       <div className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center shrink-0">
                         <Bell className="w-4 h-4 text-white/70" />
                       </div>
                       <div>
                          <p className="text-sm font-bold text-white">Push Notifications</p>
                          <p className="text-xs text-white/40 mt-0.5">Get alerts for match predictions.</p>
                       </div>
                    </div>
                    {/* Fake Toggle */}
                    <div className="w-12 h-6 rounded-full bg-white/[0.1] relative">
                       <div className="w-4 h-4 rounded-full bg-white/40 absolute left-1 top-1" />
                    </div>
                 </div>
                 
                 <div className="p-4 sm:p-5 flex items-center justify-between opacity-60">
                    <div className="flex items-center gap-3">
                       <div className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center shrink-0">
                         <Moon className="w-4 h-4 text-white/70" />
                       </div>
                       <div>
                          <p className="text-sm font-bold text-white">Dark Mode</p>
                          <p className="text-xs text-white/40 mt-0.5">ScorePhantom dark engine is permanent.</p>
                       </div>
                    </div>
                    {/* Fixed Active Toggle */}
                    <div className="w-12 h-6 rounded-full bg-primary relative">
                       <div className="w-4 h-4 rounded-full bg-black absolute right-1 top-1" />
                    </div>
                 </div>
              </div>
           </div>

           {/* Section 2: Account & Security */}
           <div>
              <h3 className="text-[11px] font-black text-white/30 uppercase tracking-[0.2em] ml-2 mb-3">Security</h3>
              <div className="glass-card rounded-3xl overflow-hidden divide-y divide-white/[0.05]">
                 <div className="p-4 sm:p-5 flex items-center justify-between opacity-60">
                    <div className="flex items-center gap-3">
                       <div className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center shrink-0">
                         <Shield className="w-4 h-4 text-white/70" />
                       </div>
                       <div>
                          <p className="text-sm font-bold text-white">Password Details</p>
                          <p className="text-xs text-white/40 mt-0.5">Managed through your google/email provider.</p>
                       </div>
                    </div>
                 </div>
                 
                 <div className="p-4 sm:p-5 flex items-center justify-between opacity-60">
                    <div className="flex items-center gap-3">
                       <div className="w-9 h-9 rounded-xl bg-white/[0.05] border border-white/[0.1] flex items-center justify-center shrink-0">
                         <Smartphone className="w-4 h-4 text-white/70" />
                       </div>
                       <div>
                          <p className="text-sm font-bold text-white">Active Sessions</p>
                          <p className="text-xs text-white/40 mt-0.5">1 current active session on this device.</p>
                       </div>
                    </div>
                 </div>
              </div>
           </div>
        </motion.div>
        
        {/* ── Destructive Actions ── */}
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.2 }} className="mt-10 space-y-3">
           <button 
             onClick={logout}
             className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:bg-white/[0.06] transition-all text-white/70 text-sm font-bold"
           >
              <LogOut size={16} /> Sign out of ScorePhantom
           </button>
           
           <button className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl bg-red-500/[0.03] border border-red-500/10 hover:bg-red-500/10 transition-all text-red-400 text-sm font-bold opacity-60">
              <AlertTriangle size={16} /> Delete Account
           </button>
           
           <p className="text-center text-[10px] text-white/20 mt-4 uppercase tracking-widest">ScorePhantom Core v2.0</p>
        </motion.div>

      </div>
    </div>
  );
}
