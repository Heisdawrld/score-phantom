import{motion,AnimatePresence}from"framer-motion";
import{useState,useEffect}from"react";
import{useLocation,useSearch}from"wouter";
import{useAuth,useInitPayment}from"@/hooks/use-auth";
import{Header}from"@/components/layout/Header";
import{Check,Crown,Zap,Shield,Loader2,ArrowLeft,Sparkles,TrendingUp,Users,Star,ChevronRight}from"lucide-react";
import{cn}from"@/lib/utils";

const FEATURES=[
  {icon:Zap,label:"Unlimited daily predictions — no cap"},
  {icon:TrendingUp,label:"Real odds + value bet detection"},
  {icon:Crown,label:"Daily ACCA Builder — safe and value picks"},
  {icon:Star,label:"PhantomChat — deep match analysis, any game"},
  {icon:Shield,label:"Track Record — backtested win rates"},
  {icon:Users,label:"Top Picks — multi-factor ranked predictions"},
];
const STATS=[
  {value:"68%",label:"Over/Under Hit"},
  {value:"73%",label:"BTTS Accuracy"},
  {value:"500+",label:"Picks Per Week"},
];

function PaymentSuccess({onContinue}:any){
  return(
    <div className="relative flex flex-col items-center justify-center min-h-[70vh] text-center px-6">
      <motion.div initial={{scale:0}} animate={{scale:1}} transition={{type:"spring",bounce:0.45,delay:0.1}}
        className="relative w-32 h-32 rounded-full flex items-center justify-center mb-8"
        style={{background:"radial-gradient(circle,rgba(16,231,116,0.2),transparent 70%)",boxShadow:"0 0 80px rgba(16,231,116,0.3)"}}>
        <div className="w-28 h-28 rounded-full border-4 border-primary flex items-center justify-center bg-[#080f0b]">
          <Check className="w-14 h-14 text-primary" strokeWidth={2.5}/>
        </div>
      </motion.div>
      <motion.h1 initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.35}}
        className="text-4xl font-black text-white mb-3">
        You're Premium! 🎉
      </motion.h1>
      <motion.p initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{delay:0.45}}
        className="text-white/40 text-sm leading-relaxed max-w-xs mb-8">
        Your account is fully activated. Enjoy unlimited predictions, ACCA Builder, Top Picks, PhantomChat and deep match analysis.
      </motion.p>
      <motion.button initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{delay:0.55}}
        onClick={onContinue} whileTap={{scale:0.97}}
        className="flex items-center gap-2 px-8 py-4 rounded-2xl font-black text-black text-base"
        style={{background:"linear-gradient(135deg,#10e774,#0bc95f)",boxShadow:"0 0 32px rgba(16,231,116,0.45)"}}>
        Go to Dashboard <ChevronRight className="w-5 h-5"/>
      </motion.button>
    </div>
  );
}

export default function Paywall(){
  const{data:user,isLoading,refetch}=useAuth();
  const initPayment=useInitPayment();
  const[,setLocation]=useLocation();
  const search=useSearch();
  const params=new URLSearchParams(search);
  const paymentStatus=params.get("payment");
  const[error,setError]=useState<string|null>(null);
  const[paymentDone,setPaymentDone]=useState(paymentStatus==="success");
  const[showTrial,setShowTrial]=useState(false);

  useEffect(()=>{
    if(paymentStatus==="success"){setPaymentDone(true);refetch();}
  },[paymentStatus]);

  const handleSubscribe=(plan: string = 'monthly')=>{
    setError(null);
    initPayment.mutate({ plan } as any,{
      onSuccess:(data:any)=>{
        if(data?.link){
          try{
            const url=new URL(data.link);
            if(!url.hostname.endsWith("flutterwave.com")){setError("Invalid payment link.");return;}
            window.location.href=data.link;
          }catch{setError("Invalid payment link.");}
        }else{setError("Payment link not returned. Try again.");}
      },
      onError:(err:any)=>setError(err.message||"Payment failed. Try again."),
    });
  };

  if(isLoading)return(
    <div className="min-h-screen bg-[#080f0b] flex items-center justify-center">
      <div className="w-12 h-12 rounded-full border-4 border-primary/20 border-t-primary animate-spin"/>
    </div>
  );

  return(
    <div className="min-h-screen bg-[#080f0b] relative overflow-hidden">
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-25%] left-[-15%] w-[70vw] h-[70vw] rounded-full" style={{background:"radial-gradient(circle,rgba(16,231,116,0.06),transparent 70%)",filter:"blur(80px)"}}/>
        <div className="absolute bottom-[-20%] right-[-10%] w-[55vw] h-[55vw] rounded-full" style={{background:"radial-gradient(circle,rgba(59,130,246,0.04),transparent 70%)",filter:"blur(90px)"}}/>
      </div>
      <div className="relative z-10">
        <Header/>
        <AnimatePresence mode="wait">
          {paymentDone?(
            <motion.div key="success" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>
              <PaymentSuccess onContinue={()=>setLocation("/")}/>
            </motion.div>
          ):(
            <motion.div key="paywall" initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-12}}
              transition={{duration:0.25}}
              className="max-w-md mx-auto px-4 pb-16 pt-4">
              <button onClick={()=>setLocation("/")} className="flex items-center gap-1.5 text-sm text-white/25 hover:text-white/50 transition-colors mb-7">
                <ArrowLeft className="w-4 h-4"/> Back
              </button>
              <div className="text-center mb-7">
                <motion.div initial={{opacity:0,scale:0.9}} animate={{opacity:1,scale:1}} transition={{delay:0.1}}
                  className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20 mb-4">
                  <Sparkles className="w-3.5 h-3.5 text-primary"/>
                  <span className="text-xs font-black text-primary uppercase tracking-widest">Premium Access</span>
                </motion.div>
                <motion.h1 initial={{opacity:0,y:16}} animate={{opacity:1,y:0}} transition={{delay:0.15}}
                  className="text-4xl font-black text-white leading-tight">
                  Unlock the{" "}<span className="text-primary">Algorithm</span>
                </motion.h1>
                <motion.p initial={{opacity:0,y:12}} animate={{opacity:1,y:0}} transition={{delay:0.2}}
                  className="text-white/35 text-sm mt-3 leading-relaxed">
                  {user?.access_status==="trial"?"You're on free trial. Upgrade before it ends.":"Data-powered predictions, daily picks & real value edges."}
                </motion.p>
              </div>
              <motion.div initial={{opacity:0,y:10}} animate={{opacity:1,y:0}} transition={{delay:0.25}}
                className="grid grid-cols-3 gap-2 mb-5">
                {STATS.map(({value,label},i)=>(
                  <motion.div key={label} initial={{opacity:0,scale:0.9}} animate={{opacity:1,scale:1}} transition={{delay:0.3+i*0.07}}
                    className="text-center p-3 rounded-xl bg-white/4 border border-white/8">
                    <p className="text-xl font-black text-primary">{value}</p>
                    <p className="text-[9px] text-white/30 uppercase tracking-wide mt-0.5">{label}</p>
                  </motion.div>
                ))}
              </motion.div>
              <motion.div initial={{opacity:0,y:20}} animate={{opacity:1,y:0}} transition={{delay:0.3}}
                className="relative rounded-3xl overflow-hidden border border-primary/30 mb-5"
                style={{background:"linear-gradient(145deg,#0c2018 0%,#080f0b 100%)",boxShadow:"0 0 50px rgba(16,231,116,0.1),inset 0 1px 0 rgba(16,231,116,0.08)"}}>
                <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent"/>
                <div className="flex justify-center pt-5">
                  <span className="flex items-center gap-1.5 text-[10px] font-black text-primary bg-primary/10 border border-primary/25 px-3 py-1 rounded-full uppercase tracking-widest">
                    <Crown className="w-3 h-3"/> Most Popular
                  </span>
                </div>
                <div className="text-center py-5">
                  <div className="flex items-start justify-center gap-1">
                    <span className="text-xl font-bold text-white/40 mt-2">₦</span>
                    <span className="text-6xl font-black text-white tracking-tight">3,000</span>
                    <span className="text-white/25 text-sm self-end mb-2">/mo</span>
                  </div>
                  <p className="text-[10px] text-white/20 mt-1">Cancel anytime · Instant activation</p>
                </div>
                <div className="px-6 pb-5 space-y-3">
                  {FEATURES.map(({icon:Icon,label},i)=>(
                    <motion.div key={label} initial={{opacity:0,x:-12}} animate={{opacity:1,x:0}} transition={{delay:0.35+i*0.06}}
                      className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-xl bg-primary/12 border border-primary/20 flex items-center justify-center shrink-0">
                        <Icon className="w-3.5 h-3.5 text-primary"/>
                      </div>
                      <span className="text-sm text-white/70">{label}</span>
                    </motion.div>
                  ))}
                </div>
                {(paymentStatus==="failed"||paymentStatus==="error"||error)&&(
                  <div className="mx-6 mb-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-center">
                    <p className="text-xs text-red-400">{error||"Payment not completed. Please try again."}</p>
                  </div>
                )}
                <div className="px-6 pb-6">
                  <motion.button onClick={() => handleSubscribe('monthly')} disabled={initPayment.isPending} whileTap={{scale:0.97}}
                    className="relative w-full py-4 rounded-2xl font-black text-black text-base overflow-hidden disabled:opacity-60 transition-all mb-3"
                    style={{background:"linear-gradient(135deg,#10e774 0%,#0bc95f 100%)",boxShadow:"0 0 30px rgba(16,231,116,0.35)"}}>
                    <motion.div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                      animate={{x:["-100%","100%"]}} transition={{duration:2.5,repeat:Infinity,ease:"linear"}}/>
                    <span className="relative flex items-center justify-center gap-2">
                      {initPayment.isPending?(
                        <><Loader2 className="w-5 h-5 animate-spin"/>Redirecting to payment...</>
                      ):(
                        <><Crown className="w-5 h-5"/>Pay ₦3,000 for 1 Month</>
                      )}
                    </span>
                  </motion.button>

                  <motion.button onClick={() => handleSubscribe('weekly')} disabled={initPayment.isPending} whileTap={{scale:0.97}}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-bold text-[#10e774] bg-[#10e774]/10 hover:bg-[#10e774]/20 transition-all disabled:opacity-50">
                    Or try 1 Week for ₦1,000
                  </motion.button>
                  <div className="flex items-center justify-center gap-4 mt-4">
                    <span className="flex items-center gap-1 text-[10px] text-white/20"><Shield className="w-3 h-3 text-primary/40"/>SSL Secured</span>
                    <span className="text-white/10">•</span>
                    <span className="flex items-center gap-1 text-[10px] text-white/20"><Zap className="w-3 h-3 text-primary/40"/>Instant access</span>
                    <span className="text-white/10">•</span>
                    <span className="text-[10px] text-white/20">No contract</span>
                  </div>
                </div>
              </motion.div>
              <motion.div initial={{opacity:0}} animate={{opacity:1}} transition={{delay:0.6}}
                className="border border-white/6 rounded-2xl p-5 mb-5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-1 h-full bg-primary/40 rounded-l-2xl"/>
                <p className="text-sm text-white/60 italic leading-relaxed pl-3">
                  "The ACCA predictions are insanely accurate. Made back my subscription in the first 3 days."
                </p>
                <p className="text-xs text-white/25 mt-2 font-semibold pl-3">— Chukwu E., Lagos</p>
              </motion.div>
              {(user as any)?.access_status==="trial"&&(
                <button onClick={()=>setLocation("/")}
                  className="w-full text-center text-xs text-white/15 hover:text-white/35 transition-colors py-3">
                  Continue with free trial →
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
